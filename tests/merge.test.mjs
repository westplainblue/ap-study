import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeStates } from "../src/lib/progress.ts";

// 同期マージの回帰テスト。バグ調査で確認した「巻き戻り・復活」シナリオを固定する。

const base = (over = {}) => ({
  attempts: [],
  review: {},
  settings: {},
  updatedAt: 0,
  ...over,
});

/* ---------- 午後採点(pm): パーツ単位のLWW ---------- */

test("pm: 状態全体が古い側の新しい採点が勝つ(巻き戻りの防止)", () => {
  // 端末Aが10:00に×、端末Bが10:30に○へ修正、Aはその後(11:00)無関係な操作で
  // 状態全体としては新しい — それでも○(t=10:30)が生き残ること
  const a = base({
    pm: { pm1: { s1a: { grade: "x", my: "回答A", t: 10_000 } } },
    updatedAt: 11_000,
  });
  const b = base({
    pm: { pm1: { s1a: { grade: "o", my: "回答B", t: 10_500 } } },
    updatedAt: 10_500,
  });
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.equal(m.pm.pm1.s1a.grade, "o");
    assert.equal(m.pm.pm1.s1a.t, 10_500);
  }
});

test("pm: 片側にしかないAI講評は採点の勝敗と無関係に残る", () => {
  const ai = { suggested: "d", feedback: "AI講評", t: 9_000 };
  const withAi = base({
    pm: { pm1: { s1a: { grade: "d", t: 10_000, ai } } },
    updatedAt: 10_000,
  });
  const newerGrade = base({
    pm: { pm1: { s1a: { grade: "o", t: 12_000 } } },
    updatedAt: 12_000,
  });
  for (const m of [mergeStates(withAi, newerGrade), mergeStates(newerGrade, withAi)]) {
    assert.equal(m.pm.pm1.s1a.grade, "o"); // 採点は新しい方
    assert.deepEqual(m.pm.pm1.s1a.ai, ai); // 講評は消えない
  }
});

test("pm: 両側にAI講評があれば ai.t の新しい方", () => {
  const a = base({
    pm: { pm1: { s1a: { grade: "o", t: 10_000, ai: { feedback: "古い", t: 1_000 } } } },
    updatedAt: 10_000,
  });
  const b = base({
    pm: { pm1: { s1a: { grade: "o", t: 9_000, ai: { feedback: "新しい", t: 2_000 } } } },
    updatedAt: 9_000,
  });
  assert.equal(mergeStates(a, b).pm.pm1.s1a.ai.feedback, "新しい");
  assert.equal(mergeStates(b, a).pm.pm1.s1a.ai.feedback, "新しい");
});

test("pm: 片側にしかない設問・問題は失われない", () => {
  const a = base({
    pm: { pm1: { s1a: { grade: "o", t: 1 } } },
    updatedAt: 2,
  });
  const b = base({
    pm: { pm1: { s1b: { grade: "x", t: 1 } }, pm2: { s2a: { grade: "d", t: 1 } } },
    updatedAt: 1,
  });
  const m = mergeStates(a, b);
  assert.equal(m.pm.pm1.s1a.grade, "o");
  assert.equal(m.pm.pm1.s1b.grade, "x");
  assert.equal(m.pm.pm2.s2a.grade, "d");
});

/* ---------- 復習(review): エントリ単位のLWWと卒業墓標 ---------- */

test("review: 卒業の墓標(u付き)は古いライブエントリに負けない(復活バグの根絶)", () => {
  // 状態全体としては墓標側が「古い」場合でも、エントリのuで勝つこと
  const grad = base({
    review: { q1: { box: 5, due: "9999-12-31", u: 500 } },
    updatedAt: 1_000,
  });
  const staleServer = base({
    review: { q1: { box: 4, due: "2026-07-01" } }, // 旧形式(u無し)の生き残り
    updatedAt: 2_000,
  });
  for (const m of [mergeStates(grad, staleServer), mergeStates(staleServer, grad)]) {
    assert.equal(m.review.q1.box, 5);
    assert.equal(m.review.q1.due, "9999-12-31");
  }
});

test("review: 箱の進捗はuの新しい方が勝つ(巻き戻り防止)", () => {
  const advanced = base({
    review: { q1: { box: 3, due: "2026-08-10", u: 200 } },
    updatedAt: 100,
  });
  const behind = base({
    review: { q1: { box: 1, due: "2026-08-02", u: 100 } },
    updatedAt: 9_000,
  });
  for (const m of [mergeStates(advanced, behind), mergeStates(behind, advanced)]) {
    assert.equal(m.review.q1.box, 3);
  }
});

