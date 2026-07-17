import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { streamChat, type ChatMessage } from "../lib/aiChat";
import {
  activeModel,
  aiReady,
  loadAiConfig,
  PROVIDER_LABEL,
} from "../lib/aiConfig";
import { getAiContext, subscribeAiContext } from "../lib/aiContext";
import { IconSend, IconSparkle, IconX } from "./Icons";

function buildSystemPrompt(contextText: string | undefined): string {
  const base =
    "あなたは応用情報技術者試験(AP)の学習を支援するアシスタントです。" +
    "初学者にも分かる言葉で、正確かつ簡潔に説明してください。" +
    "専門用語には短い補足を添え、覚え方のコツがあれば紹介してください。" +
    "回答はプレーンテキストで、見出し記号や過度な箇条書きは使わず読みやすい長さにまとめてください。";
  return contextText ? `${base}\n\n${contextText}` : base;
}

/** 右上の起動ボタン+チャットパネル(PC: 右ドロワー / スマホ: 下シート) */
export default function AiChat() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ctx = useSyncExternalStore(subscribeAiContext, getAiContext, getAiContext);

  const config = loadAiConfig();
  const ready = aiReady(config);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    setError(null);
    const history = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamChat({
        provider: config.provider,
        apiKey: config.apiKeys[config.provider] ?? "",
        model: activeModel(config),
        baseUrl: config.codexBaseUrl,
        system: buildSystemPrompt(ctx?.text),
        messages: history,
        signal: ac.signal,
        onDelta: (t) =>
          setMessages((cur) => {
            const copy = [...cur];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              role: "assistant",
              content: last.content + t,
            };
            return copy;
          }),
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      setMessages((cur) =>
        cur.length > 0 && cur[cur.length - 1].content === ""
          ? cur.slice(0, -1)
          : cur
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <>
      <button
        className="ai-fab"
        aria-label="AIに質問する"
        onClick={() => setOpen((v) => !v)}
      >
        <IconSparkle size={20} />
      </button>

      <div
        className={`ai-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
      />

      <div className={`ai-panel ${open ? "open" : ""}`} role="dialog" aria-label="AIチャット">
        <div className="ai-header">
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <IconSparkle size={17} /> AIに質問
          </span>
          <span className="muted" style={{ fontSize: 11, flex: 1, textAlign: "right" }}>
            {ready ? `${PROVIDER_LABEL[config.provider]} / ${activeModel(config)}` : "未設定"}
          </span>
          {messages.length > 0 && (
            <button
              className="small muted"
              style={{ padding: "2px 6px" }}
              disabled={busy}
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
            >
              クリア
            </button>
          )}
          <button aria-label="閉じる" onClick={() => setOpen(false)} style={{ padding: 4 }}>
            <IconX size={18} />
          </button>
        </div>

        {ctx && (
          <div className="ai-context-chip" title="この内容がAIに共有されます">
            📎 {ctx.label} を共有中
          </div>
        )}

        <div className="ai-messages" ref={listRef}>
          {messages.length === 0 && (
            <div className="muted small" style={{ lineHeight: 1.8 }}>
              {ready ? (
                <>
                  疑問に思ったことをそのまま聞いてください。
                  {ctx
                    ? "いま表示中の問題は自動で共有されています。「なぜイが正解?」「この用語をもっと簡単に」のように聞けます。"
                    : "問題を解いている画面から開くと、その問題を踏まえて答えます。"}
                </>
              ) : (
                <>
                  AIチャットを使うには、設定画面でAPIキーを登録してください。
                  <button
                    className="btn btn-block"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setOpen(false);
                      navigate("/settings");
                    }}
                  >
                    設定画面を開く
                  </button>
                </>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "ai-msg ai-msg-user" : "ai-msg ai-msg-assistant"}
            >
              {m.content}
              {busy && i === messages.length - 1 && m.role === "assistant" && (
                <span className="ai-cursor">▍</span>
              )}
            </div>
          ))}
          {error && (
            <p className="small" style={{ color: "var(--danger-text)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="ai-input">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={ready ? "質問を入力(⌘+Enterで送信)" : "APIキー未設定です"}
            disabled={!ready}
            style={{ flex: 1, resize: "none" }}
          />
          {busy ? (
            <button className="btn" onClick={() => abortRef.current?.abort()}>
              停止
            </button>
          ) : (
            <button
              className="btn btn-primary"
              aria-label="送信"
              disabled={!ready || input.trim() === ""}
              onClick={() => void send()}
            >
              <IconSend size={18} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
