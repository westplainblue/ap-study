import assert from "node:assert/strict";
import { test } from "node:test";
import { __setTermsDataForTest } from "../src/data/terms.ts";
import { importJson, loadState, mergeStates } from "../src/lib/progress.ts";
import {
  captureVocabForQuestion,
  dueVocabIds,
  reconcileVocab,
  recordVocabAnswer,
  setVocabHidden,
  setVocabMemo,
  vocabCounts,
} from "../src/lib/vocab.ts";

// 日付計算をテスト内で再現するための最小ヘルパ(progress.ts と同ロジック)
function dstr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(base, days) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dstr(d);
}

// reconcile 用の固定時刻(ローカルタイムで 2026-01-10)
const NOW = new Date("2026-01-10T12:00:00").getTime();
const TODAY = dstr(new Date(NOW));

const state = (over = {}) => ({
  attempts: [],
  review: {},
  settings: {},
  updatedAt: 0,
  ...over,
});
const at = (q, ok, t, mode = "practice") => ({ q, t, ok, mode });
const ve = (u, over = {}) => ({
  box: 1,
  due: "2026-01-01",
  wrongQids: [],
  addedAt: 0,
  u,
  ...over,
});

// node環境にはlocalStorageが無いので、最小限のスタブで保存系を検証する
// (tests/aiHistory.test.mjs の withLocalStorage と同方式)
function withLocalStorage(store, fn) {
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
}

/** 進捗stateをストアに書き込んでおくヘルパ */
function seedStore(store, s) {
  store["ap-study:v1"] = JSON.stringify(s);
}
const readStore = (store) => JSON.parse(store["ap-study:v1"]);

/** capture系テスト用: 辞書キャッシュを注入して必ず後片付けする */
function withTerms(index, fn) {
  __setTermsDataForTest({ cards: [], byId: new Map(), index });
  try {
    return fn();
  } finally {
    __setTermsDataForTest(null);
  }
}

test("reconcileVocab: 誤答から新規作成し、2回目は何も変えない(冪等)", () => {
  const s = state({ attempts: [at("q1", false, 100)] });
  const index = { q1: ["T1"] };
  assert.equal(reconcileVocab(s, index, NOW), true);
  assert.deepEqual(s.vocab.T1, {
    box: 1,
    due: addDays(TODAY, 1),
    wrongQids: ["q1"],
    addedAt: 100,
    u: NOW,
  });
  const snapshot = JSON.stringify(s);
  assert.equal(reconcileVocab(s, index, NOW + 999), false);
  assert.equal(JSON.stringify(s), snapshot);
});

test("reconcileVocab: 最新attemptが正解の問題由来は box=3・due=+7日", () => {
  const s = state({
    attempts: [
      at("q1", false, 100),
      at("q1", true, 200), // 解き直して正解 → もう解ける
      at("q2", false, 100), // 誤答のまま
      at("q3", false, 100),
      at("q3", true, 300),
      at("q4", false, 150), // T3のもう片方は誤答のまま
    ],
  });
  const index = { q1: ["T1"], q2: ["T2"], q3: ["T3"], q4: ["T3"] };
  assert.equal(reconcileVocab(s, index, NOW), true);
  // 全 wrongQids の最新が正解 → 後回し(box=3, +7日固定)
  assert.equal(s.vocab.T1.box, 3);
  assert.equal(s.vocab.T1.due, addDays(TODAY, 7));
  // 誤答のまま → box=1
  assert.equal(s.vocab.T2.box, 1);
  // 1つでも最新が誤答なら box=1。wrongQids は初回誤答の古い順
  assert.equal(s.vocab.T3.box, 1);
  assert.deepEqual(s.vocab.T3.wrongQids, ["q3", "q4"]);
  assert.equal(s.vocab.T3.addedAt, 100);
});

test("reconcileVocab: due平準化 45語 → 明日20・明後日20・明々後日5", () => {
  const attempts = [];
  const index = {};
  for (let i = 0; i < 45; i++) {
    attempts.push(at(`q${i}`, false, i));
    index[`q${i}`] = [`T${i}`];
  }
  // box=3 になる用語は平準化の枠を消費しない
  attempts.push(at("q45", false, 45), at("q45", true, 1000));
  index.q45 = ["T45"];
  const s = state({ attempts });
  assert.equal(reconcileVocab(s, index, NOW), true);
  const byDue = new Map();
  for (let i = 0; i < 45; i++) {
    const due = s.vocab[`T${i}`].due;
    byDue.set(due, (byDue.get(due) ?? 0) + 1);
  }
  assert.equal(byDue.get(addDays(TODAY, 1)), 20);
  assert.equal(byDue.get(addDays(TODAY, 2)), 20);
  assert.equal(byDue.get(addDays(TODAY, 3)), 5);
  // addedAt 昇順に割当: 先頭は明日、末尾は明々後日
  assert.equal(s.vocab.T0.due, addDays(TODAY, 1));
  assert.equal(s.vocab.T44.due, addDays(TODAY, 3));
  assert.equal(s.vocab.T45.due, addDays(TODAY, 7)); // box=3 は固定
});

