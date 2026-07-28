import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findRanges,
  parseMarks,
  resolveMarks,
  segmentText,
  stripMarksBlock,
} from "../src/lib/aiHighlight.ts";

const REPLY = [
  "パーミッションマーケティングは同意を前提とする手法です。",
  "```marks",
  '[{"quote":"同意の範囲を段階的に広げ","style":"marker","note":"キーワード"},',
  ' {"quote":"パーミッションマーケティング","style":"underline"}]',
  "```",
].join("\n");

test("parseMarks: 返答末尾のブロックを解釈する", () => {
  const marks = parseMarks(REPLY);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].quote, "同意の範囲を段階的に広げ");
  assert.equal(marks[0].style, "marker");
  assert.equal(marks[0].note, "キーワード");
  assert.equal(marks[1].style, "underline");
});

test("parseMarks: 壊れたJSON・未完ブロック・無しは空配列", () => {
  assert.deepEqual(parseMarks("マークなしの返答"), []);
  assert.deepEqual(parseMarks("説明\n```marks\n[{bad json"), []); // 閉じフェンスなし
  assert.deepEqual(parseMarks("説明\n```marks\nnot json\n```"), []);
  assert.deepEqual(parseMarks('```marks\n{"quote":"配列でない"}\n```'), []);
});

test("parseMarks: 短すぎる引用と6件目以降は捨てる", () => {
  const many = JSON.stringify(
    Array.from({ length: 8 }, (_, i) => ({ quote: `引用テキスト${i}` }))
  );
  assert.equal(parseMarks("x\n```marks\n" + many + "\n```").length, 5);
  assert.deepEqual(parseMarks('x\n```marks\n[{"quote":"あ"}]\n```'), []);
});

test("stripMarksBlock: 表示用にブロックを除去する(未完ブロックも隠す)", () => {
  assert.equal(stripMarksBlock(REPLY), "パーミッションマーケティングは同意を前提とする手法です。");
  // ストリーミング途中(閉じフェンス未着)
  assert.equal(stripMarksBlock("説明の途中\n```marks\n[{\"quo"), "説明の途中");
  assert.equal(stripMarksBlock("ブロックなし"), "ブロックなし");
});

test("findRanges: 完全一致と表記ゆれ(全半角・空白・句読点)", () => {
  const text = "顧客から得る同意の範囲を段階的に広げながら,プロモーションを行う。";
  assert.deepEqual(findRanges(text, "同意の範囲"), [[6, 11]]);
  // ゆれ: カンマ全角化・空白混入・句点を.に
  assert.equal(findRanges(text, "広げながら，プロモーション").length, 1);
  assert.equal(findRanges(text, " 段階的に 広げ ").length, 1);
  assert.deepEqual(findRanges(text, "存在しない引用"), []);
});

test("findRanges: 複数出現は全部(上限つき)返す", () => {
  const text = "稼働率が高い。稼働率が低い。稼働率を求めよ。";
  assert.equal(findRanges(text, "稼働率").length, 3);
});

test("resolveMarks: 問題文と選択肢の両方に対応付ける", () => {
  const q = {
    text: "同意の範囲を段階的に広げる手法はどれか。",
    choices: ["アフィリエイト", "パーミッションマーケティング", "バイラル", "差別型"],
  };
  const res = resolveMarks(q, [
    { quote: "段階的に広げる", style: "marker" },
    { quote: "パーミッションマーケティング", style: "underline" },
    { quote: "どこにも無い", style: "marker" },
  ]);
  assert.deepEqual(
    res.map((m) => m.target),
    ["text", 1]
  );
  assert.equal(res[1].style, "underline");
});

test("segmentText: 範囲をセグメント列にする(重なりは統合)", () => {
  const text = "ABCDEFGHIJ";
  const segs = segmentText(text, [
    { start: 2, end: 5, style: "marker" },
    { start: 4, end: 7, style: "underline" }, // 重なり → 統合(先勝ち)
  ]);
  assert.deepEqual(
    segs.map((s) => [s.text, s.mark?.style ?? null]),
    [
      ["AB", null],
      ["CDEFG", "marker"],
      ["HIJ", null],
    ]
  );
  // 範囲なし・範囲外は安全
  assert.deepEqual(segmentText("AB", []), [{ text: "AB" }]);
  assert.equal(segmentText("AB", [{ start: 5, end: 9, style: "marker" }]).length, 1);
});
