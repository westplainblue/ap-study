export type Mode = "practice" | "review" | "mock";

export interface Attempt {
  q: string; // questionId
  t: number; // epoch ms
  ok: boolean;
  mode: Mode;
}

export interface ReviewEntry {
  box: number; // 1-4(Leitner)
  due: string; // YYYY-MM-DD
}

export interface Settings {
  examDate?: string; // YYYY-MM-DD
  syncCode?: string;
}

export type PmGrade = "o" | "d" | "x"; // ○ / △ / ×

export interface PmPartRecord {
  grade: PmGrade;
  my?: string; // 自分の解答
  t: number;
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

export interface ProgressState {
  attempts: Attempt[];
  review: Record<string, ReviewEntry>;
  settings: Settings;
  pm?: PmRecords;
  achievements?: Achievements;
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
  s.attempts.push({ q: qid, t: Date.now(), ok, mode });
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
  entries.forEach((e, i) => {
    s.attempts.push({ q: e.qid, t: now + i, ok: e.ok, mode: e.mode });
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
  s.pm[pmId][partKey] = { grade, my, t: Date.now() };
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
  const pm: PmRecords = { ...(older.pm ?? {}) };
  for (const [pmId, parts] of Object.entries(newer.pm ?? {})) {
    pm[pmId] = { ...pm[pmId], ...parts };
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
  return {
    attempts,
    review: { ...older.review, ...newer.review },
    settings: { ...older.settings, ...newer.settings },
    pm,
    achievements,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
