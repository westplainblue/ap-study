import assert from "node:assert/strict";
import { test } from "node:test";
import { __setTermsDataForTest } from "../src/data/terms.ts";
import { mergeStates } from "../src/lib/progress.ts";
import { __setSyncApiUrlForTest, syncNow } from "../src/lib/sync.ts";

const KEY = "ap-study:v1";

// node環境にはlocalStorage/fetchが無いので、テストごとにスタブする
function withEnv(store, fetchImpl, fn) {
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  const hadLs = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const hadFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
  globalThis.fetch = fetchImpl;
  __setSyncApiUrlForTest("http://sync.test.local/");
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (hadLs) Object.defineProperty(globalThis, "localStorage", hadLs);
      else delete globalThis.localStorage;
      globalThis.fetch = hadFetch;
      __setSyncApiUrlForTest(undefined);
      __setTermsDataForTest(null);
    });
}

const at = (q, t, ok, mode = "practice") => ({ q, t, ok, mode });

test("syncNow: pull中に発生したローカル書込みがマージ結果から消えない", async () => {
  const a1 = at("qa", 100, true);
  const a2 = at("qb", 200, false); // ← fetch待ちの間に書かれる解答
  const a3 = at("qc", 300, true); // ← サーバー側にだけある解答
  const store = {
    [KEY]: JSON.stringify({
      attempts: [a1],
      review: {},
      settings: { syncCode: "test-code" },
      updatedAt: 1000,
    }),
  };
  const puts = [];
  const fetchImpl = async (input, init) => {
    if (!init?.method) {
      // pull(GET)の応答前に、ローカルで解答が記録されたことを再現する
      const cur = JSON.parse(store[KEY]);
      cur.attempts.push(a2);
      cur.updatedAt = 2000;
      store[KEY] = JSON.stringify(cur);
      return {
        ok: true,
        json: async () => ({
          data: { attempts: [a1, a3], review: {}, settings: { syncCode: "test-code" }, updatedAt: 1500 },
        }),
      };
    }
    puts.push(JSON.parse(init.body));
    return { ok: true };
  };

  await withEnv(store, fetchImpl, async () => {
    const result = await syncNow();
    assert.equal(result.ok, true, result.message);
    const saved = JSON.parse(store[KEY]);
    const ids = saved.attempts.map((x) => x.q).sort();
    assert.deepEqual(ids, ["qa", "qb", "qc"]); // qb(取得中の書込み)が残る
    // push した本文にも含まれている
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].data.attempts.map((x) => x.q).sort(), ["qa", "qb", "qc"]);
  });
});

test("syncNow: 相手端末から取り込んだ誤答のことばを導出してから送る", async () => {
  const store = {
    [KEY]: JSON.stringify({
      attempts: [],
      review: {},
      settings: { syncCode: "test-code" },
      updatedAt: 1000,
    }),
  };
  const card = {
    id: "t1",
    term: "T1",
    def: "定義",
    defQid: "qx",
    source: "point-pair",
    qids: ["qx"],
    middle: "ネットワーク",
    major: "T",
  };
  __setTermsDataForTest({ cards: [card], byId: new Map([["t1", card]]), index: { qx: ["t1"] } });
  const puts = [];
  const fetchImpl = async (input, init) => {
    if (!init?.method) {
      return {
        ok: true,
        json: async () => ({
          data: {
            attempts: [at("qx", 500, false)], // 相手端末での誤答
            review: {},
            settings: { syncCode: "test-code" },
            updatedAt: 1500,
          },
        }),
      };
    }
    puts.push(JSON.parse(init.body));
    return { ok: true };
  };

  await withEnv(store, fetchImpl, async () => {
    const result = await syncNow();
    assert.equal(result.ok, true, result.message);
    const saved = JSON.parse(store[KEY]);
    assert.ok(saved.vocab?.t1, "取り込んだ誤答からことばが導出される");
    assert.equal(saved.vocab.t1.u, 0, "導出エントリの u は 0(LWWで実操作に勝たない)");
    assert.ok(puts[0].data.vocab?.t1, "push する本文にも導出結果が含まれる");
  });
});

