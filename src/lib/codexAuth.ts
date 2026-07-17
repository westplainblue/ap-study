/**
 * Codexブリッジの認証API(/v1/codex/*)クライアント。
 * ChatGPTのトークンはブリッジ/App Server側で管理され、ここには一切渡らない。
 */
import { CODEX_DEFAULT_URL, loadAiConfig, type AiConfig } from "./aiConfig";

export type CodexAccount =
  | { state: "connected"; planType: string | null; email: string | null }
  | { state: "disconnected" }
  | { state: "error"; code: string; message: string };

export interface CodexLoginStart {
  loginId: string | null;
  mode: "browser" | "deviceCode";
  authUrl?: string | null;
  verificationUrl?: string;
  userCode?: string;
}

function endpoint(cfg: AiConfig = loadAiConfig()): {
  base: string;
  headers: Record<string, string>;
} {
  const base = (cfg.codexBaseUrl || CODEX_DEFAULT_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (cfg.apiKeys.codex) headers.Authorization = `Bearer ${cfg.apiKeys.codex}`;
  return { base, headers };
}

/** ブリッジURLがローカル(同一マシン)か。falseならデバイスコード方式でログインする */
export function isLoopbackBridge(cfg: AiConfig = loadAiConfig()): boolean {
  try {
    const host = new URL(cfg.codexBaseUrl || CODEX_DEFAULT_URL).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return true;
  }
}

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  try {
    const body = await res.json();
    return {
      code: body?.error?.code ?? `http_${res.status}`,
      message: body?.error?.message ?? `HTTP ${res.status}`,
    };
  } catch {
    return { code: `http_${res.status}`, message: `HTTP ${res.status}` };
  }
}

export async function fetchCodexAccount(): Promise<CodexAccount> {
  const { base, headers } = endpoint();
  let res: Response;
  try {
    res = await fetch(`${base}/codex/account`, { headers });
  } catch {
    return {
      state: "error",
      code: "bridge_unreachable",
      message: "ブリッジに接続できません。Macで npm run codex-bridge を起動してください。",
    };
  }
  if (!res.ok) {
    const e = await errorOf(res);
    return { state: "error", ...e };
  }
  const j = await res.json();
  if (j.connected) {
    return { state: "connected", planType: j.planType ?? null, email: j.email ?? null };
  }
  return { state: "disconnected" };
}

export async function startCodexLogin(
  mode: "browser" | "deviceCode"
): Promise<CodexLoginStart> {
  const { base, headers } = endpoint();
  const res = await fetch(`${base}/codex/login`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(mode === "deviceCode" ? { mode: "deviceCode" } : {}),
  });
  if (!res.ok) {
    const e = await errorOf(res);
    throw Object.assign(new Error(e.message), { code: e.code });
  }
  return (await res.json()) as CodexLoginStart;
}

export async function fetchCodexLoginStatus(
  loginId: string
): Promise<{ status: "pending" | "success" | "failed" | "unknown"; message?: string }> {
  const { base, headers } = endpoint();
  const res = await fetch(
    `${base}/codex/login/status?loginId=${encodeURIComponent(loginId)}`,
    { headers }
  );
  if (!res.ok) return { status: "unknown" };
  return (await res.json()) as { status: "pending" | "success" | "failed" | "unknown"; message?: string };
}

export async function codexLogout(): Promise<void> {
  const { base, headers } = endpoint();
  const res = await fetch(`${base}/codex/logout`, { method: "POST", headers });
  if (!res.ok) {
    const e = await errorOf(res);
    throw Object.assign(new Error(e.message), { code: e.code });
  }
}
