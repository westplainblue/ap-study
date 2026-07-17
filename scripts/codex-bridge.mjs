#!/usr/bin/env node
/**
 * Codexブリッジ — ChatGPTサブスクリプションのCodex枠をAP StudyのAIチャットから使うための
 * ローカルサーバー。OpenAI互換の /v1/chat/completions を localhost に公開し、内部では
 * 公式の `codex exec`(Codex CLIの保存済みChatGPT認証を利用)を呼び出す。
 *
 * 使い方:
 *   1. Codex CLIをインストールし `codex login`(ChatGPTサインイン)を済ませておく
 *   2. npm run codex-bridge
 *   3. アプリの設定 → AIチャット → 「Codex」を選択(既定URL http://127.0.0.1:8399/v1)
 *
 * オプション:
 *   --port 8399          待受ポート
 *   --host 127.0.0.1     待受ホスト(スマホから使う場合は 0.0.0.0 にし、--token を必ず併用)
 *   --token <secret>     Authorization: Bearer <secret> を要求する(LAN公開時の保護)
 *   --allow-origin <o>   CORS許可オリジンを追加(複数指定可)
 *
 * セキュリティ:
 *   - 既定では 127.0.0.1 のみで待ち受け、外部からアクセス不可
 *   - CORSは既定で本アプリのオリジン(GitHub Pages / localhost)のみに限定。
 *     悪意あるWebサイトがこのブリッジ経由でサブスク枠を浪費するのを防ぐ
 *   - codex exec は読み取り専用サンドボックス+空の作業ディレクトリで実行
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
function argValues(name) {
  const out = [];
  args.forEach((a, i) => {
    if (a === name && args[i + 1]) out.push(args[i + 1]);
  });
  return out;
}

const PORT = Number(argValue("--port", "8399"));
const HOST = argValue("--host", "127.0.0.1");
const TOKEN = argValue("--token", "");
const TIMEOUT_MS = 180_000;

const ALLOWED_ORIGINS = new Set([
  "https://westplainblue.github.io",
  "http://localhost:5273",
  "http://127.0.0.1:5273",
  "http://localhost:5173",
  ...argValues("--allow-origin"),
]);

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
    };
  }
  return {};
}

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

function runCodex(prompt, model) {
  return new Promise((resolve, reject) => {
    const workDir = mkdtempSync(path.join(tmpdir(), "ap-study-codex-"));
    const outFile = path.join(workDir, "last-message.txt");
    const cliArgs = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
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
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("codex exec がタイムアウトしました(180秒)"));
    }, TIMEOUT_MS);

    child.on("error", (e) => {
      clearTimeout(timer);
      rmSync(workDir, { recursive: true, force: true });
      reject(
        e.code === "ENOENT"
          ? new Error("codex コマンドが見つかりません。Codex CLIをインストールしてください")
          : e
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
      if (code !== 0 && !text) {
        reject(new Error(`codex exec が失敗しました(exit ${code}): ${stderr.slice(-400)}`));
      } else {
        resolve(text || "(Codexから空の応答が返りました)");
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
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

const server = createServer(async (req, res) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "ブリッジのトークンが一致しません" } }));
  }
  if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ object: "list", data: [{ id: "default", object: "model" }] }));
  }
  if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
    try {
      const body = JSON.parse(await readBody(req));
      const prompt = buildPrompt(body);
      console.log(`[bridge] リクエスト受信(model=${body.model ?? "default"})…`);
      res.writeHead(200, {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // codex exec 実行中の接続維持(SSEコメント)
      const ping = setInterval(() => res.write(": ping\n\n"), 10_000);
      try {
        const text = await runCodex(prompt, body.model);
        const chunk = {
          id: "codex-bridge",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        console.log("[bridge] 応答完了");
      } catch (e) {
        const errChunk = {
          id: "codex-bridge",
          object: "chat.completion.chunk",
          choices: [
            { index: 0, delta: { content: `⚠️ ${e.message}` }, finish_reason: "stop" },
          ],
        };
        res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        console.error(`[bridge] エラー: ${e.message}`);
      } finally {
        clearInterval(ping);
        res.end();
      }
    } catch (e) {
      res.writeHead(400, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
    return;
  }
  res.writeHead(404, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(PORT, HOST, () => {
  console.log(`Codexブリッジ起動: http://${HOST}:${PORT}/v1`);
  console.log(`許可オリジン: ${[...ALLOWED_ORIGINS].join(", ")}`);
  if (HOST !== "127.0.0.1" && !TOKEN) {
    console.warn("⚠️ 127.0.0.1 以外で待ち受ける場合は --token の併用を強く推奨します");
  }
});
