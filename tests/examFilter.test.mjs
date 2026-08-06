import assert from "node:assert/strict";
import { test } from "node:test";
import { AM_QUESTIONS, countByMiddle, questionsByMiddle } from "../src/data/index.ts";

test("questionsByMiddle: 試験回で絞り込める", () => {
  const one = questionsByMiddle([], { examIds: ["2025r07h"] });
  assert.equal(one.length, 80);
  assert.ok(one.every((q) => q.examId === "2025r07h"));

  const two = questionsByMiddle([], { examIds: ["2025r07h", "2024r06h"] });
  assert.equal(two.length, 160);
  assert.ok(two.every((q) => q.examId === "2025r07h" || q.examId === "2024r06h"));
});

test("questionsByMiddle: 未指定・空配列なら全回", () => {
  assert.equal(questionsByMiddle([]).length, AM_QUESTIONS.length);
  assert.equal(questionsByMiddle([], { examIds: [] }).length, AM_QUESTIONS.length);
});

test("questionsByMiddle: 分野・計算除外と組み合わせられる", () => {
  const qs = questionsByMiddle(["セキュリティ"], {
    examIds: ["2025r07h"],
    excludeCalc: true,
  });
  assert.ok(qs.length > 0);
  assert.ok(qs.every((q) => q.middle === "セキュリティ" && q.examId === "2025r07h"));
  // 全回対象より件数が増えることはない
  assert.ok(qs.length <= questionsByMiddle(["セキュリティ"], { excludeCalc: true }).length);
});

test("excludeIds: 指定した問題IDが出題対象から外れる(未挑戦のみの土台)", () => {
  const all = questionsByMiddle([], { examIds: ["2025r07h"] });
  const skip = new Set(all.slice(0, 78).map((q) => q.id));
  const rest = questionsByMiddle([], { examIds: ["2025r07h"], excludeIds: skip });
  assert.equal(rest.length, 2);
  assert.ok(rest.every((q) => !skip.has(q.id)));

  // countByMiddle も同じ除外で数える(設定画面のチップ件数と実出題を一致させる)
  const counts = countByMiddle({ examIds: ["2025r07h"], excludeIds: skip });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 2);

  // 全問除外なら空
  const none = questionsByMiddle([], {
    examIds: ["2025r07h"],
    excludeIds: new Set(all.map((q) => q.id)),
  });
  assert.equal(none.length, 0);
});

test("countByMiddle: 試験回で絞ると合計がその回の問題数になる", () => {
  const counts = countByMiddle({ examIds: ["2022r04a"] });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 80);
  // questionsByMiddle と整合する
  for (const [middle, n] of counts) {
    assert.equal(
      questionsByMiddle([middle], { examIds: ["2022r04a"] }).length,
      n,
      middle
    );
  }
});
