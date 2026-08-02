import assert from "node:assert/strict";
import { test } from "node:test";
import { AM_QUESTIONS, canShuffleChoices } from "../src/data/index.ts";
import { hasStandaloneKana } from "../src/lib/choiceShuffle.ts";

test("canShuffleChoices: 既知の除外ケースを弾く", () => {
  const byId = new Map(AM_QUESTIONS.map((q) => [q.id, q]));
  // 図中選択肢
  assert.equal(canShuffleChoices(byId.get("2025r07h-am-01")), false);
  // 4択でない(図中選択肢でもある)
  assert.equal(canShuffleChoices(byId.get("2022r04a-am-23")), false);
  // 範囲参照(イ〜エ / ア〜ウ / ア〜エ)
  assert.equal(canShuffleChoices(byId.get("2025r07a-am-40")), false);
  assert.equal(canShuffleChoices(byId.get("2025r07h-am-53")), false);
  assert.equal(canShuffleChoices(byId.get("2024r06h-am-06")), false);
  // 問題文が記号参照
  assert.equal(canShuffleChoices(byId.get("2025r07h-am-69")), false);
  // 通常の文章択(監査で安全確認済みの代表例)
  assert.equal(canShuffleChoices(byId.get("2022r04a-am-08")), true);
});

test("全収録問が解答可能(choicesが4つある)", () => {
  for (const q of AM_QUESTIONS) {
    assert.equal(q.choices.length, 4, `${q.id} の選択肢が ${q.choices.length} 個`);
    assert.ok(q.answer >= 0 && q.answer <= 3, q.id);
  }
});

test("canShuffleChoices: 全収録問の不変条件", () => {
  let eligible = 0;
  for (const q of AM_QUESTIONS) {
    if (!canShuffleChoices(q)) continue;
    eligible += 1;
    // シャッフル対象は必ず: 4択・図中選択肢でない・本文/選択肢に記号参照なし・範囲参照なし
    assert.equal(q.choices.length, 4, q.id);
    assert.ok(!q.choicesInFigure, q.id);
    assert.ok(!hasStandaloneKana(q.text), q.id);
    for (const c of q.choices) assert.ok(!hasStandaloneKana(c), q.id);
    assert.ok(
      !/[アイウエ]\s*[〜~-]\s*[アイウエ]/.test(`${q.explanation}\n${q.point ?? ""}`),
      q.id
    );
  }
  // 監査時の見積り(約530問)から大きく外れていないこと
  assert.ok(eligible >= 480, `シャッフル対象が少なすぎる: ${eligible}`);
  console.log(`シャッフル対象: ${eligible} / ${AM_QUESTIONS.length} 問`);
});
