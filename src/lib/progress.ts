/**
 * 解答を記録したときの出題モード。
 * drill(反復学習)は 2026-07 まで practice として記録していたため、それ以前の
 * 反復ぶんは分野別演習に含まれる(履歴は書き換えない方針)。
 */
export type Mode = "practice" | "review" | "drill" | "mock";

export interface Attempt {
  q: string; // questionId
  t: number; // epoch ms
  ok: boolean;
  mode: Mode;
  s?: string; // 学習セッションID(R4: セッションをまたいだ successive relearning 用)
}

export interface ReviewEntry {
  box: number; // 1-4(Leitner)
  due: string; // YYYY-MM-DD
}

export interface Settings {
  examDate?: string; // YYYY-MM-DD
  syncCode?: string;
  /** 選択肢の並びを毎回シャッフルする(未設定=有効。模試は常に固定) */
  shuffleChoices?: boolean;
}

export type PmGrade = "o" | "d" | "x"; // ○ / △ / ×

export interface PmPartRecord {
  grade?: PmGrade; // ○/△/×(未採点なら undefined)
  my?: string; // 自分の解答
  t: number;
  /** AI採点の講評(任意)。suggested はAIが提示した評価で、grade はユーザーが変更可能。 */
  ai?: { suggested?: PmGrade; feedback: string; t: number };
}

/** 午後: 問題ID → 設問パーツキー → 自己採点 */
export type PmRecords = Record<string, Record<string, PmPartRecord>>;

export type AchvId = string;

export interface AchievementRecord {
  unlockedAt: number; // 初回解除の epoch ms(再導出不能なので保存)
  seen: boolean; // 解除トースト提示済み(二重発火防止)
  progress?: number; // 達成時点の値(非単調指標の後退救済に使う)
}

export type Achievements = Record<AchvId, AchievementRecord>;

/** ことば帳(語彙SRS)のエントリ。termId → VocabEntry で保持する */
export interface VocabEntry {
  box: number; // 1-4(Leitner)、5=卒業
  due: string; // YYYY-MM-DD
  wrongQids: string[]; // 契機となった誤答問題ID(上限8)
  addedAt: number; // 初回誤答の epoch ms
  u: number; // エントリ単位の updatedAt(同期時のエントリLWW用)
  hidden?: boolean; // ユーザーが非表示にした(復活させない)
  memo?: string;
}

export interface ProgressState {
  attempts: Attempt[];
  review: Record<string, ReviewEntry>;
  settings: Settings;
  pm?: PmRecords;
  achievements?: Achievements;
  vocab?: Record<string, VocabEntry>;
  updatedAt: number;
}

const KEY = "ap-study:v1";

