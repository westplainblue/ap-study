/**
 * 頻出問題: 収録済みの過去問を解析して「同じ問題が複数回出題された」グループを
 * 出題回数順に見せ、そのまま解けるようにする。
 *
 * グループ分けは scripts/build-frequent-index.ts が生成する静的データ
 * (src/data/frequent-index.json)で、ここでは実行時の参照と並べ替えだけを行う。
 * 生成物と実データの整合は tests/frequent.test.mjs が保証する。
 */
import { amQuestion, EXAMS } from "../data";
import frequentIndexJson from "../data/frequent-index.json";
import type { AmQuestion, Major } from "../data/types";

export interface FrequentGroup {
  /** 安定キー(グループ内で最も古い回の問題ID) */
  id: string;
  /** 同一と判定された問題(古い回 → 新しい回) */
  questions: AmQuestion[];
  /** 出題に使う代表(最新回の版。表記が現行の規約に近い) */
  latest: AmQuestion;
  /** 出題された試験回の数(=出題回数) */
  count: number;
}

// EXAMS は新しい回が先。新しいほど大きい値にして「最近出た順」に使う
const examRecency = new Map(EXAMS.map((e, i) => [e.examId, EXAMS.length - i]));

function buildGroups(): FrequentGroup[] {
  const groups: FrequentGroup[] = [];
  for (const ids of frequentIndexJson as string[][]) {
    // 索引に載っていてもデータから消えた問題は除く(実行時も安全側に倒す)
    const questions = ids
      .map((id) => amQuestion(id))
      .filter((q): q is AmQuestion => Boolean(q));
    const count = new Set(questions.map((q) => q.examId)).size;
    if (count < 2) continue;
    groups.push({
      id: questions[0].id,
      questions,
      latest: questions[questions.length - 1],
      count,
    });
  }
  return sortFrequent(groups);
}

/** 一覧の並び: 出題回数の多い順 → 最新の出題が新しい順 → 問番号順 */
export function sortFrequent(groups: FrequentGroup[]): FrequentGroup[] {
  return [...groups].sort(
    (a, b) =>
      b.count - a.count ||
      (examRecency.get(b.latest.examId) ?? 0) - (examRecency.get(a.latest.examId) ?? 0) ||
      a.latest.number - b.latest.number
  );
}

/** 全グループ(出題回数順) */
export const FREQUENT_GROUPS: FrequentGroup[] = buildGroups();

const groupById = new Map(FREQUENT_GROUPS.map((g) => [g.id, g]));
const groupByQid = new Map<string, FrequentGroup>();
for (const g of FREQUENT_GROUPS) for (const q of g.questions) groupByQid.set(q.id, g);

export function frequentGroup(id: string): FrequentGroup | undefined {
  return groupById.get(id);
}

/** 問題が属する頻出グループ(再出題のない問題なら undefined) */
export function frequentGroupOf(qid: string): FrequentGroup | undefined {
  return groupByQid.get(qid);
}

/** 大分類で絞り込む(空配列なら全件) */
export function filterFrequentByMajor(
  groups: FrequentGroup[],
  majors: readonly Major[]
): FrequentGroup[] {
  if (majors.length === 0) return groups;
  const set = new Set(majors);
  return groups.filter((g) => set.has(g.latest.major));
}

export interface FrequentGroupStat {
  n: number; // 解答数(グループ内のどの版を解いても合算)
  ok: number; // 正解数
  /** 直近の解答が正解だったか(解答があるときのみ) */
  lastOk?: boolean;
}

/**
 * グループ別の成績。同じ問題の別の回の版を解いた履歴は「その問題を解いた」と
 * みなして合算する(どのモードで解いたかは問わない)。
 * 引数は Attempt[] を受けるが、必要な3項目だけの構造型にして progress への依存を避ける。
 */
export function statsByFrequentGroup(
  attempts: { q: string; ok: boolean; t: number }[]
): Map<string, FrequentGroupStat> {
  const map = new Map<string, FrequentGroupStat>();
  const lastAt = new Map<string, number>();
  for (const a of attempts) {
    const g = groupByQid.get(a.q);
    if (!g) continue;
    const cur = map.get(g.id) ?? { n: 0, ok: 0 };
    cur.n += 1;
    if (a.ok) cur.ok += 1;
    if ((lastAt.get(g.id) ?? -Infinity) <= a.t) {
      lastAt.set(g.id, a.t);
      cur.lastOk = a.ok;
    }
    map.set(g.id, cur);
  }
  return map;
}

/**
 * 出題する問題を選ぶ。一覧の並び(出題回数順)を保ったまま、各グループの代表
 * (最新回の版)を count 問まで返す。unsolvedFirst なら一度も解いていないグループを
 * 先に回し、解答済みはその後ろに(それぞれの中では一覧順のまま)。
 */
export function pickFrequentQuestions(
  groups: FrequentGroup[],
  count: number,
  opts: { unsolvedFirst?: boolean; stats?: ReadonlyMap<string, FrequentGroupStat> } = {}
): AmQuestion[] {
  let ordered = groups;
  if (opts.unsolvedFirst && opts.stats) {
    const stats = opts.stats;
    const unsolved = groups.filter((g) => (stats.get(g.id)?.n ?? 0) === 0);
    const solved = groups.filter((g) => (stats.get(g.id)?.n ?? 0) > 0);
    ordered = [...unsolved, ...solved];
  }
  return ordered.slice(0, Math.max(0, count)).map((g) => g.latest);
}
