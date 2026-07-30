import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";

// 生成物(terms.json / term-index.json)の不変条件を検証する。
// 抽出ロジック(scripts/build-terms.ts)を変えても、ここが守られていれば
// 「定義は必ず過去問からの逐語切り出し」という前提が壊れていないと言える。

const cards = JSON.parse(
  readFileSync(new URL("../src/data/terms.json", import.meta.url), "utf8"),
);
const index = JSON.parse(
  readFileSync(new URL("../src/data/term-index.json", import.meta.url), "utf8"),
);

const examsDir = new URL("../src/data/exams/", import.meta.url);
const questions = readdirSync(examsDir)
  .filter((f) => f.endsWith(".am.json"))
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, examsDir), "utf8")).am);
const questionById = new Map(questions.map((q) => [q.id, q]));

// build-terms.ts と同じ否定形設問の判定(逆定義カードの混入検知用)
const NEGATIVE_RE =
  /(ないものはどれか|ないのはどれか|誤っているもの|間違っているもの|適切でないもの|不適切なもの|該当しないもの|含まれないもの|関係しないもの|当てはまらないもの|ふさわしくないもの)/;

test("terms: 全カードの defQid が実在の問題IDを指す", () => {
  for (const c of cards) {
    assert.ok(questionById.has(c.defQid), `${c.id} の defQid が不明: ${c.defQid}`);
  }
});

test("terms: def は出典問題の text/choices/point いずれかの連続部分文字列(逐語性)", () => {
  for (const c of cards) {
    const q = questionById.get(c.defQid);
    const verbatim =
      q.text.includes(c.def) ||
      q.choices.some((ch) => ch.includes(c.def)) ||
      (q.point ?? "").includes(c.def);
    assert.ok(verbatim, `${c.id} の def が出典 ${c.defQid} に逐語一致しない: ${c.def}`);
  }
});

test("terms: id が一意", () => {
  const ids = new Set(cards.map((c) => c.id));
  assert.equal(ids.size, cards.length);
});

test("terms: 否定形設問由来のカードが存在しない(逆定義の混入防止)", () => {
  for (const c of cards) {
    const q = questionById.get(c.defQid);
    assert.ok(!NEGATIVE_RE.test(q.text), `${c.id} が否定形設問 ${c.defQid} 由来`);
  }
});

test("terms: 索引の qid が実在し termId がカードに存在する", () => {
  const cardIds = new Set(cards.map((c) => c.id));
  for (const [qid, termIds] of Object.entries(index)) {
    assert.ok(questionById.has(qid), `索引の qid が不明: ${qid}`);
    assert.ok(termIds.length <= 8, `${qid} の用語数が上限8を超過: ${termIds.length}`);
    for (const id of termIds) {
      assert.ok(cardIds.has(id), `索引 ${qid} の termId が不明: ${id}`);
    }
  }
});

test("terms: distractors は choice-def のみ・ちょうど3件", () => {
  for (const c of cards) {
    if (c.source === "choice-def") {
      assert.equal(c.distractors?.length, 3, `${c.id} の distractors が3件でない`);
    } else {
      assert.equal(c.distractors, undefined, `${c.id} (${c.source}) に distractors がある`);
    }
  }
});

test("terms: カード総数が300〜900の範囲(抽出の暴走検知)", () => {
  assert.ok(
    cards.length >= 300 && cards.length <= 900,
    `カード総数が想定範囲外: ${cards.length}`,
  );
});

test("terms: 各カードの qids は defQid を含み、実在の問題IDのみからなる", () => {
  for (const c of cards) {
    assert.ok(c.qids.includes(c.defQid), `${c.id} の qids に defQid がない`);
    for (const qid of c.qids) {
      assert.ok(questionById.has(qid), `${c.id} の qids に不明な問題ID: ${qid}`);
    }
  }
});
