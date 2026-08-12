import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggByGroup,
  examIdOfQuestion,
  findMockSession,
  isPass,
  mockSessions,
  rateOf,
} from "../src/lib/mockHistory.ts";

/** 採点1回ぶんの attempts(recordAnswersBatch と同じく1ミリ秒刻みで並ぶ) */
const graded = (examId, oks, start) =>
  oks.map((ok, i) => ({
    q: `${examId}-am-${String(i + 1).padStart(2, "0")}`,
    t: start + i,
    ok,
    mode: "mock",
  }));

const DAY = 86400000;

test("examIdOfQuestion: 問題IDから試験回IDを取り出す", () => {
  assert.equal(examIdOfQuestion("2025r07a-am-01"), "2025r07a");
  assert.equal(examIdOfQuestion("2020r02o-am-80"), "2020r02o");
  // 午前問題の形式でないIDは特定できない
  assert.equal(examIdOfQuestion("2025r07a-pm-01"), null);
  assert.equal(examIdOfQuestion("q1"), null);
  assert.equal(examIdOfQuestion(""), null);
});

test("mockSessions: 一括記録された解答を1回の受験にまとめる", () => {
  const s = mockSessions(graded("2025r07a", [true, false, true, true], 1000));
  assert.equal(s.length, 1);
  assert.equal(s[0].examId, "2025r07a");
  assert.equal(s[0].at, 1000); // 最初の解答の時刻
  assert.equal(s[0].total, 4);
  assert.equal(s[0].correct, 3);
  assert.deepEqual(s[0].results, [true, false, true, true]);
  assert.deepEqual(s[0].qids, [
    "2025r07a-am-01",
    "2025r07a-am-02",
    "2025r07a-am-03",
    "2025r07a-am-04",
  ]);
});

