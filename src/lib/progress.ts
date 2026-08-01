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
  box: number; // 1-4(Leitner)、5=卒業の墓標(削除すると同期で復活するため残す)
  due: string; // YYYY-MM-DD(卒業は GRADUATED_DUE 番兵)
  u?: number; // エントリ単位の更新時刻(同期のLWW用。旧形式は無し=0扱い)
}

export interface Settings {
  examDate?: string; // YYYY-MM-DD
  syncCode?: string;
  /** 選択肢の並びを毎回シャッフルする(未設定=有効。模試は常に固定) */
  shuffleChoices?: boolean;
  /**
   * キー単位の更新時刻(同期のLWW用)。値の変更だけでなく削除でも時刻を打つ。
   * これが無いと「キー削除」(シャッフルON復帰・試験日クリア)が同期のたびに
   * 古いスナップショットから復活し、二度と反映できなくなる。
   */
  meta?: Record<string, number>;
}

/** settings のキーを更新する(undefined で削除)。キー単位の更新時刻も打つ */
export function applySetting<K extends keyof Omit<Settings, "meta">>(
  s: ProgressState,
  key: K,
  value: Settings[K]
): void {
  if (value === undefined) delete s.settings[key];
  else s.settings[key] = value;
  (s.settings.meta ??= {})[key] = Date.now();
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
/**
 * 卒業(review/vocab とも box=5)の due 番兵値。
 * 卒業を「削除」で表すと同期マージが古いスナップショットから復活させてしまうため、
 * 墓標として残す。旧バージョンのクライアントも期日フィルタで自然に無視できる。
 */
export const GRADUATED_DUE = "9999-12-31";

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

/** 復習キューの遷移(recordAnswer / recordAnswersBatch 共通)。 */
function applyReviewTransition(
  s: ProgressState,
  qid: string,
  ok: boolean,
  today: string,
  now: number
): void {
  const entry = s.review[qid];
  if (!ok) {
    // 誤答は卒業済み(墓標)でも箱1へ戻す
    s.review[qid] = { box: 1, due: addDaysStr(today, REVIEW_INTERVALS[0]), u: now };
  } else if (entry) {
    if (entry.box >= MAX_BOX) {
      // 卒業。削除ではなく墓標を残す(削除は同期マージで復活してしまう)。
      // 既に墓標なら u を更新して古いスナップショットに勝ち続けられるようにする。
      s.review[qid] = { box: MAX_BOX + 1, due: GRADUATED_DUE, u: now };
    } else {
      const box = entry.box + 1;
      s.review[qid] = { box, due: addDaysStr(today, REVIEW_INTERVALS[box - 1]), u: now };
    }
  }
}

/** 解答を記録し、復習キューを更新する */
export function recordAnswer(qid: string, ok: boolean, mode: Mode): void {
  const s = loadState();
  const now = Date.now();
  s.attempts.push({ q: qid, t: now, ok, mode, s: currentSessionId() });
  applyReviewTransition(s, qid, ok, todayStr(), now);
  saveState(s);
}

/** 「あとで復習」手動追加(卒業済みの墓標は箱1へ復帰させる) */
export function addToReview(qid: string): void {
  const s = loadState();
  const e = s.review[qid];
  if (!e || e.box > MAX_BOX) {
    s.review[qid] = { box: 1, due: addDaysStr(todayStr(), 1), u: Date.now() };
    saveState(s);
  }
}

export function isInReview(qid: string): boolean {
  const e = loadState().review[qid];
  return Boolean(e && e.box <= MAX_BOX);
}

/** 復習キューに生きている(卒業墓標を除く)questionId 一覧 */
export function activeReviewIds(state = loadState()): string[] {
  return Object.entries(state.review)
    .filter(([, e]) => e.box <= MAX_BOX)
    .map(([qid]) => qid);
}

/** 今日が期日を迎えている復習対象の questionId 一覧 */
export function dueReviewIds(state = loadState()): string[] {
  const today = todayStr();
  return Object.entries(state.review)
    .filter(([, e]) => e.box <= MAX_BOX && e.due <= today)
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
    applyReviewTransition(s, e.qid, e.ok, today, now);
  });
  saveState(s);
}

/**
 * 「本来は卒業済みなのに生きて残っている」復習エントリを墓標化する(冪等)。
 *
 * 過去のマージ欠陥(卒業=削除が古いスナップショットとの合成で復活)で汚染された
 * データの掃除。attempts をLeitner規則で時系列リプレイし、リプレイ上は卒業して
 * いる問題のエントリを対象にする。誤爆防止の条件:
 * - u を持つエントリは触らない(新方式で実操作されたもの)
 * - リプレイが生成した歴史上の (box, due) と一致するエントリだけを墓標化する
 *   (「あとで復習」の手動追加は attempts に痕跡が無く、通常この集合に現れない)
 * 墓標の u には卒業を確定させた解答の t を使う。全端末で決定的に同じ値になるため、
 * 修復済み端末と未修復端末のマージが安定して墓標側に収束する。
 */
