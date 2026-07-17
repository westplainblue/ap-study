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
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, CodexAppServerError } from "./codex-app-server.mjs";

const TURN_TIMEOUT_MS = 180_000;
const MAX_CONCURRENT_TURNS = 2;
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

/** ターン失敗メッセージをユーザー向けエラーへ変換する(トークン等は含めない) */
function mapTurnFailure(raw) {
  const msg = typeof raw === "string" ? raw : "";
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("usage limit") || msg.includes("429")) {
    return Object.assign(
      new Error("ChatGPTプランのレート制限に達しています。時間をおいて再試行してください"),
      { code: "rate_limited" }
    );
  }
  if (lower.includes("login") || lower.includes("auth")) {
    return Object.assign(
      new Error("ChatGPTにログインしていません。設定画面からログインしてください"),
      { code: "not_logged_in" }
    );
  }
  if (lower.includes("newer version")) {
    return Object.assign(
      new Error(
        "このモデルには新しいCodex CLIが必要です。`codex update` を実行するか、設定のモデルに gpt-5.4 等を指定してください"
      ),
      { code: "exec_failed" }
    );
  }
  return Object.assign(new Error(`Codexの実行に失敗しました: ${msg.slice(0, 200)}`), {
    code: "exec_failed",
  });
}

/**
 * Codex App Serverの thread/turn で1問答える(ストリーミング)。
 * 隔離: 読み取り専用サンドボックス・承認なし・空の一時ディレクトリ・ephemeral。
 * onDelta にモデル出力が生成されたそばから流れる。
 * 戻り値: { promise, kill } — kill() でクライアント切断時に turn/interrupt する。
 */
