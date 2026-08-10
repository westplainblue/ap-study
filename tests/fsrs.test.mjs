import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESIRED_RETENTION,
  FSRS_W,
  initialState,
  intervalDays,
  nextState,
  retrievability,
} from "../src/lib/fsrs.ts";

const approx = (a, b, eps = 0.05) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b} (±${eps})`);

test("retrievability: 定義どおり R(S,S)=0.9・R(0,S)=1・単調減少", () => {
  approx(retrievability(10, 10), 0.9, 1e-9);
  assert.equal(retrievability(0, 10), 1);
  assert.ok(retrievability(5, 10) > retrievability(20, 10));
});

test("intervalDays: 目標保持率0.9なら安定度そのもの(丸め・最低1日)", () => {
  assert.equal(intervalDays(10), 10);
  assert.equal(intervalDays(3.7145), 4);
  assert.equal(intervalDays(0.4872), 1); // 1日未満は翌日
  assert.equal(DESIRED_RETENTION, 0.9);
});

test("initialState: S0=w[G-1]、D0はAgainほど難しい", () => {
  approx(initialState(1).s, FSRS_W[0], 1e-9);
  approx(initialState(3).s, FSRS_W[2], 1e-9);
  approx(initialState(1).d, 7.6214, 0.001); // w4 + 2*w5
  approx(initialState(3).d, 5.1618, 0.001); // w4
  approx(initialState(4).d, 3.932, 0.001); // w4 - w5
});

test("nextState: 初回Good→期日どおりGoodで安定度が約14.8日に伸びる", () => {
  const first = initialState(3); // S=3.7145, D=5.1618
  const next = nextState(first, intervalDays(first.s), 3); // 4日後にGood
  approx(next.s, 14.8, 0.1);
  approx(next.d, 5.1618, 0.001); // Goodでは難易度が動かない
  assert.ok(next.s > first.s);
});

test("nextState: Againで安定度が崩れ、難易度が上がる(元のSは超えない)", () => {
  const prev = { s: 14.8, d: 5.1618 };
  const next = nextState(prev, 15, 1);
  approx(next.s, 3.15, 0.05);
  approx(next.d, 6.9, 0.05);
  assert.ok(next.s < prev.s);
  const early = nextState({ s: 100, d: 1 }, 0, 1); // どんな条件でも元のSでキャップ
  assert.ok(early.s <= 100);
});

test("nextState: 評価の順序 Hard < Good < Easy", () => {
  const prev = { s: 10, d: 5 };
  const hard = nextState(prev, 10, 2).s;
  const good = nextState(prev, 10, 3).s;
  const easy = nextState(prev, 10, 4).s;
  assert.ok(hard < good && good < easy, `${hard} < ${good} < ${easy}`);
});

test("nextState: 難易度は1〜10でクランプされる", () => {
  let st = { s: 5, d: 9.5 };
  for (let i = 0; i < 5; i++) st = nextState(st, 1, 1); // 連続Again
  assert.ok(st.d <= 10);
  let ez = { s: 5, d: 1.5 };
  for (let i = 0; i < 5; i++) ez = nextState(ez, 5, 4); // 連続Easy
  assert.ok(ez.d >= 1);
});

test("nextState: 早すぎる復習(経過0日)では安定度が伸びない", () => {
  const prev = { s: 10, d: 5 };
  approx(nextState(prev, 0, 3).s, 10, 1e-6); // R=1 → 増分0
});