test("mockSessions: 同じ回を解き直したら別の受験に分かれる", () => {
  const s = mockSessions([
    ...graded("2025r07a", [true, false], 1000),
    ...graded("2025r07a", [true, true], 1000 + DAY),
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[0].correct, 2); // 新しい順なので解き直しが先頭
  assert.equal(s[1].correct, 1);
});

test("mockSessions: 別の回は同時刻でも混ざらない", () => {
  const s = mockSessions([
    ...graded("2025r07a", [true, true], 1000),
    ...graded("2025r07h", [false, false], 1002),
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual(
    s.map((x) => x.examId),
    ["2025r07h", "2025r07a"]
  );
});

test("mockSessions: 新しい順で返す", () => {
  const s = mockSessions([
    ...graded("2025r07a", [true], 1000),
    ...graded("2025r07h", [true], 1000 + DAY),
    ...graded("2024r06a", [true], 1000 + 2 * DAY),
  ]);
  assert.deepEqual(
    s.map((x) => x.examId),
    ["2024r06a", "2025r07h", "2025r07a"]
  );
});

test("mockSessions: 記録順が前後していても時刻順に復元する", () => {
  // 同期のマージ後など、配列の並びが時刻順とは限らない場合
  const later = graded("2025r07a", [true, false], 1000 + DAY);
  const earlier = graded("2025r07a", [false, false], 1000);
  const s = mockSessions([...later, ...earlier]);
  assert.equal(s.length, 2);
  assert.equal(s[0].at, 1000 + DAY);
  assert.equal(s[1].at, 1000);
});

test("mockSessions: 模試以外のモードは無視する", () => {
  const s = mockSessions([
    { q: "2025r07a-am-01", t: 1, ok: true, mode: "practice" },
    { q: "2025r07a-am-02", t: 2, ok: false, mode: "review" },
    ...graded("2025r07a", [true], 1000),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].total, 1);
});

test("mockSessions: 試験回を特定できない問題IDは除く", () => {
  const s = mockSessions([
    { q: "unknown", t: 999, ok: true, mode: "mock" },
    ...graded("2025r07a", [true, true], 1000),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].total, 2);
});

test("mockSessions: 履歴が無ければ空配列", () => {
  assert.deepEqual(mockSessions([]), []);
  assert.deepEqual(
    mockSessions([{ q: "2025r07a-am-01", t: 1, ok: true, mode: "practice" }]),
    []
  );
});

test("mockSessions: 全問の正誤が取りこぼしなく復元される", () => {
  const oks = Array.from({ length: 80 }, (_, i) => i % 3 !== 0);
  const s = mockSessions(graded("2025r07a", oks, 1000));
  assert.equal(s.length, 1);
  assert.equal(s[0].total, 80);
  assert.equal(s[0].correct, oks.filter(Boolean).length);
  assert.deepEqual(s[0].results, oks);
});

test("isPass: 60%の合格ラインは必要正答数を切り上げて判定する", () => {
  assert.equal(isPass(48, 80), true); // ちょうど60%
  assert.equal(isPass(47, 80), false);
  assert.equal(isPass(80, 80), true);
  assert.equal(isPass(0, 80), false);
  // 端数が出る問題数(30問なら18問)
  assert.equal(isPass(18, 30), true);
  assert.equal(isPass(17, 30), false);
});

test("rateOf: 百分率に丸め、0問はnull", () => {
  assert.equal(rateOf(19, 80), 24); // 23.75 → 24
  assert.equal(rateOf(48, 80), 60);
  assert.equal(rateOf(0, 80), 0);
  assert.equal(rateOf(0, 0), null);
});

test("aggByGroup: 分類ごとに出題数と正解数を数える", () => {
  const [s] = mockSessions(graded("2025r07a", [true, false, true, true], 1000));
  const major = {
    "2025r07a-am-01": "T",
    "2025r07a-am-02": "T",
    "2025r07a-am-03": "M",
    "2025r07a-am-04": "S",
  };
  const agg = aggByGroup(s, (q) => major[q]);
  assert.deepEqual(agg.get("T"), { n: 2, ok: 1 });
  assert.deepEqual(agg.get("M"), { n: 1, ok: 1 });
  assert.deepEqual(agg.get("S"), { n: 1, ok: 1 });
  // 合計は出題数と一致する(取りこぼし・二重計上なし)
  const n = [...agg.values()].reduce((sum, v) => sum + v.n, 0);
  assert.equal(n, s.total);
});

test("findMockSession: 試験回IDと採点時刻で受験1回を特定する", () => {
  const attempts = [
    ...graded("2025r07a", [true, false], 1000),
    ...graded("2025r07h", [true, true], 1000 + DAY),
  ];
  const s = findMockSession(attempts, "2025r07a", 1000);
  assert.notEqual(s, null);
  assert.equal(s.examId, "2025r07a");
  assert.equal(s.correct, 1);
});

test("findMockSession: 同じ回を解き直した記録を採点時刻で見分ける", () => {
  const attempts = [
    ...graded("2025r07a", [true, false], 1000),
    ...graded("2025r07a", [true, true], 1000 + DAY),
  ];
  assert.equal(findMockSession(attempts, "2025r07a", 1000).correct, 1);
  assert.equal(findMockSession(attempts, "2025r07a", 1000 + DAY).correct, 2);
});

test("findMockSession: 該当が無ければ null(画面側で不在を扱えるように)", () => {
  const attempts = graded("2025r07a", [true, false], 1000);
  assert.equal(findMockSession(attempts, "2025r07a", 9999), null); // 時刻違い
  assert.equal(findMockSession(attempts, "2024r06a", 1000), null); // 回違い
  assert.equal(findMockSession([], "2025r07a", 1000), null); // 履歴なし
});

test("findMockSession: 時刻が数値でなければ null(URLの手打ち・壊れたリンク)", () => {
  const attempts = graded("2025r07a", [true], 1000);
  assert.equal(findMockSession(attempts, "2025r07a", Number("abc")), null);
  assert.equal(findMockSession(attempts, "2025r07a", Infinity), null);
});

test("findMockSession: 返るセッションは mockSessions と同じ内容", () => {
  const attempts = graded("2025r07a", [true, false, true], 1000);
  const [fromList] = mockSessions(attempts);
  assert.deepEqual(findMockSession(attempts, "2025r07a", fromList.at), fromList);
});

test("aggByGroup: 分類が引けない問題は除外する", () => {
  const [s] = mockSessions(graded("2025r07a", [true, false], 1000));
  const agg = aggByGroup(s, (q) => (q.endsWith("01") ? "T" : undefined));
  assert.equal(agg.size, 1);
  assert.deepEqual(agg.get("T"), { n: 1, ok: 1 });
});
