import { useEffect, useRef, useState } from "react";
import {
  codexLogout,
  fetchCodexAccount,
  fetchCodexLoginStatus,
  isLoopbackBridge,
  startCodexLogin,
  type CodexAccount,
} from "../lib/codexAuth";

const PLAN_LABEL: Record<string, string> = {
  free: "ChatGPT Free",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
};

const LOGIN_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

type Panel =
  | { kind: "checking" }
  | { kind: "connected"; planType: string | null; email: string | null }
  | { kind: "disconnected"; notice?: string }
  | { kind: "loggingIn"; deviceCode?: { verificationUrl: string; userCode: string } }
  | { kind: "error"; code: string; message: string };

function errorHelp(code: string): string | null {
  switch (code) {
    case "cli_not_found":
      return "Codex CLIが見つかりません。https://developers.openai.com/codex/cli の手順でインストールし、ブリッジを再起動してください。";
    case "bridge_unreachable":
      return null; // メッセージ自体に起動案内を含む
    case "bridge_auth_failed":
      return "詳細設定のブリッジ接続トークンが、ブリッジ起動時の AP_STUDY_CODEX_BRIDGE_TOKEN と一致しているか確認してください。";
    case "app_server_failed":
      return "Codex App Serverを開始できませんでした。ターミナルのブリッジのログを確認してください。";
    default:
      return null;
  }
}

/** Codexプロバイダの接続状態表示とChatGPTログイン操作 */
export default function CodexAccountPanel() {
  const [panel, setPanel] = useState<Panel>({ kind: "checking" });
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const check = async () => {
    setPanel({ kind: "checking" });
    const account: CodexAccount = await fetchCodexAccount();
    if (account.state === "connected") {
      setPanel({ kind: "connected", planType: account.planType, email: account.email });
    } else if (account.state === "disconnected") {
      setPanel({ kind: "disconnected" });
    } else {
      setPanel({ kind: "error", code: account.code, message: account.message });
    }
  };

  useEffect(() => {
    void check();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async () => {
    stopPolling();
    try {
      const mode = isLoopbackBridge() ? "browser" : "deviceCode";
      const start = await startCodexLogin(mode);
      if (start.mode === "deviceCode" && start.verificationUrl && start.userCode) {
        setPanel({
          kind: "loggingIn",
          deviceCode: { verificationUrl: start.verificationUrl, userCode: start.userCode },
        });
      } else if (start.authUrl) {
        setPanel({ kind: "loggingIn" });
        window.open(start.authUrl, "_blank", "noopener");
      } else {
        setPanel({ kind: "error", code: "app_server_failed", message: "ログインURLを取得できませんでした" });
        return;
      }

      const loginId = start.loginId;
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) {
          stopPolling();
          setPanel({
            kind: "disconnected",
            notice: "ログインの完了を確認できませんでした(タイムアウト)。もう一度お試しください。",
          });
          return;
        }
        if (!loginId) return;
        const st = await fetchCodexLoginStatus(loginId);
        if (st.status === "success") {
          stopPolling();
          void check();
        } else if (st.status === "failed") {
          stopPolling();
          setPanel({
            kind: "disconnected",
            notice: st.message || "ログインに失敗しました。",
          });
        }
      }, POLL_INTERVAL_MS);
    } catch (e) {
      const err = e as Error & { code?: string };
      setPanel({ kind: "error", code: err.code ?? "unknown", message: err.message });
    }
  };

  const logout = async () => {
    if (!window.confirm("ChatGPTからログアウトしますか?(Codex CLI全体のログアウトになります)")) {
      return;
    }
    try {
      await codexLogout();
      setPanel({ kind: "disconnected" });
    } catch (e) {
      const err = e as Error & { code?: string };
      setPanel({ kind: "error", code: err.code ?? "unknown", message: err.message });
    }
  };

  if (panel.kind === "checking") {
    return (
      <p className="muted small" style={{ marginBottom: 10 }}>
        Codexの接続状態を確認しています…
      </p>
    );
  }

  if (panel.kind === "connected") {
    const plan = panel.planType ? PLAN_LABEL[panel.planType] ?? `ChatGPT(${panel.planType})` : null;
    return (
      <div
        style={{
          background: "var(--success-bg)",
          borderRadius: 8,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <p className="small" style={{ color: "var(--success-text)", fontWeight: 700 }}>
          ✓ {plan ? `${plan}で接続済み` : "ChatGPTで接続済み"}
        </p>
        {panel.email && (
          <p className="small" style={{ color: "var(--success-text)" }}>
            {panel.email}
          </p>
        )}
        <p className="muted small" style={{ marginTop: 4 }}>
          APIキーは不要です。認証はCodexが管理し、トークンがブラウザへ渡ることはありません。
        </p>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => void logout()}>
          ログアウト
        </button>
      </div>
    );
  }

  if (panel.kind === "loggingIn") {
    return (
      <div className="card" style={{ marginBottom: 10, padding: "10px 12px" }}>
        {panel.deviceCode ? (
          <>
            <p className="small" style={{ fontWeight: 600 }}>スマホ等でのログイン手順</p>
            <p className="small" style={{ lineHeight: 1.8 }}>
              1. 別の端末で{" "}
              <a href={panel.deviceCode.verificationUrl} target="_blank" rel="noopener noreferrer">
                {panel.deviceCode.verificationUrl}
              </a>{" "}
              を開く
              <br />
              2. コード{" "}
              <strong style={{ fontFamily: "monospace", fontSize: 16 }}>
                {panel.deviceCode.userCode}
              </strong>{" "}
              を入力
            </p>
          </>
        ) : (
          <p className="small">
            開いたChatGPTのページでログインを完了してください。完了すると自動的に接続されます…
          </p>
        )}
        <button
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            stopPolling();
            void check();
          }}
        >
          状態を再確認
        </button>
      </div>
    );
  }

  if (panel.kind === "error") {
    const help = errorHelp(panel.code);
    return (
      <div
        style={{
          background: "var(--danger-bg)",
          borderRadius: 8,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <p className="small" style={{ color: "var(--danger-text)" }}>{panel.message}</p>
        {help && (
          <p className="muted small" style={{ marginTop: 4 }}>
            {help}
          </p>
        )}
        <button className="btn" style={{ marginTop: 8 }} onClick={() => void check()}>
          再確認
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10 }}>
      {panel.notice && (
        <p className="small" style={{ color: "var(--warning-text)", marginBottom: 6 }}>
          {panel.notice}
        </p>
      )}
      <p className="muted small" style={{ marginBottom: 8 }}>
        ChatGPTに未ログインです。APIキーは不要で、ChatGPTアカウント(サブスク枠)でログインします。
      </p>
      <button className="btn btn-primary btn-block" onClick={() => void login()}>
        ChatGPTでログイン
      </button>
    </div>
  );
}
