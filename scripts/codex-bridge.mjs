#!/usr/bin/env node
/**
 * Codexブリッジ — ChatGPTサブスクリプションのCodex枠をAP StudyのAIチャットから使うための
 * ローカルサーバー。
 *
 * 提供API:
 *   POST /v1/chat/completions   … OpenAI互換チャット(内部で公式 `codex exec` を実行)
 *   GET  /v1/models             … 疎通確認
 *   GET  /v1/codex/account      … ChatGPTログイン状態(Codex App Serverの account/read)
 *   POST /v1/codex/login        … ログイン開始(account/login/start、ChatGPT管理のOAuth)
 *   GET  /v1/codex/login/status … ログイン完了待ちの状態確認
 *   POST /v1/codex/logout       … ログアウト(account/logout)
 *
 * 認証まわりの設計:
 *   - ChatGPTのトークン管理はすべてCodex(App Server/CLI)に任せる。
 *     このプロセスはトークンや auth.json の中身を一切読まず、HTTPにも返さない。
 *   - ブラウザ(スマホ等)からブリッジ自体を守る「ブリッジトークン」は別物で、
 *     環境変数 AP_STUDY_CODEX_BRIDGE_TOKEN から読む。
 *
 * 使い方:  npm run codex-bridge
 * オプション:
 *   --port 8399          待受ポート
 *   --host 127.0.0.1     待受ホスト(非ループバックはブリッジトークン必須)
 *   --allow-origin <o>   CORS許可オリジンを追加(複数指定可)
 *   --token <secret>     [非推奨] 環境変数 AP_STUDY_CODEX_BRIDGE_TOKEN を使ってください
 */
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, CodexAppServerError } from "./codex-app-server.mjs";

const EXEC_TIMEOUT_MS = 180_000;
const MAX_CONCURRENT_EXEC = 2;
const LOGIN_ENTRY_TTL_MS = 10 * 60 * 1000;

const DEFAULT_ORIGINS = [
  "https://westplainblue.github.io",
  "http://localhost:5273",
  "http://127.0.0.1:5273",
  "http://localhost:5173",
];

/* ---------- ユーティリティ ---------- */

