/**
 * AIチャットの設定。
 *
 * セキュリティ方針:
 * - APIキーは学習データ(ap-study:v1)とは別のキーで localStorage にのみ保存する。
 *   → クラウド同期・JSONエクスポートの対象に決して含まれない。
 * - キーが送信されるのは各AIプロバイダの公式APIエンドポイントのみ。
 */
export type AiProvider = "codex" | "openai" | "anthropic" | "xai";

export interface AiConfig {
  provider: AiProvider;
  apiKeys: Partial<Record<AiProvider, string>>;
  models: Partial<Record<AiProvider, string>>;
  /** Codexローカルブリッジのベース URL(既定: http://127.0.0.1:8399/v1) */
  codexBaseUrl?: string;
}

const KEY = "ap-study:ai";

export const CODEX_DEFAULT_URL = "http://127.0.0.1:8399/v1";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  codex: "Codex(ChatGPTサブスク/ローカル)",
  openai: "OpenAI(APIキー)",
  anthropic: "Claude (Anthropic)",
  xai: "Grok (xAI)",
};

// 2026年7月時点の「安価×十分賢い」バランスの既定値(設定画面で変更可能)
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  codex: "default",
  openai: "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5",
  xai: "grok-4.5",
};

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { provider: "codex", apiKeys: {}, models: {} };
    const c = JSON.parse(raw) as AiConfig;
    c.apiKeys ??= {};
    c.models ??= {};
    c.provider ??= "codex";
    return c;
  } catch {
    return { provider: "codex", apiKeys: {}, models: {} };
  }
}

export function saveAiConfig(c: AiConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

/** 現在のプロバイダで利用可能か(Codexはブリッジ接続なのでキー不要) */
export function aiReady(c = loadAiConfig()): boolean {
  if (c.provider === "codex") return true;
  return Boolean(c.apiKeys[c.provider]);
}

export function activeModel(c = loadAiConfig()): string {
  return c.models[c.provider] || DEFAULT_MODELS[c.provider];
}

/** 表示用にキーをマスクする(先頭6文字+末尾4文字) */
export function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
