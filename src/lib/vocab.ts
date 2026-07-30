/**
 * ことば帳(語彙SRS)のロジック。
 *
 * 用語エントリは誤答した問題から自動採取する(attempts が真実の源)。
 * 純粋ロジック(reconcileVocab など)は state を引数に取りテスト可能な形にし、
 * localStorage への書込みは薄いラッパに分離する(srs.ts / progress.ts と同じ方針)。
 *
 * 箱の意味は問題側の Leitner と同じ 1-4。box=5 は「卒業」で出題対象から外れる。
 * ドリルの成績は attempts には積まない(問題側の分析・実績を汚さないため)。
 */

import { termsDataSync, type TermIndex } from "../data/terms";
import {
  addDaysStr,
  loadState,
  MAX_BOX,
  REVIEW_INTERVALS,
  saveState,
  todayStr,
  type ProgressState,
  type VocabEntry,
} from "./progress";

/** 卒業(box=5)の due。実質「二度と期日にならない」番兵値 */
export const GRADUATED_DUE = "9999-12-31";
/** 1エントリが保持する誤答問題IDの上限 */
export const WRONG_QIDS_MAX = 8;
/** バックフィル時の平準化: box=1 の新規語を1日あたり何語まで割り当てるか */
export const BACKFILL_PER_DAY = 20;

/**
 * attempts からことば帳エントリを導出・バックフィルする(冪等)。
 *
 * 誤答した問題(ok=false が1回でもある qid)に登場する用語のうち、
 * state.vocab に無いものだけを新規作成する。既存エントリは hidden 含め
 * 一切触らないので、何度呼んでも2回目以降は変化しない。
 *
 * 新規エントリの初期値:
 * - wrongQids: その用語の誤答qid(初回誤答の古い順、上限8)
 * - addedAt: その用語の最初の誤答 attempt の t
 * - box: 全 wrongQids の最新 attempt が正解なら 3(もう解ける問題由来は後回し)、
 *        1つでも最新が誤答なら 1
 * - due: box=3 は +7日固定。box=1 は addedAt 昇順に明日から1日20語ずつずらす
 *        (一括バックフィルで初日に大量の期日が積まれるのを防ぐ)
 *
 * @returns 変更があったか(呼び出し側は true のときだけ保存すればよい)
 */
export function reconcileVocab(
  state: ProgressState,
  index: TermIndex,
  now = Date.now()
): boolean {
  // qid ごとに「最初の誤答時刻」と「最新 attempt の正誤」を集計する
  const firstWrongAt = new Map<string, number>();
  const latestOk = new Map<string, boolean>();
  const latestT = new Map<string, number>();
  for (const a of state.attempts) {
    if (!a.ok && a.t < (firstWrongAt.get(a.q) ?? Infinity)) {
      firstWrongAt.set(a.q, a.t);
    }
    if (a.t >= (latestT.get(a.q) ?? -Infinity)) {
      latestT.set(a.q, a.t);
      latestOk.set(a.q, a.ok);
    }
  }

  // 用語ごとに誤答qidを集める(既存エントリはここで除外する)
  const vocab = (state.vocab ??= {});
  const wrongByTerm = new Map<string, string[]>();
  for (const qid of firstWrongAt.keys()) {
    for (const termId of index[qid] ?? []) {
      if (vocab[termId]) continue; // hidden 含め既存は一切触らない
      const list = wrongByTerm.get(termId) ?? [];
      list.push(qid);
      wrongByTerm.set(termId, list);
    }
  }
  if (wrongByTerm.size === 0) return false;

  const today = todayStr(new Date(now));
  const created: VocabEntry[] = [];
  for (const [termId, qids] of wrongByTerm) {
    qids.sort((x, y) => firstWrongAt.get(x)! - firstWrongAt.get(y)!);
    const wrongQids = qids.slice(0, WRONG_QIDS_MAX);
    // 全 wrongQids の最新 attempt が正解 → もう解ける問題由来なので後回し(box=3)
    const solved = wrongQids.every((q) => latestOk.get(q));
    const entry: VocabEntry = {
      box: solved ? 3 : 1,
      due: addDaysStr(today, REVIEW_INTERVALS[2]), // box=1 は後段で振り直す
      wrongQids,
      addedAt: firstWrongAt.get(wrongQids[0])!,
      u: now,
    };
    vocab[termId] = entry;
    created.push(entry);
  }

  // due の平準化: 新規作成分を addedAt 昇順に並べ、box=1 を明日から20語/日で割当
  created.sort((x, y) => x.addedAt - y.addedAt);
  let i = 0;
  for (const e of created) {
    if (e.box !== 1) continue;
    e.due = addDaysStr(today, 1 + Math.floor(i / BACKFILL_PER_DAY));
    i += 1;
  }
  return true;
}