test("mergeStates: 導出エントリ(u=0)は新しくても本物の進捗に勝てない", () => {
  const derived = {
    box: 1,
    due: "2026-02-01",
    wrongQids: ["qx"],
    addedAt: 100,
    u: 0,
  };
  const genuine = {
    box: 4,
    due: "2026-03-01",
    wrongQids: ["qx"],
    addedAt: 100,
    u: 50,
  };
  // 導出側の state の方が新しい(updatedAt が大きい)場合でも box4 が生き残る
  const a = { attempts: [], review: {}, settings: {}, vocab: { t1: derived }, updatedAt: 9000 };
  const b = { attempts: [], review: {}, settings: {}, vocab: { t1: genuine }, updatedAt: 1000 };
  assert.equal(mergeStates(a, b).vocab.t1.box, 4);
  assert.equal(mergeStates(b, a).vocab.t1.box, 4);
});

test("syncNow: 卒業(墓標)が古いサーバスナップショットで復活せず、墓標をサーバへ書き戻す", async () => {
  const now = 1_700_000_000_000;
  const store = {
    [KEY]: JSON.stringify({
      attempts: [],
      review: { q1: { box: 5, due: "9999-12-31", u: now } }, // 新方式で卒業済み
      settings: { syncCode: "test-code" },
      updatedAt: now,
    }),
  };
  const puts = [];
  const fetchImpl = async (input, init) => {
    if (!init?.method) {
      return {
        ok: true,
        json: async () => ({
          data: {
            attempts: [],
            review: { q1: { box: 4, due: "2020-01-01" } }, // 旧形式の生き残り(過去due)
            settings: { syncCode: "test-code" },
            updatedAt: now + 999_999, // サーバの方が「全体としては新しい」ケースでも
          },
        }),
      };
    }
    puts.push(JSON.parse(init.body));
    return { ok: true };
  };
  await withEnv(store, fetchImpl, async () => {
    const result = await syncNow();
    assert.equal(result.ok, true, result.message);
    const saved = JSON.parse(store[KEY]);
    assert.equal(saved.review.q1.box, 5, "ローカルで墓標が維持される");
    assert.equal(puts[0].data.review.q1.box, 5, "サーバにも墓標が書き戻される");
  });
});

test("syncNow: 復活済みの旧エントリは履歴リプレイの修復で墓標化されてから送られる", async () => {
  // 誤答→4連続正解で卒業する履歴。復習には歴史的状態(box3)が復活済み(u無し)
  const D = 86_400_000;
  const T0 = new Date("2026-05-01T12:00:00").getTime();
  const day = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const plus = (t, days) => day(t + days * D);
  const attempts = [
    { q: "q1", t: T0, ok: false, mode: "practice" },
    { q: "q1", t: T0 + 1 * D, ok: true, mode: "review" },
    { q: "q1", t: T0 + 4 * D, ok: true, mode: "review" },
    { q: "q1", t: T0 + 11 * D, ok: true, mode: "review" },
    { q: "q1", t: T0 + 25 * D, ok: true, mode: "review" },
  ];
  const store = {
    [KEY]: JSON.stringify({
      attempts,
      review: { q1: { box: 3, due: plus(T0 + 4 * D, 7) } }, // 復活した歴史的状態
      settings: { syncCode: "test-code" },
      updatedAt: 1,
    }),
  };
  const puts = [];
  const fetchImpl = async (input, init) => {
    if (!init?.method) return { ok: true, json: async () => ({ data: null }) };
    puts.push(JSON.parse(init.body));
    return { ok: true };
  };
  await withEnv(store, fetchImpl, async () => {
    const result = await syncNow();
    assert.equal(result.ok, true, result.message);
    const saved = JSON.parse(store[KEY]);
    assert.equal(saved.review.q1.box, 5, "修復で墓標化される");
    assert.equal(saved.review.q1.u, T0 + 25 * D, "uは卒業解答のt(全端末で決定的)");
    assert.equal(puts[0].data.review.q1.box, 5, "墓標がサーバへ送られる");
  });
});
