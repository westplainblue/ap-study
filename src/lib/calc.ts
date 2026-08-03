/**
 * 計算ドリル: テーマ定義(公式カード)と問題→テーマ索引へのアクセス。
 *
 * テーマ分類は scripts/build-calc-index.ts が生成する静的データで、
 * ここでは実行時の参照だけを提供する。生成物と実データの整合
 * (全計算問題がいずれかのテーマに属する等)は tests/calc.test.mjs が保証する。
 */
import { amQuestion } from "../data";
import calcIndexJson from "../data/calc-index.json";
import calcThemesJson from "../data/calc-themes.json";
import type { AmQuestion } from "../data/types";

export interface CalcTheme {
  id: string;
  name: string;
  icon: string;
  /** このテーマの1問あたり目標秒数(午前平均108秒。計算問題は重いため90〜180秒) */
  targetSec: number;
  /** 公式そのもの(1〜3本を1行で) */
  formula: string;
  /** 解き方の型(手の動かし方) */
  howTo: string;
}

/** 全テーマ(定義順=画面の表示順) */
export const CALC_THEMES: CalcTheme[] = (
  calcThemesJson as { themes: CalcTheme[] }
).themes;

const themeById = new Map(CALC_THEMES.map((t) => [t.id, t]));
const themeIdByQid = calcIndexJson as Record<string, string>;

export function calcTheme(themeId: string): CalcTheme | undefined {
  return themeById.get(themeId);
}

/** 問題が属するテーマ(計算問題でなければ undefined) */
export function calcThemeOf(qid: string): CalcTheme | undefined {
  const id = themeIdByQid[qid];
  return id ? themeById.get(id) : undefined;
}

/**
 * テーマID → 問題リスト。索引に載っていてもデータから消えた問題は除く
 * (整合はテストで保証しているが、実行時も安全側に倒す)。
 */
export function calcQuestionsByTheme(): Map<string, AmQuestion[]> {
  const map = new Map<string, AmQuestion[]>();
  for (const t of CALC_THEMES) map.set(t.id, []);
  for (const [qid, themeId] of Object.entries(themeIdByQid)) {
    const q = amQuestion(qid);
    if (q) map.get(themeId)?.push(q);
  }
  return map;
}

/** 出題プール: 選択テーマの全問題(未選択=空配列なら全テーマ) */
export function calcPool(themeIds: string[]): AmQuestion[] {
  const wanted = themeIds.length ? new Set(themeIds) : null;
  const pool: AmQuestion[] = [];
  for (const [qid, themeId] of Object.entries(themeIdByQid)) {
    if (wanted && !wanted.has(themeId)) continue;
    const q = amQuestion(qid);
    if (q) pool.push(q);
  }
  return pool;
}

export interface CalcThemeStat {
  n: number; // 解答数
  ok: number; // 正解数
  timedN: number; // 解答時間が記録されている解答数
  msTotal: number; // 解答時間の合計(平均の算出用)
  inTime: number; // 目標秒数内に解けた数(timedN のうち)
}

/**
 * 計算テーマ別の成績。
 *
 * 正答率は**全モードの計算問題**から集計する。分野別演習や模試で解いた計算問題も
 * 「その公式を使えるか」を等しく表すので、計算ドリルに限ると母数が小さくなりすぎる。
 * 一方、解答時間は計算ドリルでしか記録していない(Attempt.ms)ので、
 * 平均時間と目標達成数は ms を持つ解答だけを母数にする。
 *
 * 引数は Attempt[] を受けるが、必要な3項目だけの構造型にして progress への依存を避ける。
 */
export function statsByCalcTheme(
  attempts: { q: string; ok: boolean; ms?: number }[]
): Map<string, CalcThemeStat> {
  const map = new Map<string, CalcThemeStat>();
  for (const a of attempts) {
    const theme = calcThemeOf(a.q);
    if (!theme) continue;
    const cur = map.get(theme.id) ?? {
      n: 0,
      ok: 0,
      timedN: 0,
      msTotal: 0,
      inTime: 0,
    };
    cur.n += 1;
    if (a.ok) cur.ok += 1;
    // ms<=0 は計測不能とみなして母数に入れない(平均が不当に速くなるのを防ぐ)
    if (a.ms !== undefined && a.ms > 0) {
      cur.timedN += 1;
      cur.msTotal += a.ms;
      if (a.ms <= theme.targetSec * 1000) cur.inTime += 1;
    }
    map.set(theme.id, cur);
  }
  return map;
}