test("reconcileVocab: 既存エントリは hidden 含め一切触らない(非復活)", () => {
  const hidden = ve(1, { hidden: true, due: "2026-01-05", addedAt: 1 });
  const existing = ve(2, { box: 4, due: "2026-02-01", wrongQids: ["old"] });
  const s = state({
    attempts: [at("q1", false, 100), at("q2", false, 100)],
    vocab: { T1: hidden, T2: existing },
  });
  const index = { q1: ["T1"], q2: ["T2"] };
  assert.equal(reconcileVocab(s, index, NOW), false);
  assert.deepEqual(s.vocab.T1, ve(1, { hidden: true, due: "2026-01-05", addedAt: 1 }));
  assert.deepEqual(s.vocab.T2, ve(2, { box: 4, due: "2026-02-01", wrongQids: ["old"] }));
});

test("captureVocabForQuestion: 新規作成し、同じqidは重複追記しない", () => {
  withTerms({ q1: ["T1", "T2"] }, () => {
    withLocalStorage({}, () => {
      assert.deepEqual(captureVocabForQuestion("q1"), ["T1", "T2"]);
      const s1 = loadState();
      assert.equal(s1.vocab.T1.box, 1);
      assert.equal(s1.vocab.T1.due, addDays(dstr(new Date()), 1));
      assert.deepEqual(s1.vocab.T1.wrongQids, ["q1"]);
      // 2回目: 追記なし(重複しない)が、表示用一覧は返る
      assert.deepEqual(captureVocabForQuestion("q1"), ["T1", "T2"]);
      assert.deepEqual(loadState().vocab.T1.wrongQids, ["q1"]);
    });
  });
});

test("captureVocabForQuestion: wrongQids は上限8で打ち止め", () => {
  withTerms({ q9: ["T1"] }, () => {
    const store = {};
    const full = ["a", "b", "c", "d", "e", "f", "g", "h"];
    seedStore(store, state({ vocab: { T1: ve(1, { wrongQids: [...full] }) } }));
    withLocalStorage(store, () => {
      assert.deepEqual(captureVocabForQuestion("q9"), ["T1"]);
      assert.deepEqual(loadState().vocab.T1.wrongQids, full); // 追記されない
    });
  });
});

test("captureVocabForQuestion: hidden は触らず結果にも含めない", () => {
  withTerms({ q1: ["T1", "T2"] }, () => {
    const store = {};
    const hidden = ve(1, { hidden: true, due: "2026-01-05" });
    seedStore(store, state({ vocab: { T1: hidden } }));
    withLocalStorage(store, () => {
      assert.deepEqual(captureVocabForQuestion("q1"), ["T2"]);
      const s = loadState();
      assert.deepEqual(s.vocab.T1, hidden); // 復活しない
      assert.deepEqual(s.vocab.T2.wrongQids, ["q1"]);
    });
  });
});

test("captureVocabForQuestion: 辞書未ロードなら何もしない", () => {
  __setTermsDataForTest(null);
  const store = {};
  withLocalStorage(store, () => {
    assert.deepEqual(captureVocabForQuestion("q1"), []);
    assert.equal(store["ap-study:v1"], undefined); // 保存もしない
  });
});

test("recordVocabAnswer: 正解で 1→2→3→4→5(卒業)、誤答で 1 に戻る", () => {
  const store = {};
  seedStore(store, state({ vocab: { T1: ve(1, { due: "2026-01-01" }) } }));
  withLocalStorage(store, () => {
    const today = dstr(new Date());
    const expected = [
      [2, addDays(today, 3)],
      [3, addDays(today, 7)],
      [4, addDays(today, 14)],
      [5, "9999-12-31"], // 卒業
    ];
    for (const [box, due] of expected) {
      recordVocabAnswer("T1", true);
      const e = readStore(store).vocab.T1;
      assert.equal(e.box, box);
      assert.equal(e.due, due);
      assert.ok(e.u > 0); // u 更新込み
    }
    // 卒業後でも誤答すれば box=1・明日に戻る
    recordVocabAnswer("T1", false);
    const e = readStore(store).vocab.T1;
    assert.equal(e.box, 1);
    assert.equal(e.due, addDays(today, 1));
    // 未知の termId は何もしない(例外なし)
    assert.doesNotThrow(() => recordVocabAnswer("nope", true));
  });
});

