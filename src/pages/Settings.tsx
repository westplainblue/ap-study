import { useRef, useState } from "react";
import {
  CODEX_DEFAULT_URL,
  DEFAULT_MODELS,
  loadAiConfig,
  maskKey,
  PROVIDER_LABEL,
  saveAiConfig,
  type AiConfig,
  type AiProvider,
} from "../lib/aiConfig";
import {
  dueReviewIds,
  exportJson,
  importJson,
  loadState,
  resetState,
  saveState,
} from "../lib/progress";
import { syncAvailable, syncNow } from "../lib/sync";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => chars[b % chars.length])
    .join("");
}

export default function Settings() {
  const [state, setState] = useState(loadState());
  const [joinCode, setJoinCode] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ai, setAi] = useState(loadAiConfig());
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);

  const updateAi = (mutate: (c: AiConfig) => void) => {
    const c = loadAiConfig();
    mutate(c);
    saveAiConfig(c);
    setAi(loadAiConfig());
  };

  const update = (mutate: (s: ReturnType<typeof loadState>) => void) => {
    const s = loadState();
    mutate(s);
    saveState(s);
    setState(loadState());
  };

  const doSync = async () => {
    setSyncing(true);
    const result = await syncNow();
    setSyncMessage(result.message);
    setSyncing(false);
    setState(loadState());
  };

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ap-study-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImportFile = async (file: File) => {
    try {
      importJson(await file.text());
      setState(loadState());
      window.alert("進捗データを読み込みました。");
    } catch (e) {
      window.alert(`読み込みに失敗しました: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 14 }}>設定</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>試験日</p>
        <input
          type="date"
          value={state.settings.examDate ?? ""}
          onChange={(e) =>
            update((s) => {
              s.settings.examDate = e.target.value || undefined;
            })
          }
          style={{ width: "100%" }}
        />
        <p className="muted small" style={{ marginTop: 6 }}>
          ホーム画面にカウントダウンが表示されます。
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>クラウド同期</p>
        {!syncAvailable && (
          <p className="muted small" style={{ marginBottom: 8 }}>
            未設定です。Supabaseプロジェクトを作成し、.env に VITE_SUPABASE_URL と
            VITE_SUPABASE_ANON_KEY を設定すると有効になります(手順は README 参照)。
          </p>
        )}
        {state.settings.syncCode ? (
          <div style={{ marginBottom: 10 }}>
            <p className="small muted">この端末の同期コード</p>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 22,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              {state.settings.syncCode}
            </p>
            <p className="muted small">
              他の端末の設定画面でこのコードを入力すると、同じ学習データに同期されます。
            </p>
          </div>
        ) : (
          <button
            className="btn btn-block"
            style={{ marginBottom: 10 }}
            onClick={() =>
              update((s) => {
                s.settings.syncCode = randomCode();
              })
            }
          >
            同期コードを発行する
          </button>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            placeholder="他端末のコードを入力"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            style={{ flex: 1 }}
          />
          <button
            className="btn"
            disabled={joinCode.trim().length < 4}
            onClick={() => {
              update((s) => {
                s.settings.syncCode = joinCode.trim();
              });
              setJoinCode("");
            }}
          >
            使用
          </button>
        </div>
        <button
          className="btn btn-primary btn-block"
          disabled={!syncAvailable || !state.settings.syncCode || syncing}
          onClick={doSync}
        >
          {syncing ? "同期中…" : "今すぐ同期"}
        </button>
        {syncMessage && (
          <p className="small" style={{ marginTop: 8 }}>
            {syncMessage}
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>AIチャット</p>
        <p className="muted small" style={{ marginBottom: 10 }}>
          画面右上の✨ボタンで開くAIアシスタントの接続先です。APIキーは
          <strong>この端末のブラウザ内にのみ</strong>
          保存され、クラウド同期・エクスポートには一切含まれません。送信先は各社の公式APIだけです。
        </p>
        <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>使用するAI</p>
        <select
          value={ai.provider}
          onChange={(e) =>
            updateAi((c) => {
              c.provider = e.target.value as AiProvider;
            })
          }
          style={{ width: "100%", marginBottom: 10 }}
        >
          {(Object.keys(PROVIDER_LABEL) as AiProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </select>

        {ai.provider === "codex" ? (
          <div style={{ marginBottom: 10 }}>
            <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
              ブリッジURL
            </p>
            <input
              value={ai.codexBaseUrl ?? ""}
              placeholder={CODEX_DEFAULT_URL}
              onChange={(e) =>
                updateAi((c) => {
                  const v = e.target.value.trim();
                  if (v) c.codexBaseUrl = v;
                  else delete c.codexBaseUrl;
                })
              }
              style={{ width: "100%" }}
            />
            <p className="muted small" style={{ marginTop: 6, lineHeight: 1.7 }}>
              ChatGPTサブスクのCodex枠を使う方式です(APIキー不要)。Macで
              <code> npm run codex-bridge </code>
              を起動しておく必要があります(要 Codex CLI+ChatGPTサインイン)。
              手順と注意点(規約上の位置づけ・スマホから使う場合)はREADME参照。
            </p>
          </div>
        ) : ai.apiKeys[ai.provider] ? (
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
          >
            <span className="small" style={{ fontFamily: "monospace", flex: 1 }}>
              キー設定済み: {maskKey(ai.apiKeys[ai.provider]!)}
            </span>
            <button
              className="btn"
              onClick={() =>
                updateAi((c) => {
                  delete c.apiKeys[c.provider];
                })
              }
            >
              削除
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type={showKey ? "text" : "password"}
              placeholder={`${PROVIDER_LABEL[ai.provider]}のAPIキー`}
              value={keyDraft}
              autoComplete="off"
              onChange={(e) => setKeyDraft(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隠す" : "表示"}
            </button>
            <button
              className="btn btn-primary"
              disabled={keyDraft.trim() === ""}
              onClick={() => {
                updateAi((c) => {
                  c.apiKeys[c.provider] = keyDraft.trim();
                });
                setKeyDraft("");
                setShowKey(false);
              }}
            >
              保存
            </button>
          </div>
        )}

        <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>モデル</p>
        <input
          value={ai.models[ai.provider] ?? ""}
          placeholder={`${DEFAULT_MODELS[ai.provider]}(推奨)`}
          onChange={(e) =>
            updateAi((c) => {
              const v = e.target.value.trim();
              if (v) c.models[c.provider] = v;
              else delete c.models[c.provider];
            })
          }
          style={{ width: "100%" }}
        />
        <p className="muted small" style={{ marginTop: 8 }}>
          空欄なら推奨モデル({DEFAULT_MODELS[ai.provider]}
          )を使います。共有端末ではキーを保存しないでください。
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>バックアップ</p>
        <p className="muted small" style={{ marginBottom: 10 }}>
          解答履歴 {state.attempts.length}件 / 復習キュー{" "}
          {Object.keys(state.review).length}問(期日到来 {dueReviewIds(state).length}問)
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={download}>
            エクスポート
          </button>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => fileRef.current?.click()}
          >
            インポート
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 8 }}>データの初期化</p>
        <button
          className="btn btn-block"
          style={{ color: "var(--danger-text)", borderColor: "var(--danger-text)" }}
          onClick={() => {
            if (window.confirm("学習履歴・復習キューをすべて削除します。よろしいですか?")) {
              resetState();
              setState(loadState());
            }
          }}
        >
          すべての学習データを削除
        </button>
      </div>

      <p className="muted small" style={{ marginTop: 16 }}>
        収録問題の出典: 応用情報技術者試験 過去問題(独立行政法人情報処理推進機構)。
        解説は本アプリ独自のものです。
      </p>
    </div>
  );
}