// box N で正解したときの次回出題までの日数(box1→翌日, 2→3日, 3→7日, 4→14日)
export const REVIEW_INTERVALS = [1, 3, 7, 14];
export const MAX_BOX = 4;

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysStr(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

/**
 * 現在の学習セッションIDを返す(同一セッションで共通・タブを閉じるまで持続)。
 * sessionStorage スコープなので、別タブ/別セッションでは新しいIDになる。
 */
function currentSessionId(): string {
  try {
    let sid = sessionStorage.getItem("ap-study:sid");
    if (!sid) {
      sid = `${todayStr()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("ap-study:sid", sid);
    }
    return sid;
  } catch {
    return `${todayStr()}-x`;
  }
}

function emptyState(): ProgressState {
  return { attempts: [], review: {}, settings: {}, updatedAt: 0 };
}

export function loadState(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw) as ProgressState;
    if (!Array.isArray(s.attempts)) return emptyState();
    s.review ??= {};
    s.settings ??= {};
    s.achievements ??= {};
    s.vocab ??= {};
    s.updatedAt ??= 0;
    return s;
  } catch {
    return emptyState();
  }
}

export function saveState(s: ProgressState): void {
  s.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** 保存済み updatedAt を保って書き込む(同期のマージ結果用) */
export function saveStateRaw(s: ProgressState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** 解答を記録し、復習キューを更新する */
export function recordAnswer(qid: string, ok: boolean, mode: Mode): void {
  const s = loadState();
  s.attempts.push({ q: qid, t: Date.now(), ok, mode, s: currentSessionId() });
  const entry = s.review[qid];
  if (!ok) {
    s.review[qid] = { box: 1, due: addDaysStr(todayStr(), REVIEW_INTERVALS[0]) };
  } else if (entry) {
    if (entry.box >= MAX_BOX) {
      delete s.review[qid]; // 卒業
    } else {
      const box = entry.box + 1;
      s.review[qid] = { box, due: addDaysStr(todayStr(), REVIEW_INTERVALS[box - 1]) };
    }
  }
  saveState(s);
}

/** 「あとで復習」手動追加 */
export function addToReview(qid: string): void {
  const s = loadState();
  if (!s.review[qid]) {
    s.review[qid] = { box: 1, due: addDaysStr(todayStr(), 1) };
    saveState(s);
  }
}

export function isInReview(qid: string): boolean {
  return Boolean(loadState().review[qid]);
}

/** 今日が期日を迎えている復習対象の questionId 一覧 */
export function dueReviewIds(state = loadState()): string[] {
  const today = todayStr();
  return Object.entries(state.review)
    .filter(([, e]) => e.due <= today)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : 1))
    .map(([qid]) => qid);
}

export interface StudyStats {
  streak: number; // 連続学習日数
  total: number; // 累計解答数
  today: number; // 今日の解答数
}

export function studyStats(state = loadState()): StudyStats {
  const days = new Set(state.attempts.map((a) => todayStr(new Date(a.t))));
  const today = todayStr();
  let streak = 0;
  let cursor = days.has(today) ? today : addDaysStr(today, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return {
    streak,
    total: state.attempts.length,
    today: state.attempts.filter((a) => todayStr(new Date(a.t)) === today).length,
  };
}

export interface QuestionStat {
  n: number;
  ok: number;
}

/** 問題IDごとの解答数・正解数 */
export function statsByQuestion(state = loadState()): Map<string, QuestionStat> {
  const map = new Map<string, QuestionStat>();
  for (const a of state.attempts) {
    const cur = map.get(a.q) ?? { n: 0, ok: 0 };
    cur.n += 1;
    if (a.ok) cur.ok += 1;
    map.set(a.q, cur);
  }
  return map;
}

/** まとめて解答を記録する(模試の採点用) */
export function recordAnswersBatch(
  entries: { qid: string; ok: boolean; mode: Mode }[]
): void {
  const s = loadState();
  const now = Date.now();
  const today = todayStr();
  const sid = currentSessionId();
  entries.forEach((e, i) => {
    s.attempts.push({ q: e.qid, t: now + i, ok: e.ok, mode: e.mode, s: sid });
    const entry = s.review[e.qid];
    if (!e.ok) {
      s.review[e.qid] = { box: 1, due: addDaysStr(today, REVIEW_INTERVALS[0]) };
    } else if (entry) {
      if (entry.box >= MAX_BOX) {
        delete s.review[e.qid];
      } else {
        const box = entry.box + 1;
        s.review[e.qid] = { box, due: addDaysStr(today, REVIEW_INTERVALS[box - 1]) };
      }
    }
  });
  saveState(s);
}

export function setPmGrade(
  pmId: string,
  partKey: string,
  grade: PmGrade,
  my?: string
): void {
  const s = loadState();
  s.pm ??= {};
  s.pm[pmId] ??= {};
  const prev = s.pm[pmId][partKey];
  // 既存の AI 講評(ai)は保持したまま、ユーザーの採点で grade を上書きする
  s.pm[pmId][partKey] = { ...prev, grade, my: my ?? prev?.my, t: Date.now() };
  saveState(s);
}

/** AI採点の結果を保存する。推定評価は自己採点欄に反映し、ユーザーが後から変更可能。 */
export function setPmAiScore(
  pmId: string,
  partKey: string,
  suggested: PmGrade | undefined,
  feedback: string,
  my?: string
): void {
  const s = loadState();
  s.pm ??= {};
  s.pm[pmId] ??= {};
  const prev = s.pm[pmId][partKey];
  const now = Date.now();
  s.pm[pmId][partKey] = {
    ...prev,
    grade: suggested ?? prev?.grade, // AIが判定できたら反映(できなければ据え置き)
    my: my ?? prev?.my,
    t: now,
    ai: { suggested, feedback, t: now },
  };
  saveState(s);
}

export function pmRecords(pmId: string): Record<string, PmPartRecord> {
  return loadState().pm?.[pmId] ?? {};
}

export function exportJson(): string {
  return JSON.stringify(loadState(), null, 1);
}

export function importJson(text: string): void {
  const s = JSON.parse(text) as ProgressState;
  if (!Array.isArray(s.attempts) || typeof s.review !== "object") {
    throw new Error("進捗データの形式が不正です");
  }
  // vocab を持たない旧バックアップで現在のことば帳が消えないよう温存する
  if (s.vocab == null) {
    const cur = loadState().vocab;
    if (cur && Object.keys(cur).length > 0) s.vocab = cur;
  }
  saveStateRaw(s);
}

export function resetState(): void {
  localStorage.removeItem(KEY);
}

/** 端末間マージ: attempts は和集合、review/settings は新しい方を優先 */
export function mergeStates(a: ProgressState, b: ProgressState): ProgressState {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const seen = new Set<string>();
  const attempts: Attempt[] = [];
  for (const at of [...a.attempts, ...b.attempts]) {
    const key = `${at.q}:${at.t}:${at.mode}`;
    if (!seen.has(key)) {
      seen.add(key);
      attempts.push(at);
    }
  }
  attempts.sort((x, y) => x.t - y.t);
  // 午後採点: 設問パーツ単位で採点時刻 t の新しい方を採用する(状態全体の
  // updatedAt で丸ごと決めると、無関係な操作1回で新しい採点が古い値に巻き戻る)。
  // AI講評(ai)は独立フィールドとして ai.t の新しい方を残す — 片端末で採点を
  // 直しただけで、もう片方にしかないAI講評が消えないように。
  const pm: PmRecords = {};
  for (const pmId of new Set([
    ...Object.keys(newer.pm ?? {}),
    ...Object.keys(older.pm ?? {}),
  ])) {
    const pn = newer.pm?.[pmId] ?? {};
    const po = older.pm?.[pmId] ?? {};
    const parts: Record<string, PmPartRecord> = {};
    for (const key of new Set([...Object.keys(pn), ...Object.keys(po)])) {
      const x = pn[key];
      const y = po[key];
      if (x && y) {
        const win = (x.t ?? 0) >= (y.t ?? 0) ? x : y;
        const ai =
          x.ai && y.ai ? ((x.ai.t ?? 0) >= (y.ai.t ?? 0) ? x.ai : y.ai) : (x.ai ?? y.ai);
        parts[key] = { ...win, ...(ai ? { ai } : {}) };
      } else {
        parts[key] = (x ?? y)!;
      }
    }
    pm[pmId] = parts;
  }
  // 実績: 和集合。unlockedAt は早い方、seen は OR、progress は大きい方(後退救済)
  const achievements: Achievements = {};
  const aAch = a.achievements ?? {};
  const bAch = b.achievements ?? {};
  for (const id of new Set([...Object.keys(aAch), ...Object.keys(bAch)])) {
    const x = aAch[id];
    const y = bAch[id];
    achievements[id] =
      x && y
        ? {
            unlockedAt: Math.min(x.unlockedAt, y.unlockedAt),
            seen: x.seen || y.seen,
            progress: Math.max(x.progress ?? 0, y.progress ?? 0),
          }
        : (x ?? y)!;
  }
  // 語彙: エントリ単位のLWW(同じ termId は u の大きい方を採用)
  const vocab: Record<string, VocabEntry> = { ...(older.vocab ?? {}) };
  for (const [id, e] of Object.entries(newer.vocab ?? {})) {
    const prev = vocab[id];
    if (!prev || e.u >= prev.u) vocab[id] = e;
  }
  // 双方のスプレッドを先頭に置き、既知フィールドをマージ結果で上書きする。
  // こうすると新しいクライアントが追加したフィールドを旧クライアントの
  // マージが落とさない(未知フィールドの温存)。
  return {
    ...older,
    ...newer,
    attempts,
    review: { ...older.review, ...newer.review },
    settings: { ...older.settings, ...newer.settings },
    pm,
    achievements,
    vocab,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
