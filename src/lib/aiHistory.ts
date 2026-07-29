/**
 * AIチャット入力のプロンプト履歴。ターミナルの上下キー履歴と同じ操作感で、
 * ↑で過去の入力を古い方向へ、↓で新しい方向へたどり、最新まで戻ると
 * 入力途中だった下書きを復元する。履歴はこの端末のブラウザにのみ保存する。
 */

const KEY = "ap-study:ai-history";
const CAP = 50;

/** 履歴へ追加した新しい配列を返す(空・直前と同一は積まない、上限CAP) */
export function pushInto(list: string[], text: string, cap = CAP): string[] {
  const t = text.trim();
  if (!t) return list;
  if (list[list.length - 1] === t) return list;
  const next = [...list, t];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const a = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 保存できなくても履歴なしで動作継続 */
  }
}

// 複数行入力では矢印キーは本来カーソル移動に使う。ターミナル系エディタの
// 慣例に合わせ、履歴を呼ぶのは「↑は1行目にカーソルがあるとき」
// 「↓は最終行にカーソルがあるとき」だけにする。
export function isCaretOnFirstLine(value: string, pos: number): boolean {
  return !value.slice(0, pos).includes("\n");
}

export function isCaretOnLastLine(value: string, pos: number): boolean {
  return !value.slice(pos).includes("\n");
}
