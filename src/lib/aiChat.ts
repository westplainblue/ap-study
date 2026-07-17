import type { AiProvider } from "./aiConfig";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  /** codexプロバイダ用: ローカルブリッジのベースURL */
  baseUrl?: string;
}

/** SSEレスポンスを1行ずつ読み、data: ペイロードをコールバックに渡す */
async function readSse(
  res: Response,
  onData: (payload: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel();
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        onData(trimmed.slice(5).trim());
      }
    }
  }
}

async function throwApiError(res: Response, provider: string): Promise<never> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? detail;
  } catch {
    /* JSONでないエラーボディは無視 */
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${provider}のAPIキーが無効です: ${detail}`);
  }
  if (res.status === 429) {
    throw new Error(`レート制限か残高不足です: ${detail}`);
  }
  throw new Error(`${provider}のAPIエラー: ${detail}`);
}

/** OpenAI互換(OpenAI / xAI)の chat completions ストリーミング */
async function streamOpenAiCompatible(
  baseUrl: string,
  providerName: string,
  opts: StreamOptions
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok) await throwApiError(res, providerName);
  await readSse(
    res,
    (payload) => {
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string") opts.onDelta(delta);
      } catch {
        /* 不完全なチャンクは無視 */
      }
    },
    opts.signal
  );
}

/** Anthropic Messages API ストリーミング(ブラウザ直接アクセス用ヘッダー付き) */
async function streamAnthropic(opts: StreamOptions): Promise<void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 2048,
      stream: true,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) await throwApiError(res, "Claude");
  await readSse(
    res,
    (payload) => {
      try {
        const json = JSON.parse(payload);
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          opts.onDelta(json.delta.text);
        }
        if (json.type === "error") {
          throw new Error(json.error?.message ?? "APIエラー");
        }
      } catch (e) {
        if (e instanceof SyntaxError) return; // 不完全なチャンク
        throw e;
      }
    },
    opts.signal
  );
}

/** プロバイダを問わない共通入口。onDeltaに逐次テキストが流れる */
export async function streamChat(opts: StreamOptions): Promise<void> {
  switch (opts.provider) {
    case "codex": {
      const base = (opts.baseUrl || "http://127.0.0.1:8399/v1").replace(/\/+$/, "");
      try {
        return await streamOpenAiCompatible(base, "Codexブリッジ", opts);
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(
            "Codexブリッジに接続できません。Macで `npm run codex-bridge` が起動しているか確認してください。"
          );
        }
        throw e;
      }
    }
    case "openai":
      return streamOpenAiCompatible("https://api.openai.com/v1", "OpenAI", opts);
    case "xai":
      return streamOpenAiCompatible("https://api.x.ai/v1", "Grok", opts);
    case "anthropic":
      return streamAnthropic(opts);
  }
}
