import { amQuestion } from "../data";
import type { AmQuestion } from "../data/types";

// 演習・復習の「進行中セッション」を localStorage に保存し、タブ破棄や再読込を
// またいで途中から再開できるようにする。学習履歴(progress: ap-study:v1)とは
// 別管理で、クラウド同期の対象外(端末内の一時状態)。
// 模試モード(MockExam/MockRun)の中断再開と同じ考え方。
export interface RunState {
  questionIds: string[]; // 出題順の問題ID(セットを固定して同じ問題で再開する)
  idx: number; // 現在の問題位置
  selected: number | null; // 現在の問題で選んだ選択肢(未解答は null)
  results: boolean[]; // 解答済み問題の正誤
  finished: boolean; // 結果画面に到達済みか
}

const storageKey = (key: string) => `ap-run:${key}`;

export function loadRun(key: string): RunState | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export function saveRun(key: string, state: RunState): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(state));
  } catch {
    // 保存領域が一杯などの場合は黙って諦める(演習自体は続行可能)
  }
}

export function clearRun(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/**
 * 保存済みセッションの問題IDから問題を復元する。
 * 「未完了」かつ「全IDが解決できる」場合のみ配列を返し、
 * それ以外(未保存/完了済み/データ変更でID解決不可)は null(=新規出題)。
 */
export function resumeQuestions(key: string): AmQuestion[] | null {
  const run = loadRun(key);
  if (!run || run.finished || run.questionIds.length === 0) return null;
  const questions: AmQuestion[] = [];
  for (const id of run.questionIds) {
    const q = amQuestion(id);
    if (!q) return null; // ID解決不可 → セッションを破棄して新規出題に倒す
    questions.push(q);
  }
  return questions;
}
