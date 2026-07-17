/**
 * Codexブリッジのテスト。
 * 実際のCodex CLI・ChatGPT認証・モデル呼び出しは一切行わず、
 * tests/fixtures/codex(偽CLI)をPATH先頭に差し込んで検証する。
 */
import assert from "node:assert/strict";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createBridgeServer } from "../scripts/codex-bridge.mjs";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const ORIGINAL_PATH = process.env.PATH;

const openServers = [];

function startBridge(opts = {}) {
  const bridge = createBridgeServer(opts);
  openServers.push(bridge);
  return new Promise((resolve) => {
    bridge.server.listen(0, "127.0.0.1", () => {
      const { port } = bridge.server.address();
      resolve({ ...bridge, base: `http://127.0.0.1:${port}` });
    });
  });
}

beforeEach(() => {
  process.env.PATH = `${fixturesDir}:${ORIGINAL_PATH}`;
  delete process.env.FAKE_CODEX_STATE;
  delete process.env.FAKE_CODEX_LOGIN;
  delete process.env.FAKE_CODEX_CRASH;
  delete process.env.FAKE_CODEX_TURN_SLEEP;
});

after(() => {
  process.env.PATH = ORIGINAL_PATH;
  for (const b of openServers) {
    b.appServer.close();
    b.server.close();
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("ログイン済み: connected と planType を返し、トークン類を漏らさない", async () => {
  process.env.FAKE_CODEX_STATE = "loggedin";
  const { base } = await startBridge();
  const res = await fetch(`${base}/v1/codex/account`);
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.connected, true);
  assert.equal(body.planType, "plus");
  assert.equal(body.email, "test@example.com");
  // 応答はホワイトリストされたキーのみで構成される
  assert.deepEqual(
    Object.keys(body).sort(),
    ["connected", "email", "method", "planType"]
  );
  // 偽CLIが混入させた「漏れてはいけない」値が素通りしていない
  assert.ok(!text.includes("sk-secret"), "生トークンがHTTPレスポンスに含まれている");
});

test("未ログイン: connected=false を返す", async () => {
  process.env.FAKE_CODEX_STATE = "loggedout";
  const { base } = await startBridge();
  const body = await (await fetch(`${base}/v1/codex/account`)).json();
  assert.equal(body.connected, false);
});

test("login/start: authUrl を返し、完了通知で success になる", async () => {
  process.env.FAKE_CODEX_LOGIN = "success";
  const { base } = await startBridge();
  const start = await (
    await fetch(`${base}/v1/codex/login`, { method: "POST" })
  ).json();
  assert.equal(start.mode, "browser");
  assert.equal(start.loginId, "login-1");
  assert.equal(start.authUrl, "https://auth.example.com/oauth");
  await sleep(300);
  const st = await (
    await fetch(`${base}/v1/codex/login/status?loginId=login-1`)
  ).json();
  assert.equal(st.status, "success");
});

test("loginキャンセル/失敗: failed とメッセージを返す", async () => {
  process.env.FAKE_CODEX_LOGIN = "fail";
  const { base } = await startBridge();
  await fetch(`${base}/v1/codex/login`, { method: "POST" });
  await sleep(300);
  const st = await (
    await fetch(`${base}/v1/codex/login/status?loginId=login-1`)
  ).json();
  assert.equal(st.status, "failed");
  assert.match(st.message, /キャンセル/);
});

test("login完了通知が来ない間は pending のまま(タイムアウトはUI側)", async () => {
  process.env.FAKE_CODEX_LOGIN = "none";
  const { base } = await startBridge();
  await fetch(`${base}/v1/codex/login`, { method: "POST" });
  await sleep(250);
  const st = await (
    await fetch(`${base}/v1/codex/login/status?loginId=login-1`)
  ).json();
  assert.equal(st.status, "pending");
});

test("App Server異常終了: app_server_failed を返し、スタックトレースを含まない", async () => {
  process.env.FAKE_CODEX_CRASH = "1";
  const { base } = await startBridge();
  const first = await fetch(`${base}/v1/codex/account`);
  const firstText = await first.text();
  assert.equal(first.status, 502);
  assert.equal(JSON.parse(firstText).error.code, "app_server_failed");
  // 再起動を試みても回復しない場合も、ハングせずエラーを返す
  const second = await fetch(`${base}/v1/codex/account`);
  const secondText = await second.text();
  assert.equal(second.status, 502);
  for (const text of [firstText, secondText]) {
    assert.ok(!text.includes("    at "), "スタックトレースが応答に含まれている");
  }
});

test("Codex CLI未検出: cli_not_found を返す", async () => {
  process.env.PATH = "/nonexistent-dir-for-test";
  const { base } = await startBridge();
  const res = await fetch(`${base}/v1/codex/account`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, "cli_not_found");
});

test("非ループバック待受はブリッジトークンなしでは起動失敗する", () => {
  assert.throws(
    () => createBridgeServer({ host: "0.0.0.0" }),
    /AP_STUDY_CODEX_BRIDGE_TOKEN/
  );
});

test("ブリッジトークン: 不一致は401、正しいトークンは通る", async () => {
  process.env.FAKE_CODEX_STATE = "loggedin";
  const { base } = await startBridge({ bridgeToken: "test-secret" });
  const noAuth = await fetch(`${base}/v1/codex/account`);
  assert.equal(noAuth.status, 401);
  assert.equal((await noAuth.json()).error.code, "bridge_auth_failed");
  const withAuth = await fetch(`${base}/v1/codex/account`, {
    headers: { Authorization: "Bearer test-secret" },
  });
  assert.equal(withAuth.status, 200);
});

test("チャット: 応答がdeltaごとにストリーミングされる", async () => {
  const { base } = await startBridge();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "default", messages: [{ role: "user", content: "テスト" }] }),
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  // 2つのdeltaが別チャンクとして届く(=一括ではなくオンデマンド出力)
  const deltas = [...text.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(deltas, ["これは", "テスト応答です"]);
  assert.ok(text.includes("[DONE]"));
});

test("同時実行上限: 3件同時のうち1件は429(busy)", async () => {
  process.env.FAKE_CODEX_TURN_SLEEP = "800";
  const { base } = await startBridge();
  const fire = () =>
    fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
    });
  const [a, b, c] = await Promise.all([fire(), fire(), fire()]);
  const statuses = [a.status, b.status, c.status].sort();
  assert.deepEqual(statuses, [200, 200, 429]);
});
