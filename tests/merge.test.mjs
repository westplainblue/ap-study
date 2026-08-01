import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeStates } from "../src/lib/progress.ts";

// 同期マージの回帰テスト。バグ調査で確認した「巻き戻り・復活」シナリオを固定する。

const base = (over = {}) => ({
  attempts: [],
  review: {},
  settings: {},
  updatedAt: 0,
  ...over,
});

/* ---------- 午後採点(pm): パーツ単位のLWW ---------- */

test("pm: 状態全体が古い側の新しい採点が勝つ(巻き戻りの防止)", () => {
  // 端末Aが10:00に×、端末Bが10:30に○へ修正、Aはその後(11:00)無関係な操作で
  // 状態全体としては新しい — それでも○(t=10:30)が生き残ること
  const a = base({
    pm: { pm1: { s1a: { grade: "x", my: "回答A", t: 10_000 } } },
    updatedAt: 11_000,
  });
  const b = base({
    pm: { pm1: { s1a: { grade: "o", my: "回答B", t: 10_500 } } },
    updatedAt: 10_500,
  });
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.equal(m.pm.pm1.s1a.grade, "o");
    assert.equal(m.pm.pm1.s1a.t, 10_500);
  }
});

test("pm: 片側にしかないAI講評は採点の勝敗と無関係に残る", () => {
  const ai = { suggested: "d", feedback: "AI講評", t: 9_000 };
  const withAi = base({
    pm: { pm1: { s1a: { grade: "d", t: 10_000, ai } } },
    updatedAt: 10_000,
  });
  const newerGrade = base({
    pm: { pm1: { s1a: { grade: "o", t: 12_000 } } },
    updatedAt: 12_000,
  });
  for (const m of [mergeStates(withAi, newerGrade), mergeStates(newerGrade, withAi)]) {
    assert.equal(m.pm.pm1.s1a.grade, "o"); // 採点は新しい方
    assert.deepEqual(m.pm.pm1.s1a.ai, ai); // 講評は消えない
  }
});

test("pm: 両側にAI講評があれば ai.t の新しい方", () => {
  const a = base({
    pm: { pm1: { s1a: { grade: "o", t: 10_000, ai: { feedback: "古い", t: 1_000 } } } },
    updatedAt: 10_000,
  });
  const b = base({
    pm: { pm1: { s1a: { grade: "o", t: 9_000, ai: { feedback: "新しい", t: 2_000 } } } },
    updatedAt: 9_000,
  });
  assert.equal(mergeStates(a, b).pm.pm1.s1a.ai.feedback, "新しい");
  assert.equal(mergeStates(b, a).pm.pm1.s1a.ai.feedback, "新しい");
});

test("pm: 片側にしかない設問・問題は失われない", () => {
  const a = base({
    pm: { pm1: { s1a: { grade: "o", t: 1 } } },
    updatedAt: 2,
  });
  const b = base({
    pm: { pm1: { s1b: { grade: "x", t: 1 } }, pm2: { s2a: { grade: "d", t: 1 } } },
    updatedAt: 1,
  });
  const m = mergeStates(a, b);
  assert.equal(m.pm.pm1.s1a.grade, "o");
  assert.equal(m.pm.pm1.s1b.grade, "x");
  assert.equal(m.pm.pm2.s2a.grade, "d");
});
