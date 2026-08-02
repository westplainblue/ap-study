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
