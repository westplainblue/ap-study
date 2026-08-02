import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { AM_QUESTIONS, isCalcQuestion } from "../src/data/index.ts";
import { CALC_THEMES, calcPool, calcThemeOf } from "../src/lib/calc.ts";
import { MODE_HINT, MODE_LABEL, MODE_ORDER } from "../src/lib/modeStats.ts";
import { mergeStates } from "../src/lib/progress.ts";

// 計算ドリルの生成物(calc-themes.json / calc-index.json)と判定ロジックの
// 不変条件を検証する。問題データを追加して索引が古くなると、ここで検知して
// `npm run build:calc` の再生成を促す。

const index = JSON.parse(
  readFileSync(new URL("../src/data/calc-index.json", import.meta.url), "utf8"),
);
const byId = new Map(AM_QUESTIONS.map((q) => [q.id, q]));

test("isCalcQuestion: Unicode上付き指数(10⁻⁶)の選択肢を計算問題と判定する", () => {
  // 令和3年度以降は指数を上付き文字で書く規約。10^-6 形式しか見ていなかった
  // 判定漏れの回帰テスト(選択肢は 5×10⁻⁶ など)
  assert.equal(isCalcQuestion(byId.get("2021r03a-am-17")), true);
});

test("isCalcQuestion: n² のような変数付きの式は数値と誤判定しない", () => {
  // 上付き文字の正規化で n²→n^2 となっても数値扱いにならないこと
  assert.equal(isCalcQuestion(byId.get("2022r04a-am-01")), false);
});

test("calc-index: 全計算問題がいずれかのテーマに属する", () => {
  for (const q of AM_QUESTIONS) {
    if (!isCalcQuestion(q)) continue;
    assert.ok(
      typeof index[q.id] === "string",
      `${q.id} がテーマ未分類です(npm run build:calc で再生成)`,
    );
  }
});

test("calc-index: 索引の全エントリが実在の計算問題と実在のテーマを指す", () => {
  const themeIds = new Set(CALC_THEMES.map((t) => t.id));
  for (const [qid, themeId] of Object.entries(index)) {
    const q = byId.get(qid);
    assert.ok(q, `索引の問題IDが不明: ${qid}`);
    assert.ok(isCalcQuestion(q), `索引に非計算問題が混入: ${qid}`);
    assert.ok(themeIds.has(themeId), `${qid} のテーマが未定義: ${themeId}`);
  }
});

test("calc-themes: テーマ定義が公式カードとして成立している", () => {
  const seen = new Set();
  for (const t of CALC_THEMES) {
    assert.ok(!seen.has(t.id), `テーマIDが重複: ${t.id}`);
    seen.add(t.id);
    assert.ok(t.name.length >= 2, `${t.id} の name が短すぎる`);
    assert.ok(t.icon.length > 0, `${t.id} に icon がない`);
    assert.ok(t.formula.length >= 10, `${t.id} の formula(公式)が短すぎる`);
    assert.ok(t.howTo.length >= 10, `${t.id} の howTo(解き方の型)が短すぎる`);
    assert.ok(
      t.targetSec >= 30 && t.targetSec <= 600,
      `${t.id} の targetSec が不自然: ${t.targetSec}`,
    );
  }
});

test("calc-themes: どのテーマにも問題が1問以上ある", () => {
  const counts = new Map();
  for (const themeId of Object.values(index)) {
    counts.set(themeId, (counts.get(themeId) ?? 0) + 1);
  }
  for (const t of CALC_THEMES) {
    assert.ok((counts.get(t.id) ?? 0) > 0, `テーマ ${t.id} に問題が1問もない`);
  }
});

test("calcPool / calcThemeOf: 索引と一致する", () => {
  assert.equal(calcPool([]).length, Object.keys(index).length);
  const queueOnly = calcPool(["queue"]);
  assert.ok(queueOnly.length > 0);
  for (const q of queueOnly) {
    assert.equal(calcThemeOf(q.id)?.id, "queue");
  }
});

test("modeStats: calc モードが表示定義に含まれる", () => {
  assert.ok(MODE_ORDER.includes("calc"));
  assert.equal(MODE_LABEL.calc, "計算ドリル");
  assert.ok(MODE_HINT.calc.length > 0);
});

test("mergeStates: 解答時間(ms)フィールドが同期マージで保持される", () => {
  const a = {
    attempts: [{ q: "x-1", t: 100, ok: true, mode: "calc", ms: 42000 }],
    review: {},
    settings: {},
    updatedAt: 100,
  };
  const b = { attempts: [], review: {}, settings: {}, updatedAt: 50 };
  const merged = mergeStates(a, b);
  assert.equal(merged.attempts.length, 1);
  assert.equal(merged.attempts[0].ms, 42000);
});