function isLoopback(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function tokenMatches(expected, header) {
  if (!header?.startsWith("Bearer ")) return false;
  const got = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

function jsonError(res, status, code, message, cors) {
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { code, message } }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function appServerErrorToHttp(res, e, cors) {
  if (e instanceof CodexAppServerError) {
    const status = e.code === "cli_not_found" ? 503 : 502;
    return jsonError(res, status, e.code, e.message, cors);
  }
  return jsonError(res, 500, "app_server_failed", "Codex App Serverとの通信に失敗しました", cors);
}

/* ---------- codex exec(チャット実行) ---------- */

function buildPrompt(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const turns = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const history = turns
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.content}`)
    .join("\n\n");
  const last = turns[turns.length - 1]?.content ?? "";
  return [
    "あなたはWebアプリ「AP Study」のAIチャットとして呼び出されています。",
    "コマンド実行・ファイル操作・Web閲覧は行わず、テキストの回答だけを返してください。",
    "最後のユーザー発言に対して日本語で回答してください。",
    "",
    "[システム指示]",
    system,
    history ? "\n[これまでの会話]\n" + history : "",
    "",
    "[今回のユーザー発言]",
    last,
  ].join("\n");
}

/**
 * `codex exec` を隔離設定で1回実行する。
 * 戻り値: { promise, kill } — kill() でクライアント切断時に中断できる。
 */
function runCodexExec(prompt, model) {
  const workDir = mkdtempSync(path.join(tmpdir(), "ap-study-codex-"));
  const outFile = path.join(workDir, "last-message.txt");
  const cliArgs = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-user-config", // グローバル設定(MCP・プラグイン等)を読まない。認証はCODEX_HOMEを利用
    "--ignore-rules", // ユーザー/プロジェクトのexecpolicyルールを読まない
    "-s",
    "read-only",
    "-C",
    workDir,
    "-o",
    outFile,
    "--color",
    "never",
  ];
  if (model && model !== "default") cliArgs.push("-m", model);

  const child = spawn("codex", cliArgs, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  let killedByClient = false;
  child.stdin.on("error", () => {
    /* 起動失敗時のEPIPEはerror/closeハンドラ側で処理する */
  });
  child.stderr.on("data", (d) => (stderr = (stderr + d.toString()).slice(-2000)));

  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error("Codexの実行がタイムアウトしました(180秒)"), { code: "exec_timeout" }));
    }, EXEC_TIMEOUT_MS);

    child.on("error", (e) => {
      clearTimeout(timer);
      rmSync(workDir, { recursive: true, force: true });
      reject(
        e.code === "ENOENT"
          ? Object.assign(new Error("codex コマンドが見つかりません(Codex CLI未インストール)"), { code: "cli_not_found" })
          : Object.assign(new Error("codex exec を起動できません"), { code: "app_server_failed" })
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let text = "";
      try {
        text = readFileSync(outFile, "utf8").trim();
      } catch {
        /* 出力ファイルなし */
      }
      rmSync(workDir, { recursive: true, force: true });
      if (killedByClient) {
        reject(Object.assign(new Error("クライアントにより中断されました"), { code: "aborted" }));
      } else if (code !== 0 && !text) {
        const lower = stderr.toLowerCase();
        if (lower.includes("rate limit") || lower.includes("usage limit") || stderr.includes("429")) {
          reject(Object.assign(new Error("ChatGPTプランのレート制限に達しています。時間をおいて再試行してください"), { code: "rate_limited" }));
        } else if (lower.includes("login") || lower.includes("auth")) {
          reject(Object.assign(new Error("ChatGPTにログインしていません。設定画面からログインしてください"), { code: "not_logged_in" }));
        } else {
          reject(Object.assign(new Error(`Codexの実行に失敗しました(exit ${code})`), { code: "exec_failed" }));
        }
      } else {
        resolve(text || "(Codexから空の応答が返りました)");
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });

  return {
    promise,
    kill: () => {
      killedByClient = true;
      child.kill("SIGKILL");
    },
  };
}

/* ---------- サーバー本体 ---------- */

/**
 * ブリッジサーバーを生成する(listenはしない)。テストから利用できるよう分離。
 * @param {{ host?: string, port?: number, bridgeToken?: string, extraOrigins?: string[], clientVersion?: string }} opts
 */
export function createBridgeServer(opts = {}) {
  const host = opts.host ?? "127.0.0.1";
  const bridgeToken = opts.bridgeToken ?? "";
  const allowedOrigins = new Set([...DEFAULT_ORIGINS, ...(opts.extraOrigins ?? [])]);

  if (!isLoopback(host) && !bridgeToken) {
    throw new Error(
      "非ループバック(--host " +
        host +
        ")で待ち受けるには、環境変数 AP_STUDY_CODEX_BRIDGE_TOKEN の設定が必須です"
    );
  }

  // ログイン試行の状態: loginId -> { status, message, createdAt }
  const logins = new Map();
  const appServer = new CodexAppServer({
    clientVersion: opts.clientVersion ?? "0.1.0",
    onNotification: (method, params) => {
      if (method === "account/login/completed" && params) {
        const { loginId, success, error } = params;
        const entry = loginId ? logins.get(loginId) : null;
        const message = success
          ? ""
          : /cancel/i.test(error ?? "")
            ? "ログインがキャンセルされました"
            : "ログインに失敗しました";
        const status = success ? "success" : "failed";
        if (entry) {
          entry.status = status;
          entry.message = message;
        } else if (loginId) {
          logins.set(loginId, { status, message, createdAt: Date.now() });
        }
      }
    },
  });

  let activeExecs = 0;

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors =
      origin && allowedOrigins.has(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "authorization, content-type",
          }
        : {};

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (bridgeToken && !tokenMatches(bridgeToken, req.headers.authorization)) {
      return jsonError(res, 401, "bridge_auth_failed", "ブリッジの接続トークンが一致しません", cors);
    }

    const url = new URL(req.url ?? "/", "http://bridge.local");

    try {
      /* --- 疎通確認 --- */
      if (req.method === "GET" && url.pathname === "/v1/models") {
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ object: "list", data: [{ id: "default", object: "model" }] })
        );
      }

      /* --- 認証: 状態確認 --- */
      if (req.method === "GET" && url.pathname === "/v1/codex/account") {
        try {
          const result = await appServer.request("account/read", {});
          const account = result?.account;
          if (account?.type === "chatgpt") {
            res.writeHead(200, { ...cors, "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({
                connected: true,
                method: "chatgpt",
                planType: account.planType ?? null,
                email: account.email ?? null,
              })
            );
          }
          res.writeHead(200, { ...cors, "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({ connected: false, method: account?.type ?? null })
          );
        } catch (e) {
          return appServerErrorToHttp(res, e, cors);
        }
      }

      /* --- 認証: ログイン開始 --- */
      if (req.method === "POST" && url.pathname === "/v1/codex/login") {
        let mode = "chatgpt";
        try {
          const body = JSON.parse((await readBody(req)) || "{}");
          if (body.mode === "deviceCode") mode = "chatgptDeviceCode";
        } catch {
          /* bodyなしはブラウザフロー */
        }
        try {
          const result = await appServer.request("account/login/start", { type: mode });
          const loginId = result?.loginId ?? null;
          if (loginId) {
            logins.set(loginId, { status: "pending", message: "", createdAt: Date.now() });
            for (const [id, entry] of logins) {
              if (Date.now() - entry.createdAt > LOGIN_ENTRY_TTL_MS) logins.delete(id);
            }
          }
          res.writeHead(200, { ...cors, "Content-Type": "application/json" });
          if (result?.type === "chatgptDeviceCode") {
            return res.end(
              JSON.stringify({
                loginId,
                mode: "deviceCode",
                verificationUrl: result.verificationUrl,
                userCode: result.userCode,
              })
            );
          }
          return res.end(
            JSON.stringify({ loginId, mode: "browser", authUrl: result?.authUrl ?? null })
          );
        } catch (e) {
          return appServerErrorToHttp(res, e, cors);
        }
      }

      /* --- 認証: ログイン状態ポーリング --- */
      if (req.method === "GET" && url.pathname === "/v1/codex/login/status") {
        const loginId = url.searchParams.get("loginId") ?? "";
        const entry = logins.get(loginId);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        return res.end(
          JSON.stringify(entry ? { status: entry.status, message: entry.message } : { status: "unknown" })
        );
      }

      /* --- 認証: ログアウト --- */
      if (req.method === "POST" && url.pathname === "/v1/codex/logout") {
        try {
          await appServer.request("account/logout", undefined);
          res.writeHead(200, { ...cors, "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          return appServerErrorToHttp(res, e, cors);
        }
      }

      /* --- チャット --- */
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        if (activeExecs >= MAX_CONCURRENT_EXEC) {
          return jsonError(res, 429, "busy", "同時に実行できるCodexリクエスト数を超えています。少し待ってから再試行してください", cors);
        }
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return jsonError(res, 400, "bad_request", "JSONボディを解釈できません", cors);
        }
        activeExecs += 1;
        const exec = runCodexExec(buildPrompt(body), body.model);
        req.on("close", () => {
          if (!res.writableEnded) exec.kill();
        });
        res.writeHead(200, {
          ...cors,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const ping = setInterval(() => res.write(": ping\n\n"), 10_000);
        console.log(`[bridge] チャット実行(model=${body.model ?? "default"})…`);
        try {
          const text = await exec.promise;
          res.write(
            `data: ${JSON.stringify({
              id: "codex-bridge",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
            })}\n\n`
          );
          res.write("data: [DONE]\n\n");
          console.log("[bridge] チャット応答完了");
        } catch (e) {
          if (e.code !== "aborted") {
            res.write(
              `data: ${JSON.stringify({
                id: "codex-bridge",
                object: "chat.completion.chunk",
                choices: [{ index: 0, delta: { content: `⚠️ ${e.message}` }, finish_reason: "stop" }],
              })}\n\n`
            );
            res.write("data: [DONE]\n\n");
            console.error(`[bridge] チャットエラー(${e.code ?? "unknown"})`);
          }
        } finally {
          activeExecs -= 1;
          clearInterval(ping);
          res.end();
        }
        return;
      }

      jsonError(res, 404, "not_found", "not found", cors);
    } catch (e) {
      jsonError(res, 500, "internal", "内部エラーが発生しました", cors);
    }
  });

  server.on("close", () => appServer.close());
  return { server, appServer };
}

/* ---------- CLIエントリポイント ---------- */

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const argValue = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const argValues = (name) => {
    const out = [];
    args.forEach((a, i) => {
      if (a === name && args[i + 1]) out.push(args[i + 1]);
    });
    return out;
  };

  const host = argValue("--host", "127.0.0.1");
  const port = Number(argValue("--port", "8399"));
  const legacyToken = argValue("--token", "");
  if (legacyToken) {
    console.warn(
      "⚠️ --token は非推奨です。環境変数 AP_STUDY_CODEX_BRIDGE_TOKEN を使ってください(コマンドライン引数はps等で他プロセスから見えます)"
    );
  }
  const bridgeToken = process.env.AP_STUDY_CODEX_BRIDGE_TOKEN || legacyToken;

  let version = "0.1.0";
  try {
    version = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ).version;
  } catch {
    /* versionは表示用 */
  }

  let bridge;
  try {
    bridge = createBridgeServer({
      host,
      port,
      bridgeToken,
      extraOrigins: argValues("--allow-origin"),
      clientVersion: version,
    });
  } catch (e) {
    console.error(`起動失敗: ${e.message}`);
    process.exit(1);
  }

  bridge.server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(
        `起動失敗: ポート${port}は既に使用中です。\n` +
          `  - 既にブリッジが起動していればそのまま使えます(重複起動は不要です)\n` +
          `  - 別プロセスを止めるか、--port <番号> で別ポートを指定してください`
      );
    } else {
      console.error(`起動失敗: ${e.message}`);
    }
    process.exit(1);
  });

  bridge.server.listen(port, host, () => {
    console.log(`Codexブリッジ起動: http://${host}:${port}/v1`);
    console.log("ChatGPT認証はCodex App Serverが管理します(トークンはこのプロセスを通りません)");
    if (bridgeToken) console.log("ブリッジ接続トークン: 有効");
  });

  const shutdown = () => {
    bridge.appServer.close();
    bridge.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
