import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { streamChat, type ChatMessage } from "../lib/aiChat";
import {
  activeModel,
  aiReady,
  loadAiConfig,
  PROVIDER_LABEL,
  saveAiConfig,
} from "../lib/aiConfig";
import { getAiContext, subscribeAiContext } from "../lib/aiContext";
import {
  MARKS_PROMPT,
  parseMarks,
  setAiMarks,
  stripMarksBlock,
} from "../lib/aiHighlight";
import {
  isCaretOnFirstLine,
  isCaretOnLastLine,
  loadHistory,
  pushInto,
  saveHistory,
} from "../lib/aiHistory";
import { IconSend, IconSparkle, IconX } from "./Icons";

function buildSystemPrompt(contextText: string | undefined, marks: boolean): string {
  const base =
    "あなたは応用情報技術者試験(AP)の学習を支援するアシスタントです。" +
    "初学者にも分かる言葉で、正確かつ簡潔に説明してください。" +
    "専門用語には短い補足を添え、覚え方のコツがあれば紹介してください。" +
    "回答はプレーンテキストで、見出し記号や過度な箇条書きは使わず読みやすい長さにまとめてください。";
  const withCtx = contextText ? `${base}\n\n${contextText}` : base;
  // マーキングは問題を共有しているときだけ意味を持つ
  return marks && contextText ? withCtx + "\n" + MARKS_PROMPT : withCtx;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ターミナル風のプロンプト履歴(↑↓でたどる)。histIdx=null は「最新(下書き)」
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const draftRef = useRef("");
  const ctx = useSyncExternalStore(subscribeAiContext, getAiContext, getAiContext);
  const [marksOn, setMarksOn] = useState(() => loadAiConfig().marks === true);

  const config = loadAiConfig();
  const ready = aiReady(config);

  const toggleMarks = () => {
    const next = !marksOn;
    setMarksOn(next);
    const c = loadAiConfig();
    c.marks = next;
    saveAiConfig(c);
    if (!next) setAiMarks([]); // OFFにしたら表示中のマークも消す
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  // 開いている間は本文側にレイアウトを譲る(PCは横並び、スマホは下余白)
  useEffect(() => {
    document.body.classList.toggle("ai-open", open);
    return () => document.body.classList.remove("ai-open");
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    const nextHist = pushInto(history, text);
    if (nextHist !== history) {
      setHistory(nextHist);
      saveHistory(nextHist);
    }
    setHistIdx(null);
    draftRef.current = "";
    setError(null);
    const chatMessages = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages([...chatMessages, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let full = ""; // マーク抽出用に返答全文を持つ
    try {
      await streamChat({
        provider: config.provider,
        apiKey: config.apiKeys[config.provider] ?? "",
        model: activeModel(config),
        baseUrl: config.codexBaseUrl,
        system: buildSystemPrompt(ctx?.text, marksOn),
        messages: chatMessages,
        signal: ac.signal,
        onDelta: (t) => {
          full += t;
          setMessages((cur) => {
            const copy = [...cur];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              role: "assistant",
              content: last.content + t,
            };
            return copy;
          });
        },
      });
      // 返答が完了したらマークを解釈して発行(無ければ前回のマークを消す)
      if (marksOn) setAiMarks(parseMarks(full));
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

  const caretToEnd = () => {
    requestAnimationFrame(() => {
      const ta = inputRef.current;
      if (ta) {
        const n = ta.value.length;
        ta.setSelectionRange(n, n);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
      return;
    }
    // ↑↓でプロンプト履歴をたどる(ターミナルと同じ操作感)。
    // 修飾キー付き・範囲選択中・複数行の中間行では通常のカーソル移動を邪魔しない。
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const ta = e.currentTarget;
    const collapsed = ta.selectionStart === ta.selectionEnd;
    if (e.key === "ArrowUp") {
      if (!collapsed || !isCaretOnFirstLine(input, ta.selectionStart)) return;
      if (history.length === 0) return;
      e.preventDefault();
      const idx = histIdx === null ? history.length - 1 : histIdx - 1;
      if (idx < 0) return; // 最古で停止
      if (histIdx === null) draftRef.current = input; // 下書きを退避
      setHistIdx(idx);
      setInput(history[idx]);
      caretToEnd();
    } else if (e.key === "ArrowDown") {
      if (histIdx === null) return; // 履歴をたどっていないときは通常動作
      if (!collapsed || !isCaretOnLastLine(input, ta.selectionEnd)) return;
      e.preventDefault();
      if (histIdx < history.length - 1) {
        setHistIdx(histIdx + 1);
        setInput(history[histIdx + 1]);
      } else {
        setHistIdx(null);
        setInput(draftRef.current); // 最新まで戻ったら下書きを復元
      }
      caretToEnd();
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
                setAiMarks([]);
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
              {m.role === "assistant" ? stripMarksBlock(m.content) : m.content}
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

        {ready && ctx && (
          <label className="ai-marks-toggle small" title="AIが解説時に問題文・選択肢の根拠箇所へ蛍光マーカー/下線を付けます">
            <input type="checkbox" checked={marksOn} onChange={toggleMarks} />
            重要箇所に印をつけてもらう
          </label>
        )}
        <div className="ai-input">
          <textarea
            rows={2}
            value={input}
            ref={inputRef}
            onChange={(e) => {
              setInput(e.target.value);
              if (histIdx !== null) setHistIdx(null); // 編集したらそれを新しい下書きに
            }}
            onKeyDown={onKeyDown}
            placeholder={ready ? "質問を入力(⌘+Enter送信 / ↑で履歴)" : "APIキー未設定です"}
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
