import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuizItems } from "../src/pages/VocabRun.tsx";

// ことばドリルの出題組み立て(buildQuizItems)を検証する。
// rng を固定して決定的にしつつ、並び(シャッフル結果)そのものではなく
// 「選択肢の集合」「正解添字の整合」といった不変条件を確認する。

const card = (id, over = {}) => ({
  id,
  term: id.toUpperCase(),
  def: `${id}の定義`,
  defQid: "q1",
  source: "point-pair",
  qids: ["q1"],
  middle: "ネットワーク",
  major: "T",
  ...over,
});
const dataOf = (cards) => ({
  cards,
  byId: new Map(cards.map((c) => [c.id, c])),
  index: {},
});
const ve = (box = 1) => ({ box, due: "2026-01-01", wrongQids: [], addedAt: 0, u: 1 });
const rng0 = () => 0; // 乱数を固定(決定的なシャッフル)

test("buildQuizItems: choice-def かつ box<=2 は定義文→用語で元問題の誤答肢を使う", () => {
  const c = card("t1", {
    source: "choice-def",
    distractors: ["ダミー1", "ダミー2", "ダミー3"],
  });
  const items = buildQuizItems(["t1"], dataOf([c]), { t1: ve(2) }, rng0);
  assert.equal(items.length, 1);
  assert.equal(items[0].askTerm, true);
  assert.deepEqual(
    [...items[0].choices].sort(),
    ["T1", "ダミー1", "ダミー2", "ダミー3"].sort()
  );
  assert.equal(items[0].choices[items[0].answer], "T1");
  assert.equal(items[0].fromBox, 2);
});

test("buildQuizItems: choice-def かつ box>=3 は用語→定義文で文字数±50%の定義を混ぜる", () => {
  const target = card("t1", {
    source: "choice-def",
    distractors: ["a", "b", "c"],
    def: "0123456789012345678万", // 20文字 → 許容は10〜30文字
  });
  const near1 = card("n1", { def: "x".repeat(10) }); // 下限ちょうど
  const near2 = card("n2", { def: "y".repeat(30) }); // 上限ちょうど
  const near3 = card("n3", { def: "z".repeat(20) });
  const far = card("f1", { def: "w".repeat(80) }); // 範囲外
  const items = buildQuizItems(
    ["t1"],
    dataOf([target, near1, near2, near3, far]),
    { t1: ve(3) },
    rng0
  );
  assert.equal(items[0].askTerm, false);
  assert.equal(items[0].choices.length, 4);
  assert.equal(items[0].choices[items[0].answer], target.def);
  assert.ok(!items[0].choices.includes(far.def)); // 近い定義が足りていれば範囲外は使わない
});

test("buildQuizItems: choice-def の逆向きで候補が足りなければ全体から補う", () => {
  const target = card("t1", {
    source: "choice-def",
    distractors: ["a", "b", "c"],
    def: "z".repeat(20),
  });
  // 同一 middle には範囲内の定義が1枚しかない → 他分野・範囲外まで順に広げる
  const near = card("n1", { def: "x".repeat(15) });
  const otherMiddle = card("o1", { middle: "セキュリティ", def: "y".repeat(25) });
  const far = card("f1", { def: "w".repeat(90) });
  const items = buildQuizItems(
    ["t1"],
    dataOf([target, near, otherMiddle, far]),
    { t1: ve(4) },
    rng0
  );
  assert.equal(items[0].choices.length, 4);
  assert.ok(items[0].choices.includes(near.def));
  assert.ok(items[0].choices.includes(otherMiddle.def));
  assert.ok(items[0].choices.includes(far.def)); // 最後の受け皿
});

test("buildQuizItems: point-pair は定義文→用語で同一 middle の用語を優先する", () => {
  const t = card("t1");
  const s1 = card("s1");
  const s2 = card("s2");
  const s3 = card("s3");
  const o1 = card("o1", { middle: "セキュリティ" });
  const items = buildQuizItems(
    ["t1"],
    dataOf([t, s1, s2, s3, o1]),
    { t1: ve(1) },
    rng0
  );
  assert.equal(items[0].askTerm, true);
  assert.deepEqual([...items[0].choices].sort(), ["S1", "S2", "S3", "T1"]);
  assert.ok(!items[0].choices.includes("O1")); // 同一 middle で足りている
});

test("buildQuizItems: 同一 middle で足りなければ全体の用語から補う", () => {
  const t = card("t1");
  const s1 = card("s1");
  const o1 = card("o1", { middle: "セキュリティ" });
  const o2 = card("o2", { middle: "データベース" });
  const items = buildQuizItems(["t1"], dataOf([t, s1, o1, o2]), { t1: ve(1) }, rng0);
  assert.deepEqual([...items[0].choices].sort(), ["O1", "O2", "S1", "T1"]);
});

test("buildQuizItems: 正解と同じ表記の用語は誤答肢に混ぜない(重複防止)", () => {
  const t = card("t1");
  const dup = card("t2", { term: "T1" }); // 正解と同名
  const s1 = card("s1");
  const s2 = card("s2");
  const s3 = card("s3");
  const items = buildQuizItems(
    ["t1"],
    dataOf([t, dup, s1, s2, s3]),
    { t1: ve(1) },
    rng0
  );
  assert.equal(items[0].choices.filter((c) => c === "T1").length, 1);
  assert.equal(new Set(items[0].choices).size, items[0].choices.length);
});

test("buildQuizItems: カード無し・エントリ無しの termId はスキップする", () => {
  const t = card("t1");
  assert.deepEqual(buildQuizItems(["nope"], dataOf([t]), { nope: ve(1) }, rng0), []);
  assert.deepEqual(buildQuizItems(["t1"], dataOf([t]), {}, rng0), []); // vocab に無い
  assert.equal(buildQuizItems(["t1"], dataOf([t]), { t1: ve(1) }, rng0).length, 1);
});

test("buildQuizItems: answer は常に正解を指し、正解位置は偏らない", () => {
  const cards = [
    card("t1", { source: "choice-def", distractors: ["d1", "d2", "d3"] }),
    card("t2"),
    card("t3", { source: "text-def" }),
    card("s1"),
    card("s2"),
    card("s3"),
  ];
  const vocab = { t1: ve(1), t2: ve(2), t3: ve(4) };
  const positions = new Set();
  for (let i = 0; i < 200; i++) {
    const items = buildQuizItems(["t1", "t2", "t3"], dataOf(cards), vocab);
    for (const it of items) {
      const expected = it.askTerm ? it.card.term : it.card.def;
      assert.equal(it.choices[it.answer], expected);
      positions.add(it.answer);
    }
  }
  // 200セッション回せば4位置すべてに正解が現れるはず(シャッフルの偏り検知)
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});