test("review: 旧形式同士(u無し)は従来どおり新しい状態の側", () => {
  const a = base({ review: { q1: { box: 2, due: "2026-08-01" } }, updatedAt: 2_000 });
  const b = base({ review: { q1: { box: 1, due: "2026-08-05" } }, updatedAt: 1_000 });
  assert.equal(mergeStates(a, b).review.q1.box, 2);
  assert.equal(mergeStates(b, a).review.q1.box, 2);
});

test("review: 片側にしかないエントリは失われない", () => {
  const a = base({ review: { q1: { box: 1, due: "2026-08-01", u: 1 } }, updatedAt: 2 });
  const b = base({ review: { q2: { box: 5, due: "9999-12-31", u: 1 } }, updatedAt: 1 });
  const m = mergeStates(a, b);
  assert.equal(m.review.q1.box, 1);
  assert.equal(m.review.q2.box, 5);
});

/* ---------- 設定(settings): キー単位のLWWと削除の伝播 ---------- */

test("settings: キー削除(シャッフルON復帰)が同期で復活しない", () => {
  // OFF(false, t=100)をサーバへpush済み → ONへ戻す(キー削除, t=200)
  const reEnabled = base({
    settings: { syncCode: "X", meta: { shuffleChoices: 200, syncCode: 50 } },
    updatedAt: 300,
  });
  const staleServer = base({
    settings: {
      syncCode: "X",
      shuffleChoices: false,
      examDate: "2026-04-19",
      meta: { shuffleChoices: 100, syncCode: 50, examDate: 60 },
    },
    updatedAt: 250,
  });
  for (const m of [mergeStates(reEnabled, staleServer), mergeStates(staleServer, reEnabled)]) {
    assert.equal("shuffleChoices" in m.settings, false, "削除が勝つ");
    assert.equal(m.settings.examDate, "2026-04-19", "触っていないキーは残る");
    assert.equal(m.settings.syncCode, "X");
    assert.equal(m.settings.meta.shuffleChoices, 200, "削除の時刻が残り再復活も防ぐ");
  }
});

test("settings: 削除の後に他端末で再設定したら新しい方(再設定)が勝つ", () => {
  const deleted = base({ settings: { meta: { examDate: 100 } }, updatedAt: 1 });
  const reSet = base({
    settings: { examDate: "2026-10-11", meta: { examDate: 200 } },
    updatedAt: 2,
  });
  for (const m of [mergeStates(deleted, reSet), mergeStates(reSet, deleted)]) {
    assert.equal(m.settings.examDate, "2026-10-11");
  }
});

test("settings: キーごとに独立して勝敗が決まる", () => {
  const a = base({
    settings: { examDate: "2026-04-19", shuffleChoices: false, meta: { examDate: 200, shuffleChoices: 100 } },
    updatedAt: 1,
  });
  const b = base({
    settings: { examDate: "2026-10-11", meta: { examDate: 100, shuffleChoices: 200 } },
    updatedAt: 2,
  });
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.equal(m.settings.examDate, "2026-04-19"); // Aの方が新しい
    assert.equal("shuffleChoices" in m.settings, false); // Bの削除の方が新しい
  }
});

test("settings: meta の無い旧形式は従来互換(新しい状態優先・欠落は古い側で補完)", () => {
  const a = base({ settings: { examDate: "2026-04-19" }, updatedAt: 2_000 });
  const b = base({ settings: { examDate: "2026-01-01", syncCode: "OLD1" }, updatedAt: 1_000 });
  const m = mergeStates(a, b);
  assert.equal(m.settings.examDate, "2026-04-19"); // 新しい状態の側
  assert.equal(m.settings.syncCode, "OLD1"); // 片側にしか無いキーは補完
});

test("settings: applySetting は値の設定・削除の両方で時刻を打つ", async () => {
  const { applySetting } = await import("../src/lib/progress.ts");
  const s = base({ settings: {} });
  applySetting(s, "examDate", "2026-04-19");
  assert.equal(s.settings.examDate, "2026-04-19");
  assert.ok(s.settings.meta.examDate > 0);
  const t1 = s.settings.meta.examDate;
  applySetting(s, "examDate", undefined);
  assert.equal("examDate" in s.settings, false);
  assert.ok(s.settings.meta.examDate >= t1, "削除でも時刻が更新される");
});