export function repairReviewGraduations(state: ProgressState): boolean {
  const sim = new Map<string, { box: number; due: string }>();
  const graduatedAt = new Map<string, number>();
  const seenStates = new Map<string, Set<string>>();
  const remember = (qid: string, e: { box: number; due: string }) => {
    (seenStates.get(qid) ?? seenStates.set(qid, new Set()).get(qid)!).add(
      `${e.box}:${e.due}`
    );
  };
  const attempts = [...state.attempts].sort((x, y) => x.t - y.t);
  for (const a of attempts) {
    const day = todayStr(new Date(a.t));
    if (!a.ok) {
      const e = { box: 1, due: addDaysStr(day, REVIEW_INTERVALS[0]) };
      sim.set(a.q, e);
      graduatedAt.delete(a.q); // 卒業後の誤答は再入院なので卒業扱いを取り消す
      remember(a.q, e);
    } else {
      const cur = sim.get(a.q);
      if (!cur) continue; // キュー外の正解は箱を作らない(recordAnswerと同じ)
      if (cur.box >= MAX_BOX) {
        sim.delete(a.q);
        graduatedAt.set(a.q, a.t);
      } else {
        const box = cur.box + 1;
        const e = { box, due: addDaysStr(day, REVIEW_INTERVALS[box - 1]) };
        sim.set(a.q, e);
        remember(a.q, e);
      }
    }
  }
  let changed = false;
  for (const [qid, t] of graduatedAt) {
    const entry = state.review[qid];
    if (!entry || entry.box > MAX_BOX) continue;
    if (entry.u !== undefined) continue;
    if (!seenStates.get(qid)?.has(`${entry.box}:${entry.due}`)) continue;
    state.review[qid] = { box: MAX_BOX + 1, due: GRADUATED_DUE, u: t };
    changed = true;
  }
  return changed;
}

/** 起動時・同期後に呼ぶ薄いラッパ。変更があったときだけ保存する */
export function repairReviewFromStorage(): boolean {
  const s = loadState();
  if (!repairReviewGraduations(s)) return false;
  saveState(s);
  return true;
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
  // 設定: キー単位のLWW。meta[キー]の時刻が新しい側の値を採用する(値が無い=
  // 削除も伝播する)。meta の無い旧形式のキーは従来どおり新しい状態の側を優先し、
  // 無ければ古い側で補完する(syncCode 等を失わないため)。
  const sNew = (newer.settings ?? {}) as Record<string, unknown>;
  const sOld = (older.settings ?? {}) as Record<string, unknown>;
  const mNew = (newer.settings?.meta ?? {}) as Record<string, number>;
  const mOld = (older.settings?.meta ?? {}) as Record<string, number>;
  const settings: Settings = {};
  const settingsMeta: Record<string, number> = {};
  const settingKeys = new Set([
    ...Object.keys(sNew),
    ...Object.keys(sOld),
    ...Object.keys(mNew),
    ...Object.keys(mOld),
  ]);
  settingKeys.delete("meta");
  for (const k of settingKeys) {
    const tn = mNew[k] ?? 0;
    const to = mOld[k] ?? 0;
    const v =
      tn === to
        ? sNew[k] !== undefined
          ? sNew[k]
          : sOld[k]
        : tn > to
          ? sNew[k]
          : sOld[k];
    if (v !== undefined) (settings as Record<string, unknown>)[k] = v;
    const t = Math.max(tn, to);
    if (t > 0) settingsMeta[k] = t;
  }
  if (Object.keys(settingsMeta).length > 0) settings.meta = settingsMeta;
  // 復習: エントリ単位のLWW(u が大きい方)。u の無い旧形式は 0 扱いで、
  // 実操作(卒業墓標・箱遷移は u=現在時刻)が古いスナップショットに必ず勝つ。
  // 同値(旧形式同士)は従来どおり新しい状態の側を採る。
  const review: Record<string, ReviewEntry> = { ...(older.review ?? {}) };
  for (const [qid, e] of Object.entries(newer.review ?? {})) {
    const prev = review[qid];
    if (!prev || (e.u ?? 0) >= (prev.u ?? 0)) review[qid] = e;
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
    review,
    settings,
    pm,
    achievements,
    vocab,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