function runCodexTurn(appServer, turnHandlers, prompt, model, onDelta) {
  let killed = false;
  let ids = null; // { threadId, turnId }
  const workDir = mkdtempSync(path.join(tmpdir(), "ap-study-codex-"));

  const interrupt = () => {
    if (ids) void appServer.request("turn/interrupt", ids, 5_000).catch(() => {});
  };

  const promise = (async () => {
    const threadResp = await appServer.request(
      "thread/start",
      {
        cwd: workDir,
        sandbox: "read-only",
        approvalPolicy: "never",
        ephemeral: true,
        ...(model && model !== "default" ? { model } : {}),
      },
      30_000
    );
    const threadId = threadResp?.thread?.id;
    if (!threadId) {
      throw Object.assign(new Error("Codexスレッドを開始できませんでした"), { code: "exec_failed" });
    }

    let streamedLen = 0;
    const completion = new Promise((resolve, reject) => {
      turnHandlers.set(threadId, {
        onDelta: (d) => {
          streamedLen += d.length;
          onDelta(d);
        },
        // deltaが欠けた場合に備え、完了メッセージとの差分を補完する
        onItemText: (text) => {
          if (typeof text === "string" && text.length > streamedLen) {
            onDelta(text.slice(streamedLen));
            streamedLen = text.length;
          }
        },
        onTurnCompleted: (turn) => {
          if (turn?.status === "failed" && !killed) {
            reject(mapTurnFailure(turn?.error?.message));
          } else {
            resolve();
          }
        },
        onError: (message, willRetry) => {
          if (!willRetry && !killed) reject(mapTurnFailure(message));
        },
      });
    });

    if (killed) return;
    const turnResp = await appServer.request(
      "turn/start",
      { threadId, input: [{ type: "text", text: prompt, text_elements: [] }] },
      30_000
    );
    ids = { threadId, turnId: turnResp?.turn?.id ?? "" };
    if (killed) interrupt();

    let timeoutId;
    try {
      await Promise.race([
        completion,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            interrupt();
            reject(
              Object.assign(new Error("Codexの実行がタイムアウトしました(180秒)"), {
                code: "exec_timeout",
              })
            );
          }, TURN_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
      turnHandlers.delete(threadId);
    }
  })().finally(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  return {
    promise,
    kill: () => {
      killed = true;
      interrupt();
    },
  };
}

/* ---------- アプリの静的配信(同一オリジン利用) ---------- */

const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

/**
 * dist/ のビルド済みアプリを配信する。ブリッジと同一オリジンでアプリを開けるため、
 * ブラウザのCORS / Private Network Access / mixed content制限を受けない。
 * 戻り値: 配信した場合 true
 */
function serveStatic(req, res, url) {
  if (!existsSync(DIST_DIR)) return false;
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = path.resolve(DIST_DIR, "." + rel);
  if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) return false;
  const target = existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : path.join(DIST_DIR, "index.html"); // HashRouterなので不明パスはindexへ
  if (!existsSync(target)) return false;
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(target).pipe(res);
  return true;
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
  // 実行中ターンの通知ルーティング: threadId -> handlers
  const turnHandlers = new Map();
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
        return;
      }
      const handler = params?.threadId ? turnHandlers.get(params.threadId) : undefined;
      if (!handler) return;
      if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
        handler.onDelta(params.delta);
      } else if (method === "item/completed" && params.item?.type === "agentMessage") {
        handler.onItemText(params.item.text);
      } else if (method === "turn/completed") {
        handler.onTurnCompleted(params.turn);
      } else if (method === "error") {
        handler.onError(params.error?.message, params.willRetry === true);
      }
    },
  });

  let activeTurns = 0;

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
      const preflight = { ...cors, "Access-Control-Max-Age": "600" };
      // ChromeのPrivate Network Access(公開サイト→ローカルネットワーク)対応
      if (req.headers["access-control-request-private-network"] === "true") {
        preflight["Access-Control-Allow-Private-Network"] = "true";
      }
      res.writeHead(204, preflight);
      return res.end();
    }
    const url = new URL(req.url ?? "/", "http://bridge.local");

    // アプリ本体(dist/)の配信。/v1/ 以外のGETは静的ファイルとして扱う
    if (req.method === "GET" && !url.pathname.startsWith("/v1/")) {
      if (serveStatic(req, res, url)) return;
      return jsonError(res, 404, "not_found", "not found(アプリを配信するには npm run build を実行してください)", cors);
    }

    if (bridgeToken && !tokenMatches(bridgeToken, req.headers.authorization)) {
      return jsonError(res, 401, "bridge_auth_failed", "ブリッジの接続トークンが一致しません", cors);
    }

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

      /* --- チャット(App Serverターンでストリーミング) --- */
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        if (activeTurns >= MAX_CONCURRENT_TURNS) {
          return jsonError(res, 429, "busy", "同時に実行できるCodexリクエスト数を超えています。少し待ってから再試行してください", cors);
        }
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return jsonError(res, 400, "bad_request", "JSONボディを解釈できません", cors);
        }
        activeTurns += 1;
        res.writeHead(200, {
          ...cors,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const sseDelta = (content) =>
          res.write(
            `data: ${JSON.stringify({
              id: "codex-bridge",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { content }, finish_reason: null }],
            })}\n\n`
          );
        const ping = setInterval(() => res.write(": ping\n\n"), 10_000);
        console.log(`[bridge] チャット実行(model=${body.model ?? "default"})…`);
        const turn = runCodexTurn(
          appServer,
          turnHandlers,
          buildPrompt(body),
          body.model,
          sseDelta
        );
        req.on("close", () => {
          if (!res.writableEnded) turn.kill();
        });
        try {
          await turn.promise;
          res.write("data: [DONE]\n\n");
          console.log("[bridge] チャット応答完了");
        } catch (e) {
          sseDelta(`⚠️ ${e.message}`);
          res.write("data: [DONE]\n\n");
          console.error(`[bridge] チャットエラー(${e.code ?? "unknown"})`);
        } finally {
          activeTurns -= 1;
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
    if (existsSync(DIST_DIR)) {
      console.log(`📱 アプリ(同一オリジン・ブラウザ制限なし): http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`);
    } else {
      console.log("ヒント: npm run build を実行すると、このブリッジがアプリ本体も配信します(http://127.0.0.1:" + port + "/)");
    }
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
