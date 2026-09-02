import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { AM_QUESTIONS, EXAMS } from "../src/data/index.ts";
import {
  FREQUENT_GROUPS,
  filterFrequentByMajor,
  frequentGroup,
  frequentGroupOf,
  pickFrequentQuestions,
  sortFrequent,
  statsByFrequentGroup,
} from "../src/lib/frequent.ts";

// 頻出問題の生成物(frequent-index.json)と実データの整合、および一覧・出題ロジックの
// 不変条件を検証する。問題データを追加して索引が古くなったら
// `npm run build:frequent` で再生成する。

const index = JSON.parse(
  readFileSync(new URL("../src/data/frequent-index.json", import.meta.url), "utf8"),
);
const byId = new Map(AM_QUESTIONS.map((q) => [q.id, q]));
// EXAMS は新しい回が先
const recency = new Map(EXAMS.map((e, i) => [e.examId, EXAMS.length - i]));

test("frequent-index: 全エントリが実在の問題で、問題は1グループにしか属さない", () => {
  const seen = new Set();
  for (const ids of index) {
    for (const id of ids) {
      assert.ok(byId.has(id), `索引の問題IDが不明: ${id}(npm run build:frequent で再生成)`);
      assert.ok(!seen.has(id), `問題が複数グループに重複: ${id}`);
      seen.add(id);
    }
  }
});

test("frequent-index: 各グループは2回以上の試験回にまたがり、古い回→新しい回の順", () => {
  for (const ids of index) {
    const exams = new Set(ids.map((id) => byId.get(id).examId));
    assert.ok(exams.size >= 2, `${ids[0]} のグループが1回しか出題されていない`);
    assert.ok(ids.length <= 5, `${ids[0]} のグループが大きすぎる(誤結合の疑い)`);
    for (let i = 1; i < ids.length; i++) {
      const a = recency.get(byId.get(ids[i - 1]).examId);
      const b = recency.get(byId.get(ids[i]).examId);
      assert.ok(a <= b, `${ids[0]} のグループが古い順に並んでいない`);
    }
  }
});

test("frequent-index: 既知の再出題が束ねられている", () => {
  // SOAの説明(4回)と、同じ選択肢セットから別の理論を問うリーダシップ論(3回)
  const soa = frequentGroupOf("2020r02o-am-63");
  assert.ok(soa);
  assert.equal(soa.count, 4);
  const sl = frequentGroupOf("2021r03a-am-74");
  assert.ok(sl);
  assert.equal(sl.count, 3);
  assert.equal(frequentGroupOf("2022r04h-am-75")?.id, sl.id);
  assert.equal(frequentGroupOf("2023r05a-am-75")?.id, sl.id);
});

test("frequent-index: 別問題は束ねない(回帰)", () => {
  // 選択肢が図中の問題どうし: タイムチャートの論理回路とLED点灯回路は別問題
  const chart = frequentGroupOf("2024r06h-am-21");
  assert.ok(chart, "タイムチャートの論理回路は再出題されている");
  assert.notEqual(frequentGroupOf("2024r06a-am-21")?.id, chart.id);
  // 数値選択肢が偶然一致する計算問題(SQLの行数を数える別の問題)
  const a = frequentGroupOf("2022r04a-am-28");
  const b = frequentGroupOf("2023r05a-am-29");
  assert.ok(!a || !b || a.id !== b.id);
});

test("FREQUENT_GROUPS: 出題回数の多い順で、代表は最新の回の版", () => {
  assert.equal(FREQUENT_GROUPS.length, index.length);
  for (let i = 1; i < FREQUENT_GROUPS.length; i++) {
    assert.ok(FREQUENT_GROUPS[i - 1].count >= FREQUENT_GROUPS[i].count);
  }
  assert.equal(FREQUENT_GROUPS[0].id, "2020r02o-am-63", "先頭はSOA(4回)");
  for (const g of FREQUENT_GROUPS) {
    assert.equal(g.id, g.questions[0].id, "id は最古の問題ID");
    assert.equal(g.latest, g.questions[g.questions.length - 1]);
    for (const q of g.questions) {
      assert.ok(recency.get(q.examId) <= recency.get(g.latest.examId));
      assert.equal(frequentGroupOf(q.id)?.id, g.id);
    }
    assert.equal(frequentGroup(g.id), g);
  }
});