test("dueVocabIds: 卒業・hidden・期日前を除き、期日の古い順", () => {
  const today = dstr(new Date());
  const s = state({
    vocab: {
      B: ve(1, { box: 1, due: today, addedAt: 2 }),
      A: ve(1, { box: 2, due: addDays(today, -3), addedAt: 1 }),
      C: ve(1, { box: 1, due: addDays(today, 1) }), // 期日前
      D: ve(1, { box: 1, due: addDays(today, -5), hidden: true }),
      E: ve(1, { box: 5, due: addDays(today, -1) }), // 卒業
    },
  });
  assert.deepEqual(dueVocabIds(s), ["A", "B"]);
});

test("setVocabMemo/setVocabHidden: 値と u を更新する", () => {
  const store = {};
  seedStore(store, state({ vocab: { T1: ve(1) } }));
  withLocalStorage(store, () => {
    setVocabMemo("T1", "覚え方メモ");
    assert.equal(readStore(store).vocab.T1.memo, "覚え方メモ");
    setVocabMemo("T1", ""); // 空なら削除
    assert.equal("memo" in readStore(store).vocab.T1, false);
    setVocabHidden("T1", true);
    const e = readStore(store).vocab.T1;
    assert.equal(e.hidden, true);
    assert.ok(e.u > 1);
    setVocabHidden("T1", false);
    assert.equal("hidden" in readStore(store).vocab.T1, false);
  });
});

test("vocabCounts: hidden を除いて収載・学習中・卒業・期日を数える", () => {
  const today = dstr(new Date());
  const s = state({
    vocab: {
      A: ve(1, { box: 1, due: today }), // 学習中かつ期日
      B: ve(1, { box: 3, due: addDays(today, 7) }), // 学習中
      C: ve(1, { box: 5, due: "9999-12-31" }), // 卒業
      D: ve(1, { box: 1, due: today, hidden: true }), // 除外
    },
  });
  assert.deepEqual(vocabCounts(s), { noted: 3, learning: 2, graduated: 1, due: 1 });
});

test("mergeStates: vocab はエントリ単位LWW(u の大きい方が勝つ)", () => {
  const a = state({
    updatedAt: 100, // 全体としては a が新しい
    vocab: { T1: ve(5, { memo: "a側" }), T2: ve(1) },
  });
  const b = state({
    updatedAt: 50,
    vocab: { T1: ve(10, { memo: "b側" }), T3: ve(2) },
  });
  const m = mergeStates(a, b);
  // 全体の新旧に関係なく、エントリは u の大きい b 側が勝つ
  assert.equal(m.vocab.T1.memo, "b側");
  assert.equal(m.vocab.T1.u, 10);
  // 片側にしかないエントリは両方残る
  assert.deepEqual(m.vocab.T2, ve(1));
  assert.deepEqual(m.vocab.T3, ve(2));
});

test("mergeStates: 未知フィールドを落とさない(将来の後方互換)", () => {
  const a = state({
    updatedAt: 100,
    attempts: [at("q1", true, 1)],
    futureField: { x: 1 }, // 新しいクライアントが追加した想定のフィールド
  });
  const b = state({
    updatedAt: 50,
    attempts: [at("q2", false, 2)],
    futureField: { x: 2 },
    olderOnly: "keep",
  });
  const m = mergeStates(a, b);
  assert.deepEqual(m.futureField, { x: 1 }); // 競合は新しい方(a)が勝つ
  assert.equal(m.olderOnly, "keep"); // 古い側にしか無くても残る
  // 既知フィールドは従来どおりマージされる
  assert.deepEqual(
    m.attempts.map((x) => x.q),
    ["q1", "q2"]
  );
  assert.equal(m.updatedAt, 100);
});

test("importJson: vocab の無い旧バックアップでも現在のことば帳を温存する", () => {
  const store = {};
  seedStore(store, state({ vocab: { T1: ve(7) }, updatedAt: 10 }));
  withLocalStorage(store, () => {
    // 旧バックアップ(vocab フィールドなし)
    importJson(JSON.stringify(state({ attempts: [at("q1", true, 1)], updatedAt: 5 })));
    const s = loadState();
    assert.deepEqual(s.vocab.T1, ve(7)); // 温存される
    assert.equal(s.attempts.length, 1); // 中身はインポート側
    // vocab を持つバックアップなら、そのままインポート側が使われる
    importJson(JSON.stringify(state({ vocab: { T9: ve(3) }, updatedAt: 6 })));
    const s2 = loadState();
    assert.deepEqual(s2.vocab, { T9: ve(3) });
  });
});
