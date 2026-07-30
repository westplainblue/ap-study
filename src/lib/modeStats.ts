/**
 * 学習モード別の正答率。
 *
 * 各モードは「何を測っているか」が違うので、合算した1つの正答率では実力も定着度も
 * 見えなくなる。モードごとに分けて出し、比較の前提(母集団の違い)を注記する。
 *
 * 各モードの記録単位は揃っている: 分野別演習・復習・模試は1問1回、反復学習も
 * 各問の初回解答だけを記録する(正解するまでの繰り返しは記録しない)ので、
 * どのモードの正答率も「初見/その回の1回目」に対する値として比較できる。
 */
import type { Attempt, Mode } from "./progress";

export interface Agg {
  n: number;
  ok: number;
}

/** 表示順(実力→定着→総合の並び) */
export const MODE_ORDER: Mode[] = ["practice", "drill", "review", "mock"];

export const MODE_LABEL: Record<Mode, string> = {
  practice: "分野別演習",
  drill: "反復学習",
  review: "復習",
  mock: "模試",
};

/** その数字が何を意味するか(取り違えを防ぐ一言) */
export const MODE_HINT: Record<Mode, string> = {
  practice: "初見が多い出題。いまの実力の目安",
  drill: "正解するまで繰り返す出題。記録は各問の初回解答のみ",
  review: "間隔をあけた解き直し。一度つまずいた問題が母集団なので低めに出やすい",
  mock: "80問通し・時間制約あり。本番に最も近い",
};

export function rateOf(a: Agg | undefined): number | null {
  return a && a.n > 0 ? Math.round((a.ok / a.n) * 100) : null;
}

function bump(map: Map<string, Agg>, key: string, ok: boolean): void {
  const cur = map.get(key) ?? { n: 0, ok: 0 };
  cur.n += 1;
  if (ok) cur.ok += 1;
  map.set(key, cur);
}

/** モード別の解答数・正解数 */
export function statsByMode(attempts: Attempt[]): Map<Mode, Agg> {
  const map = new Map<string, Agg>();
  for (const a of attempts) bump(map, a.mode, a.ok);
  return map as Map<Mode, Agg>;
}

/**
 * 分野 × モードの集計。groupOf が undefined を返した問題(収録から外れた等)は除く。
 * 分野の粒度は呼び出し側が決める(中分類はモードで割ると件数が少なくなり過ぎるため、
 * 画面では大分類でまとめている)。
 */
export function statsByGroupAndMode(
  attempts: Attempt[],
  groupOf: (questionId: string) => string | undefined
): Map<string, Map<Mode, Agg>> {
  const out = new Map<string, Map<Mode, Agg>>();
  for (const a of attempts) {
    const g = groupOf(a.q);
    if (g === undefined) continue;
    let inner = out.get(g);
    if (!inner) {
      inner = new Map();
      out.set(g, inner);
    }
    bump(inner as Map<string, Agg>, a.mode, a.ok);
  }
  return out;
}

/** 実際にデータがあるモードだけを表示順で返す */
export function modesWithData(byMode: Map<Mode, Agg>): Mode[] {
  return MODE_ORDER.filter((m) => (byMode.get(m)?.n ?? 0) > 0);
}
