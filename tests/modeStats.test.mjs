import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODE_ORDER,
  modesWithData,
  rateOf,
  statsByGroupAndMode,
  statsByMode,
} from "../src/lib/modeStats.ts";

const at = (q, ok, mode, t = 1) => ({ q, t, ok, mode });

const SAMPLE = [
  at("q1", true, "practice"),
  at("q2", false, "practice"),
  at("q3", true, "practice"),
  at("q4", true, "practice"),
  at("q1", false, "drill"),
  at("q5", true, "drill"),
  at("q2", true, "review"),
  at("q6", false, "review"),
  at("q7", true, "mock"),
];

test("statsByMode: モードごとに解答数と正解数を分ける", () => {
  const m = statsByMode(SAMPLE);
  assert.deepEqual(m.get("practice"), { n: 4, ok: 3 });
  assert.deepEqual(m.get("drill"), { n: 2, ok: 1 });
  assert.deepEqual(m.get("review"), { n: 2, ok: 1 });
  assert.deepEqual(m.get("mock"), { n: 1, ok: 1 });
  // 合計は元の件数と一致する(取りこぼし・二重計上なし)
  const total = [...m.values()].reduce((s, v) => s + v.n, 0);
  assert.equal(total, SAMPLE.length);
});

test("statsByMode: 同じ問題を別モードで解いても混ざらない", () => {
  const m = statsByMode(SAMPLE);
  // q1 は演習で正解・反復で不正解 → それぞれのモードに1件ずつ
  assert.equal(m.get("practice").ok, 3);
  assert.equal(m.get("drill").ok, 1);
});

test("statsByMode: 空配列なら空のMap", () => {
  assert.equal(statsByMode([]).size, 0);
});

test("rateOf: 百分率に丸め、0件はnull", () => {
  assert.equal(rateOf({ n: 4, ok: 3 }), 75);
  assert.equal(rateOf({ n: 3, ok: 2 }), 67); // 66.67 → 67
  assert.equal(rateOf({ n: 0, ok: 0 }), null);
  assert.equal(rateOf(undefined), null);
});

test("modesWithData: データのあるモードだけを表示順で返す", () => {
  assert.deepEqual(modesWithData(statsByMode(SAMPLE)), MODE_ORDER);
  const onlyDrill = statsByMode([at("q1", true, "drill")]);
  assert.deepEqual(modesWithData(onlyDrill), ["drill"]);
  // 0件のモードは含めない
  const zero = new Map([["practice", { n: 0, ok: 0 }]]);
  assert.deepEqual(modesWithData(zero), []);
});

test("MODE_ORDER: 演習→反復→復習→模試の順で重複なし", () => {
  assert.deepEqual(MODE_ORDER, ["practice", "drill", "review", "mock"]);
  assert.equal(new Set(MODE_ORDER).size, MODE_ORDER.length);
});

const MAJOR_OF = {
  q1: "tech",
  q2: "tech",
  q3: "mgmt",
  q4: "mgmt",
  q5: "tech",
  q6: "strat",
  q7: "tech",
};

test("statsByGroupAndMode: 分野×モードで集計する", () => {
  const g = statsByGroupAndMode(SAMPLE, (q) => MAJOR_OF[q]);
  assert.deepEqual(g.get("tech").get("practice"), { n: 2, ok: 1 }); // q1○ q2×
  assert.deepEqual(g.get("tech").get("drill"), { n: 2, ok: 1 }); // q1× q5○
  assert.deepEqual(g.get("mgmt").get("practice"), { n: 2, ok: 2 });
  assert.equal(g.get("mgmt").get("review"), undefined); // 未実施はキーなし
  assert.deepEqual(g.get("strat").get("review"), { n: 1, ok: 0 });
});

test("statsByGroupAndMode: 分野が引けない問題は除外する", () => {
  const g = statsByGroupAndMode(
    [at("unknown", true, "practice"), at("q1", true, "practice")],
    (q) => MAJOR_OF[q]
  );
  assert.equal(g.size, 1);
  assert.deepEqual(g.get("tech").get("practice"), { n: 1, ok: 1 });
});

test("statsByGroupAndMode: モード別の合計が分野合計と整合する", () => {
  const g = statsByGroupAndMode(SAMPLE, (q) => MAJOR_OF[q]);
  let n = 0;
  for (const inner of g.values()) for (const v of inner.values()) n += v.n;
  assert.equal(n, SAMPLE.length);
});
