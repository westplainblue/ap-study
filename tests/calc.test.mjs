import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { AM_QUESTIONS, isCalcQuestion } from "../src/data/index.ts";
import {
  CALC_THEMES,
  calcPool,
  calcThemeOf,
  statsByCalcTheme,
} from "../src/lib/calc.ts";
import { achievementRows, buildContext } from "../src/lib/achievements.ts";
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

// --- テーマ別の成績集計 --------------------------------------------------
// 待ち行列(目標120秒)と稼働率(目標120秒)の実在する問題IDで検証する
const Q_QUEUE = "2021r03a-am-02";
const Q_QUEUE2 = "2022r04h-am-03";
const Q_AVAIL = "2021r03h-am-14";

test("statsByCalcTheme: テーマごとに解答数と正解数を集計する", () => {
  const s = statsByCalcTheme([
    { q: Q_QUEUE, ok: true },
    { q: Q_QUEUE2, ok: false },
    { q: Q_AVAIL, ok: true },
  ]);
  assert.equal(s.get("queue").n, 2);
  assert.equal(s.get("queue").ok, 1);
  assert.equal(s.get("avail").n, 1);
  assert.equal(s.get("avail").ok, 1);
});

test("statsByCalcTheme: 計算問題でない解答は無視する", () => {
  const s = statsByCalcTheme([
    { q: "2022r04a-am-08", ok: true }, // 通常の文章択
    { q: "存在しないID", ok: true },
    { q: Q_QUEUE, ok: true },
  ]);
  assert.equal(s.size, 1);
  assert.equal(s.get("queue").n, 1);
});

test("statsByCalcTheme: 正答率は全モード、時間は ms を持つ解答だけを母数にする", () => {
  // 演習で解いた計算問題(ms なし)は正答率にだけ効く
  const s = statsByCalcTheme([
    { q: Q_QUEUE, ok: true }, // 分野別演習など: 時間の記録なし
    { q: Q_QUEUE2, ok: true, ms: 60_000 }, // 計算ドリル: 60秒
    { q: Q_QUEUE, ok: false, ms: 180_000 }, // 計算ドリル: 180秒(目標120秒超過)
  ]);
  const q = s.get("queue");
  assert.equal(q.n, 3, "正答率の母数は全モード");
  assert.equal(q.ok, 2);
  assert.equal(q.timedN, 2, "時間の母数は ms を持つものだけ");
  assert.equal(q.msTotal, 240_000);
  assert.equal(q.msTotal / q.timedN, 120_000, "平均120秒");
  assert.equal(q.inTime, 1, "目標120秒以内は60秒の1件のみ");
});

test("statsByCalcTheme: 目標秒数ちょうどは達成に数える", () => {
  const target = calcThemeOf(Q_QUEUE).targetSec;
  const s = statsByCalcTheme([{ q: Q_QUEUE, ok: true, ms: target * 1000 }]);
  assert.equal(s.get("queue").inTime, 1);
});

test("statsByCalcTheme: ms<=0 は計測不能として時間の母数に入れない", () => {
  const s = statsByCalcTheme([
    { q: Q_QUEUE, ok: true, ms: 0 },
    { q: Q_QUEUE2, ok: true, ms: -5 },
  ]);
  const q = s.get("queue");
  assert.equal(q.n, 2);
  assert.equal(q.timedN, 0, "平均が不当に速くならないこと");
  assert.equal(q.inTime, 0);
});

test("statsByCalcTheme: 空配列なら空のMap", () => {
  assert.equal(statsByCalcTheme([]).size, 0);
});

// --- 計算ドリルの実績 ------------------------------------------------------

const stateOf = (attempts) => ({
  attempts: attempts.map((a, i) => ({ t: 1_700_000_000_000 + i * 1000, mode: "calc", ...a })),
  review: {},
  settings: {},
  updatedAt: 0,
});

test("実績: 目標時間内の正解だけが calcInTime に数えられる", () => {
  const target = calcThemeOf(Q_QUEUE).targetSec * 1000;
  const c = buildContext(
    stateOf([
      { q: Q_QUEUE, ok: true, ms: target - 1000 }, // 目標内 → 数える
      { q: Q_QUEUE2, ok: true, ms: target + 1000 }, // 超過 → 数えない
      { q: Q_AVAIL, ok: false, ms: 1000 }, // 誤答 → 数えない
      { q: Q_QUEUE, ok: true }, // 時間の記録なし(演習等) → 数えない
    ])
  );
  assert.equal(c.calcInTime, 1);
});

test("実績: 正解したテーマ数を数える(誤答だけのテーマは含めない)", () => {
  const c = buildContext(
    stateOf([
      { q: Q_QUEUE, ok: true },
      { q: Q_QUEUE2, ok: true }, // 同じ queue テーマ → 重複して数えない
      { q: Q_AVAIL, ok: false }, // 誤答のみの avail は踏破に入らない
    ])
  );
  assert.equal(c.calcThemesOk, 1);
});

test("実績: 全テーマで正解すると「公式の全踏破」が解除される", () => {
  // 各テーマの1問目を正解した履歴を作る
  const first = new Map();
  for (const [qid, themeId] of Object.entries(index)) {
    if (!first.has(themeId)) first.set(themeId, qid);
  }
  assert.equal(first.size, CALC_THEMES.length, "全テーマに問題がある前提");
  const c = buildContext(stateOf([...first.values()].map((q) => ({ q, ok: true }))));
  assert.equal(c.calcThemesOk, CALC_THEMES.length);

  const rows = achievementRows(stateOf([...first.values()].map((q) => ({ q, ok: true }))));
  const themes = rows.find((r) => r.def.id === "calc-themes");
  assert.ok(themes, "calc-themes 実績が定義されている");
  assert.equal(themes.unlocked, true);
});

test("実績: 計算問題を解いていなければ計算系の実績は未解除", () => {
  const rows = achievementRows(stateOf([{ q: "2022r04a-am-08", ok: true }]));
  for (const id of ["calc-speed", "calc-themes"]) {
    const r = rows.find((x) => x.def.id === id);
    assert.ok(r, `${id} が定義されている`);
    assert.equal(r.unlocked, false, `${id} は未解除であるべき`);
  }
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
