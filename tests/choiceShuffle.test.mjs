import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayedIndex,
  hasStandaloneKana,
  isValidPerm,
  newChoicePerm,
  remapKanaLabels,
} from "../src/lib/choiceShuffle.ts";

// perm の意味: 表示位置 d に choices[perm[d]] を出す。
// perm=[2,0,3,1] なら 元ア(0)は表示イ(1), 元イ(1)は表示エ(3), 元ウ(2)は表示ア(0), 元エ(3)は表示ウ(2)。
const PERM = [2, 0, 3, 1];

test("newChoicePerm: 0..3の置換であり、十分な試行でランダム性がある", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const p = newChoicePerm();
    assert.deepEqual([...p].sort(), [0, 1, 2, 3]);
    seen.add(p.join(","));
  }
  assert.ok(seen.size >= 20, `24通り中 ${seen.size} 通りしか出ていない`);
});

test("displayedIndex: 元の添字から表示位置を引ける", () => {
  assert.equal(displayedIndex(PERM, 0), 1);
  assert.equal(displayedIndex(PERM, 1), 3);
  assert.equal(displayedIndex(PERM, 2), 0);
  assert.equal(displayedIndex(PERM, 3), 2);
});

test("remapKanaLabels: 記号参照を表示上の記号へ同時変換する", () => {
  assert.equal(remapKanaLabels("正解はア。", PERM), "正解はイ。");
  assert.equal(remapKanaLabels("よってエ。", PERM), "よってウ。");
  // 同時変換(逐次置換だと壊れるケース): ア→イ かつ イ→エ
  assert.equal(remapKanaLabels("ア・イは誤り", PERM), "イ・エは誤り");
  assert.equal(remapKanaLabels("(ウ誤り),(エ誤り)", PERM), "(ア誤り),(ウ誤り)");
  assert.equal(remapKanaLabels("これがイで正しい。", PERM), "これがエで正しい。");
});

test("remapKanaLabels: カタカナ語の一部は変換しない", () => {
  assert.equal(remapKanaLabels("アプリのウイルスとエラー", PERM), "アプリのウイルスとエラー");
  assert.equal(remapKanaLabels("ドアのイベント", PERM), "ドアのイベント");
  assert.equal(remapKanaLabels("ウェブとエンジニア", PERM), "ウェブとエンジニア");
  // 混在: 語中は保持、単独だけ変換
  assert.equal(
    remapKanaLabels("よってエ。アプリのイは誤り。", PERM),
    "よってウ。アプリのエは誤り。"
  );
});

test("remapKanaLabels: 恒等置換なら変化しない", () => {
  const id = [0, 1, 2, 3];
  const s = "正解はイ。ア・ウ・エは誤り。ウイルス対策。";
  assert.equal(remapKanaLabels(s, id), s);
});

test("isValidPerm: 保存データ由来の表示順の妥当性チェック", () => {
  assert.equal(isValidPerm([2, 0, 3, 1], 4), true);
  assert.equal(isValidPerm([0, 1, 2, 3], 4), true);
  assert.equal(isValidPerm([0, 1, 2], 4), false); // 長さ不一致
  assert.equal(isValidPerm([0, 1, 2, 2], 4), false); // 重複
  assert.equal(isValidPerm([1, 2, 3, 4], 4), false); // 範囲外
  assert.equal(isValidPerm(null, 4), false);
  assert.equal(isValidPerm("0123", 4), false);
});

test("hasStandaloneKana: 記号参照の検出", () => {
  assert.equal(hasStandaloneKana("正解はイ。"), true);
  assert.equal(hasStandaloneKana("(図のア)"), true);
  assert.equal(hasStandaloneKana("アプリとウイルスとエラーとイベント"), false);
  assert.equal(hasStandaloneKana("適切なものはどれか。"), false);
});
