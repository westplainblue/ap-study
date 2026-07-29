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
