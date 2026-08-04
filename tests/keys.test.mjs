import assert from "node:assert/strict";
import { test } from "node:test";
import { choiceIndexFromKey, isPlainKey, isTypingTarget } from "../src/lib/keys.ts";

// 演習画面のキーボード操作の割り当て。表示位置(画面のア=0)を返す契約が肝で、
// これが崩れると選択肢シャッフル時に「画面のアを押したのにイが選ばれる」事故になる。

test("choiceIndexFromKey: 数字キーは1始まりで表示位置に対応する", () => {
  assert.equal(choiceIndexFromKey("1", 4), 0);
  assert.equal(choiceIndexFromKey("2", 4), 1);
  assert.equal(choiceIndexFromKey("3", 4), 2);
  assert.equal(choiceIndexFromKey("4", 4), 3);
});

test("choiceIndexFromKey: アルファベットは大小どちらでも同じ位置", () => {
  assert.equal(choiceIndexFromKey("a", 4), 0);
  assert.equal(choiceIndexFromKey("A", 4), 0);
  assert.equal(choiceIndexFromKey("d", 4), 3);
  assert.equal(choiceIndexFromKey("D", 4), 3);
});

test("choiceIndexFromKey: 選択肢の数を超えるキーは無効", () => {
  assert.equal(choiceIndexFromKey("5", 4), -1);
  assert.equal(choiceIndexFromKey("e", 4), -1);
  assert.equal(choiceIndexFromKey("9", 4), -1);
  // 選択肢が3つなら4番目以降は無効
  assert.equal(choiceIndexFromKey("4", 3), -1);
  assert.equal(choiceIndexFromKey("3", 3), 2);
});

test("choiceIndexFromKey: 0 と記号・修飾キー名は無効", () => {
  for (const k of ["0", "-", "Enter", " ", "Shift", "ArrowLeft", "F5", "あ"]) {
    assert.equal(choiceIndexFromKey(k, 4), -1, `${k} は無効であるべき`);
  }
});

test("choiceIndexFromKey: 選択肢0件なら常に無効(出題前の防御)", () => {
  assert.equal(choiceIndexFromKey("1", 0), -1);
  assert.equal(choiceIndexFromKey("a", 0), -1);
});

test("isPlainKey: 修飾キー付きはブラウザ側に譲る", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(isPlainKey(base), true);
  assert.equal(isPlainKey({ ...base, ctrlKey: true }), false); // Ctrl+1 はタブ切替
  assert.equal(isPlainKey({ ...base, metaKey: true }), false); // Cmd+1 も同様
  assert.equal(isPlainKey({ ...base, altKey: true }), false);
});

test("isTypingTarget: 入力中はキーを奪わない", () => {
  const el = (tagName, editable = false) => ({
    tagName,
    isContentEditable: editable,
  });
  assert.equal(isTypingTarget(el("INPUT")), true); // AIチャットの入力欄
  assert.equal(isTypingTarget(el("TEXTAREA")), true);
  assert.equal(isTypingTarget(el("SELECT")), true);
  assert.equal(isTypingTarget(el("DIV", true)), true);
  assert.equal(isTypingTarget(el("DIV")), false);
  assert.equal(isTypingTarget(el("BUTTON")), false);
  assert.equal(isTypingTarget(null), false);
});