/** 起動時などに呼ぶ薄いラッパ。辞書が未ロードなら黙ってスキップする */
export function reconcileVocabFromStorage(): boolean {
  const data = termsDataSync();
  if (!data) return false;
  const s = loadState();
  if (!reconcileVocab(s, data.index)) return false;
  saveState(s);
  return true;
}

/**
 * 誤答直後の採取。この問題に登場する用語をことば帳に追加し、
 * 表示用の termId 一覧(hidden 除く)を返す。辞書が未ロードなら何もしない。
 */
export function captureVocabForQuestion(qid: string): string[] {
  const data = termsDataSync();
  if (!data) return [];
  const termIds = data.index[qid] ?? [];
  if (termIds.length === 0) return [];
  const s = loadState();
  const vocab = (s.vocab ??= {});
  const now = Date.now();
  const visible: string[] = [];
  let changed = false;
  for (const termId of termIds) {
    const entry = vocab[termId];
    if (!entry) {
      vocab[termId] = {
        box: 1,
        due: addDaysStr(todayStr(), 1),
        wrongQids: [qid],
        addedAt: now,
        u: now,
      };
      visible.push(termId);
      changed = true;
    } else if (entry.hidden) {
      // ユーザーが非表示にした用語は復活させず、結果にも含めない
      continue;
    } else {
      if (!entry.wrongQids.includes(qid) && entry.wrongQids.length < WRONG_QIDS_MAX) {
        entry.wrongQids.push(qid);
        entry.u = now;
        changed = true;
      }
      visible.push(termId);
    }
  }
  if (changed) saveState(s);
  return visible;
}

/**
 * ことばドリルの解答を記録し、箱を遷移させる。
 * 正解: box+1(box>=4 なら卒業=box5)、不正解: box=1 に戻す。
 * attempts には積まない(問題側の統計・実績を汚さない)。
 */
export function recordVocabAnswer(termId: string, ok: boolean): void {
  const s = loadState();
  const entry = s.vocab?.[termId];
  if (!entry) return;
  const today = todayStr();
  if (ok) {
    if (entry.box >= MAX_BOX) {
      entry.box = 5; // 卒業
      entry.due = GRADUATED_DUE;
    } else {
      entry.box += 1;
      entry.due = addDaysStr(today, REVIEW_INTERVALS[entry.box - 1]);
    }
  } else {
    entry.box = 1;
    entry.due = addDaysStr(today, REVIEW_INTERVALS[0]);
  }
  entry.u = Date.now();
  saveState(s);
}

/** 今日が期日のことばドリル対象 termId 一覧(卒業・hidden を除き、期日の古い順) */
export function dueVocabIds(state = loadState()): string[] {
  const today = todayStr();
  return Object.entries(state.vocab ?? {})
    .filter(([, e]) => e.box <= MAX_BOX && e.due <= today && !e.hidden)
    .sort((x, y) =>
      x[1].due !== y[1].due ? (x[1].due < y[1].due ? -1 : 1) : x[1].addedAt - y[1].addedAt
    )
    .map(([termId]) => termId);
}

/** メモを保存する(空文字なら削除)。u 更新込み */
export function setVocabMemo(termId: string, memo: string): void {
  const s = loadState();
  const entry = s.vocab?.[termId];
  if (!entry) return;
  if (memo) entry.memo = memo;
  else delete entry.memo;
  entry.u = Date.now();
  saveState(s);
}

/** 非表示フラグを切り替える(false なら削除してJSONを小さく保つ)。u 更新込み */
export function setVocabHidden(termId: string, hidden: boolean): void {
  const s = loadState();
  const entry = s.vocab?.[termId];
  if (!entry) return;
  if (hidden) entry.hidden = true;
  else delete entry.hidden;
  entry.u = Date.now();
  saveState(s);
}

export interface VocabCounts {
  noted: number; // 収載数(hidden を除く)
  learning: number; // 学習中(box 1-4)
  graduated: number; // 卒業(box 5)
  due: number; // 今日が期日
}

/** ことば帳一覧の統計行用。hidden はすべての数字から除外する */
export function vocabCounts(state = loadState()): VocabCounts {
  const today = todayStr();
  const counts: VocabCounts = { noted: 0, learning: 0, graduated: 0, due: 0 };
  for (const e of Object.values(state.vocab ?? {})) {
    if (e.hidden) continue;
    counts.noted += 1;
    if (e.box <= MAX_BOX) {
      counts.learning += 1;
      if (e.due <= today) counts.due += 1;
    } else {
      counts.graduated += 1;
    }
  }
  return counts;
}
