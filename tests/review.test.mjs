import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeReviewIds,
  addToReview,
  dueReviewIds,
  GRADUATED_DUE,
  isInReview,
  MAX_BOX,
  recordAnswer,
  recordAnswersBatch,
  repairReviewGraduations,
} from "../src/lib/progress.ts";

// 復習キューの卒業=墓標方式(削除は同期で復活するため廃止)の回帰テスト

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
const TODAY = dstr(new Date());

// node環境にはlocalStorageが無いのでスタブする(sessionStorageはtry/catchで不要)
function withLocalStorage(store, fn) {
  const stub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
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
const seed = (store, state) => {
  store["ap-study:v1"] = JSON.stringify(state);
};
const read = (store) => JSON.parse(store["ap-study:v1"]);

test("recordAnswer: 箱4で正解すると削除ではなく墓標(box5・due番兵・u付き)になる", () => {
  const store = {};
  withLocalStorage(store, () => {
    seed(store, {
      attempts: [],
      review: { q1: { box: MAX_BOX, due: TODAY } },
      settings: {},
      updatedAt: 0,
    });
    recordAnswer("q1", true, "review");
    const e = read(store).review.q1;
    assert.equal(e.box, MAX_BOX + 1);
    assert.equal(e.due, GRADUATED_DUE);
    assert.ok(e.u > 0);
  });
});

test("recordAnswer: 卒業(墓標)後の誤答は箱1へ復帰する", () => {
  const store = {};
  withLocalStorage(store, () => {
    seed(store, {
      attempts: [],
      review: { q1: { box: 5, due: GRADUATED_DUE, u: 1 } },
      settings: {},
      updatedAt: 0,
    });
    recordAnswer("q1", false, "practice");
    const e = read(store).review.q1;
    assert.equal(e.box, 1);
    assert.equal(e.due, addDays(TODAY, 1));
    assert.ok(e.u > 1);
  });
});

test("recordAnswersBatch: 模試でも卒業は墓標になる", () => {
  const store = {};
  withLocalStorage(store, () => {
    seed(store, {
      attempts: [],
      review: { q1: { box: MAX_BOX, due: TODAY }, q2: { box: 2, due: TODAY } },
      settings: {},
      updatedAt: 0,
    });
    recordAnswersBatch([
      { qid: "q1", ok: true, mode: "mock" },
      { qid: "q2", ok: true, mode: "mock" },
      { qid: "q3", ok: false, mode: "mock" },
    ]);
    const r = read(store).review;
    assert.equal(r.q1.box, 5);
    assert.equal(r.q2.box, 3); // 通常の昇格
    assert.equal(r.q3.box, 1); // 誤答は箱1
  });
});

test("isInReview / activeReviewIds / dueReviewIds: 墓標は「いない」扱い", () => {
  const store = {};
  withLocalStorage(store, () => {
    seed(store, {
      attempts: [],
      review: {
        live: { box: 2, due: "2020-01-01" },
        grad: { box: 5, due: GRADUATED_DUE, u: 1 },
        // 異常データ(墓標なのに過去due)でも出題対象にしない
        weird: { box: 5, due: "2020-01-01", u: 1 },
      },
      settings: {},
      updatedAt: 0,
    });
    assert.equal(isInReview("live"), true);
    assert.equal(isInReview("grad"), false);
    assert.deepEqual(activeReviewIds().sort(), ["live"]);
    assert.deepEqual(dueReviewIds(), ["live"]);
  });
});

test("addToReview: 墓標は手動追加で箱1へ復帰、生きているエントリは触らない", () => {
  const store = {};
  withLocalStorage(store, () => {
    seed(store, {
      attempts: [],
      review: {
        grad: { box: 5, due: GRADUATED_DUE, u: 1 },
        live: { box: 3, due: "2030-01-01", u: 2 },
      },
      settings: {},
      updatedAt: 0,
    });
    addToReview("grad");
    addToReview("live");
    addToReview("fresh");
    const r = read(store).review;
    assert.equal(r.grad.box, 1);
    assert.equal(r.live.box, 3); // 変更なし
    assert.equal(r.fresh.box, 1);
  });
});

/* ---------- 修復リプレイ(過去のマージ欠陥で復活した卒業の掃除) ---------- */

const D = 86_400_000;
const T0 = new Date(`${addDays(TODAY, -60)}T12:00:00`).getTime(); // 60日前の正午
const at = (q, ok, t) => ({ q, t, ok, mode: "practice" });

// q1 を 誤答→4連続正解 で卒業させる履歴(箱1→2→3→4→卒業)
const GRAD_ATTEMPTS = [
  at("q1", false, T0),
  at("q1", true, T0 + 1 * D),
  at("q1", true, T0 + 4 * D),
  at("q1", true, T0 + 11 * D),
  at("q1", true, T0 + 25 * D),
];
// リプレイ上の歴史的状態のひとつ(box3 になった日 = T0+4日 の +7日)
const HIST_BOX3 = { box: 3, due: addDays(dstr(new Date(T0 + 4 * D)), 7) };

test("repair: 復活した歴史的スナップショットを墓標化する(uは卒業解答のt)", () => {
  const state = {
    attempts: [...GRAD_ATTEMPTS],
    review: { q1: { ...HIST_BOX3 } }, // 同期欠陥で復活した過去の状態(u無し)
    settings: {},
    updatedAt: 0,
  };
  assert.equal(repairReviewGraduations(state), true);
  assert.deepEqual(state.review.q1, { box: 5, due: GRADUATED_DUE, u: T0 + 25 * D });
  // 冪等: 2回目は変更なし
  assert.equal(repairReviewGraduations(state), false);
});

test("repair: リプレイで説明できないエントリ(手動追加など)は触らない", () => {
  const manual = { box: 1, due: addDays(TODAY, -3) }; // 歴史に存在しない(box,due)
  const state = {
    attempts: [...GRAD_ATTEMPTS],
    review: { q1: { ...manual } },
    settings: {},
    updatedAt: 0,
  };
  assert.equal(repairReviewGraduations(state), false);
  assert.deepEqual(state.review.q1, manual);
});

test("repair: uを持つ(新方式で実操作された)エントリは触らない", () => {
  const state = {
    attempts: [...GRAD_ATTEMPTS],
    review: { q1: { ...HIST_BOX3, u: 999 } },
    settings: {},
    updatedAt: 0,
  };
  assert.equal(repairReviewGraduations(state), false);
  assert.equal(state.review.q1.box, 3);
});

test("repair: 卒業後に誤答した問題は再入院が正なので墓標化しない", () => {
  const state = {
    attempts: [...GRAD_ATTEMPTS, at("q1", false, T0 + 40 * D)],
    review: {
      q1: { box: 1, due: addDays(dstr(new Date(T0 + 40 * D)), 1) }, // 再入院(正しい状態)
    },
    settings: {},
    updatedAt: 0,
  };
  assert.equal(repairReviewGraduations(state), false);
  assert.equal(state.review.q1.box, 1);
});

test("repair: キュー外の正解(初見の正解)は箱を作らない", () => {
  const state = {
    attempts: [at("q9", true, T0), at("q9", true, T0 + D)],
    review: {},
    settings: {},
    updatedAt: 0,
  };
  assert.equal(repairReviewGraduations(state), false);
  assert.deepEqual(state.review, {});
});