test("sortFrequent: 回数が同じなら最新の出題が新しい順", () => {
  const twice = FREQUENT_GROUPS.filter((g) => g.count === 2);
  const sorted = sortFrequent([...twice].reverse());
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      recency.get(sorted[i - 1].latest.examId) >= recency.get(sorted[i].latest.examId),
    );
  }
});

test("filterFrequentByMajor: 大分類で絞れ、空配列なら全件", () => {
  assert.equal(filterFrequentByMajor(FREQUENT_GROUPS, []).length, FREQUENT_GROUPS.length);
  const t = filterFrequentByMajor(FREQUENT_GROUPS, ["T"]);
  assert.ok(t.length > 0);
  assert.ok(t.every((g) => g.latest.major === "T"));
  const tm = filterFrequentByMajor(FREQUENT_GROUPS, ["T", "M"]);
  assert.ok(tm.length >= t.length);
});

// --- 成績の集計 ------------------------------------------------------------
const SOA = ["2020r02o-am-63", "2022r04h-am-62", "2024r06h-am-63", "2025r07a-am-62"];

test("statsByFrequentGroup: 別の回の版を解いた履歴も同じグループに合算する", () => {
  const s = statsByFrequentGroup([
    { q: SOA[0], ok: true, t: 100 },
    { q: SOA[3], ok: false, t: 200 },
    { q: "2025r07a-am-41", ok: true, t: 300 }, // 再出題のない問題は無視
  ]);
  assert.equal(s.size, 1);
  const g = s.get("2020r02o-am-63");
  assert.equal(g.n, 2);
  assert.equal(g.ok, 1);
  assert.equal(g.lastOk, false, "直近(t=200)の解答は不正解");
});

test("statsByFrequentGroup: lastOk は時刻順で決まる(配列順ではない)", () => {
  const s = statsByFrequentGroup([
    { q: SOA[1], ok: false, t: 500 },
    { q: SOA[2], ok: true, t: 100 },
  ]);
  assert.equal(s.get("2020r02o-am-63").lastOk, false);
});

// --- 出題の選択 ------------------------------------------------------------
test("pickFrequentQuestions: 一覧順のまま代表(最新版)を count 問返す", () => {
  const qs = pickFrequentQuestions(FREQUENT_GROUPS, 5);
  assert.equal(qs.length, 5);
  assert.deepEqual(
    qs.map((q) => q.id),
    FREQUENT_GROUPS.slice(0, 5).map((g) => g.latest.id),
  );
  assert.equal(pickFrequentQuestions(FREQUENT_GROUPS, 1000).length, FREQUENT_GROUPS.length);
  assert.equal(pickFrequentQuestions(FREQUENT_GROUPS, 0).length, 0);
});

test("pickFrequentQuestions: unsolvedFirst で解答済みグループを後ろに回す", () => {
  const stats = statsByFrequentGroup([{ q: SOA[0], ok: true, t: 1 }]);
  const qs = pickFrequentQuestions(FREQUENT_GROUPS, 3, { unsolvedFirst: true, stats });
  assert.ok(!qs.some((q) => SOA.includes(q.id)), "解答済みのSOAは先頭3問に入らない");
  const all = pickFrequentQuestions(FREQUENT_GROUPS, 1000, { unsolvedFirst: true, stats });
  assert.equal(all[all.length - 1].id, SOA[3], "解答済みは末尾(最新版で出題)");
  // stats を渡さなければ並びは変わらない
  const plain = pickFrequentQuestions(FREQUENT_GROUPS, 3, { unsolvedFirst: true });
  assert.equal(plain[0].id, SOA[3]);
});
