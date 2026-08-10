import assert from "node:assert/strict";
import { test } from "node:test";
import { applyConfidence, dueReviewIds, mergeStates } from "../src/lib/progress.ts";

const at = (q, ok, conf, t = 100) => ({
  q,
  t,
  ok,
  mode: "practice",
  ...(conf ? { conf } : {}),
});
const state = (over = {}) => ({
  attempts: [],
  review: {},
  settings: {},
  updatedAt: 0,
  ...over,
});

test("applyConfidence: 誤答+自信あり → hc付き箱1(期日は維持)", () => {
  const s = state({
    attempts: [at("q1", false)],
    review: { q1: { box: 1, due: "2026-08-11", u: 1 } },
  });
  assert.equal(applyConfidence(s, "q1", "high", "2026-08-10", 500), true);
  assert.equal(s.attempts[0].conf, "high");
  assert.deepEqual(s.review.q1, { box: 1, due: "2026-08-11", u: 500, hc: true });
});

test("applyConfidence: 正解+まぐれ → 箱が進んでいても箱1に戻して翌日", () => {
  const s = state({
    attempts: [at("q1", true)],
    review: { q1: { box: 3, due: "2026-08-17", u: 1 } }, // 正解で進んだ直後を想定
  });
  applyConfidence(s, "q1", "low", "2026-08-10", 500);
  assert.deepEqual(s.review.q1, { box: 1, due: "2026-08-11", u: 500 });
});

test("applyConfidence: 正解+自信あり / 誤答+自信なし は記録のみで復習に触れない", () => {
  const s = state({
    attempts: [at("q1", true), at("q2", false, undefined, 200)],
    review: { q2: { box: 1, due: "2026-08-11", u: 1 } },
  });
  applyConfidence(s, "q1", "high", "2026-08-10", 500);
  applyConfidence(s, "q2", "low", "2026-08-10", 500);
  assert.equal(s.attempts[0].conf, "high");
  assert.equal(s.attempts[1].conf, "low");
  assert.equal(s.review.q1, undefined);
  assert.deepEqual(s.review.q2, { box: 1, due: "2026-08-11", u: 1 });
});

test("applyConfidence: 二重付与と未知IDは無視(false)", () => {
  const s = state({ attempts: [at("q1", false, "low")] });
  assert.equal(applyConfidence(s, "q1", "high", "2026-08-10", 500), false);
  assert.equal(s.attempts[0].conf, "low");
  assert.equal(applyConfidence(s, "zzz", "high", "2026-08-10", 500), false);
});

test("applyConfidence: 同じ問題を複数回解いていたら最新の解答に付く", () => {
  const s = state({
    attempts: [at("q1", false, undefined, 100), at("q1", true, undefined, 200)],
  });
  applyConfidence(s, "q1", "high", "2026-08-10", 500);
  assert.equal(s.attempts[0].conf, undefined);
  assert.equal(s.attempts[1].conf, "high");
});

test("dueReviewIds: 思い込み(hc)が最優先、その中では期日の古い順", () => {
  const s = state({
    review: {
      a: { box: 2, due: "2020-08-01" },
      b: { box: 1, due: "2020-08-02", hc: true },
      c: { box: 1, due: "2020-08-03", hc: true },
      d: { box: 5, due: "9999-12-31" }, // 卒業墓標は出ない
    },
  });
  assert.deepEqual(dueReviewIds(s), ["b", "c", "a"]);
});

test("mergeStates: 同一解答の重複は確信度メモを持つ側が残る", () => {
  const withConf = state({ attempts: [at("q1", false, "high")], updatedAt: 1 });
  const without = state({ attempts: [at("q1", false)], updatedAt: 2 });
  assert.equal(mergeStates(without, withConf).attempts[0].conf, "high");
  assert.equal(mergeStates(withConf, without).attempts[0].conf, "high");
});
