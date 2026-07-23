/**
 * 実績(アチーブメント)判定エンジンとカタログ。
 * 真実源は attempts(追記専用)で、判定は毎回そこから純関数で導出する。
 * achievements レコードは解除日時・演出メタのキャッシュに留める(docs/achievements-design.md 参照)。
 */
import {
  AM_QUESTIONS,
  amQuestion,
  countByMiddle,
  isCalcQuestion,
  pmQuestion,
} from "../data";
import { MIDDLES_BY_MAJOR, type Major } from "../data/types";
import {
  loadState,
  saveStateRaw,
  todayStr,
  type AchvId,
  type Attempt,
  type ProgressState,
} from "./progress";

export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";
export type Glyph =
  | "volume"
  | "revenge"
  | "streak"
  | "coverage"
  | "mastery"
  | "recurring"
  | "challenge"
  | "pm"
  | "first";

// --- 閾値パラメータ ---
const REVENGE_PER_Q_CAP = 3; // 単一問題からのリベンジ寄与の上限(荒稼ぎ防止)
const DAILY_GOAL = 20; // デイリー目標(問/日)
const WEEKLY_GOAL = 100; // ウィークリー目標(問/週)
const MONTHLY_GOAL_DAYS = 20; // マンスリー目標(学習日/月)
const TOTAL_Q = AM_QUESTIONS.length; // 640

// ---------- リベンジ算出 ----------
export interface RevengeStats {
  revengeCount: number; // 定義B(延べ・per-qクランプ後)
  overcomeQuestions: number; // 定義C(克服した問題の種類数・非単調)
}

export function revengeStats(sortedAttempts: Attempt[]): RevengeStats {
  const prevOk = new Map<string, boolean>();
  const perQ = new Map<string, number>();
  const everWrong = new Set<string>();
  const wrongSinceLastRight = new Set<string>();
  let revengeCount = 0;
  for (const a of sortedAttempts) {
    if (a.ok && prevOk.get(a.q) === false) {
      const c = perQ.get(a.q) ?? 0;
      if (c < REVENGE_PER_Q_CAP) {
        revengeCount += 1;
        perQ.set(a.q, c + 1);
      }
    }
    if (!a.ok) {
      everWrong.add(a.q);
      wrongSinceLastRight.add(a.q);
    } else if (everWrong.has(a.q)) {
      wrongSinceLastRight.delete(a.q);
    }
    prevOk.set(a.q, a.ok);
  }
  let overcome = 0;
  for (const q of everWrong) if (!wrongSinceLastRight.has(q)) overcome += 1;
  return { revengeCount, overcomeQuestions: overcome };
}

// ---------- 評価コンテキスト(1回だけ全走査して算出) ----------
export interface EvalContext {
  total: number;
  uniq: number;
  coverage: number; // 0..100(%)
  revengeB: number;
  revengeC: number;
  longestStreak: number;
  studyDays: number;
  maxDaily: number;
  maxCombo: number;
  masteredMiddles: number;
  masteredMajors: Set<Major>;
  allMastered: boolean;
  hasPractice: boolean;
  hasReview: boolean;
  hasMock: boolean;
  calcCorrect: number;
  dailyGoalDays: number;
  weeklyGoalWeeks: number;
  monthlyGoalMonths: number;
  hasEarly: boolean;
  hasNight: boolean;
  hasWeekend: boolean;
  hasComeback: boolean;
  hasCorrect: boolean;
  pmParts: number;
  pmCompleted: number;
  examDateSet: boolean;
  examSoon: boolean;
  examEve: boolean;
}

function dayNum(ymd: string): number {
  return Math.round(new Date(`${ymd}T00:00:00`).getTime() / 86400000);
}

function weekKey(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7; // 月曜=0
  x.setDate(x.getDate() - mondayOffset);
  return todayStr(x);
}

function pmTotalParts(pmId: string): number {
  const q = pmQuestion(pmId);
  if (!q) return 0;
  return q.setumon.reduce((s, st) => s + st.parts.length, 0);
}

export function buildContext(state: ProgressState): EvalContext {
  const at = [...state.attempts].sort((a, b) => a.t - b.t);
  const rev = revengeStats(at);

  const dayCount = new Map<string, number>();
  const weekCount = new Map<string, number>();
  const monthDays = new Map<string, Set<string>>();
  const uniqSet = new Set<string>();
  const correctByMiddle = new Map<string, Set<string>>();
  let maxCombo = 0;
  let combo = 0;
  let calcCorrect = 0;
  let hasPractice = false;
  let hasReview = false;
  let hasMock = false;
  let hasEarly = false;
  let hasNight = false;
  let hasWeekend = false;
  let hasCorrect = false;

  for (const a of at) {
    const q = amQuestion(a.q);
    const d = new Date(a.t);
    const ds = todayStr(d);
    dayCount.set(ds, (dayCount.get(ds) ?? 0) + 1);
    const wk = weekKey(d);
    weekCount.set(wk, (weekCount.get(wk) ?? 0) + 1);
    const mo = ds.slice(0, 7);
    (monthDays.get(mo) ?? monthDays.set(mo, new Set()).get(mo)!).add(ds);
    if (q) uniqSet.add(a.q);
    if (a.mode === "practice") hasPractice = true;
    else if (a.mode === "review") hasReview = true;
    else if (a.mode === "mock") hasMock = true;
    if (a.ok) {
      hasCorrect = true;
      combo += 1;
      if (combo > maxCombo) maxCombo = combo;
      if (q) {
        (
          correctByMiddle.get(q.middle) ??
          correctByMiddle.set(q.middle, new Set()).get(q.middle)!
        ).add(a.q);
        if (isCalcQuestion(q)) calcCorrect += 1;
      }
    } else {
      combo = 0;
    }
    const h = d.getHours();
    if (h >= 5 && h < 8) hasEarly = true;
    if (h >= 0 && h < 4) hasNight = true;
    const wd = d.getDay();
    if (wd === 0 || wd === 6) hasWeekend = true;
  }

  // 学習日・連続・カムバック
  const days = [...dayCount.keys()].map(dayNum).sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  let prev = Number.NaN;
  let hasComeback = false;
  for (const dn of days) {
    if (dn === prev + 1) {
      run += 1;
    } else {
      if (!Number.isNaN(prev) && dn - prev >= 8) hasComeback = true;
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = dn;
  }

  let maxDaily = 0;
  let dailyGoalDays = 0;
  for (const v of dayCount.values()) {
    if (v > maxDaily) maxDaily = v;
    if (v >= DAILY_GOAL) dailyGoalDays += 1;
  }
  let weeklyGoalWeeks = 0;
  for (const v of weekCount.values()) if (v >= WEEKLY_GOAL) weeklyGoalWeeks += 1;
  let monthlyGoalMonths = 0;
  for (const s of monthDays.values())
    if (s.size >= MONTHLY_GOAL_DAYS) monthlyGoalMonths += 1;

  // マスタリー
  const totals = countByMiddle();
  const masteredSet = new Set<string>();
  for (const [mid, total] of totals) {
    if (total > 0 && (correctByMiddle.get(mid)?.size ?? 0) >= total)
      masteredSet.add(mid);
  }
  const masteredMajors = new Set<Major>();
  (Object.keys(MIDDLES_BY_MAJOR) as Major[]).forEach((mj) => {
    const mids = MIDDLES_BY_MAJOR[mj].filter((m) => totals.has(m));
    if (mids.length > 0 && mids.every((m) => masteredSet.has(m)))
      masteredMajors.add(mj);
  });
  const allMastered =
    totals.size > 0 && [...totals.keys()].every((m) => masteredSet.has(m));

  // 午後
  const pm = state.pm ?? {};
  let pmParts = 0;
  let pmCompleted = 0;
  for (const [pmId, parts] of Object.entries(pm)) {
    const n = Object.keys(parts).length;
    pmParts += n;
    const tot = pmTotalParts(pmId);
    if (tot > 0 && n >= tot) pmCompleted += 1;
  }

  // 試験日連動
  const examDate = state.settings.examDate;
  let examSoon = false;
  let examEve = false;
  if (examDate) {
    const ed = dayNum(examDate);
    for (const dn of days) {
      if (dn >= ed - 7 && dn <= ed) examSoon = true;
      if (dn === ed - 1 || dn === ed) examEve = true;
    }
  }

  return {
    total: at.length,
    uniq: uniqSet.size,
    coverage: TOTAL_Q ? (uniqSet.size / TOTAL_Q) * 100 : 0,
    revengeB: rev.revengeCount,
    revengeC: rev.overcomeQuestions,
    longestStreak,
    studyDays: days.length,
    maxDaily,
    maxCombo,
    masteredMiddles: masteredSet.size,
    masteredMajors,
    allMastered,
    hasPractice,
    hasReview,
    hasMock,
    calcCorrect,
    dailyGoalDays,
    weeklyGoalWeeks,
    monthlyGoalMonths,
    hasEarly,
    hasNight,
    hasWeekend,
    hasComeback,
    hasCorrect,
    pmParts,
    pmCompleted,
    examDateSet: Boolean(examDate),
    examSoon,
    examEve,
  };
}

// ---------- カタログ ----------
export interface AchvDef {
  id: string;
  name: string;
  hint: string; // 解除条件の説明(未解除ヒントにも使う)
  tier: Tier;
  glyph: Glyph;
  value: (c: EvalContext) => number; // 進捗の現在値
  goal: number; // 目標値(value>=goal で解除)
  unlocked?: (c: EvalContext) => boolean; // 複合条件はこちらで上書き
}

const bool = (n: number) => n; // 0/1 を返す value 用
const CATALOG: AchvDef[] = [];
function mk(
  id: string,
  name: string,
  hint: string,
  tier: Tier,
  glyph: Glyph,
  value: (c: EvalContext) => number,
  goal: number,
  unlocked?: (c: EvalContext) => boolean
) {
  CATALOG.push({ id, name, hint, tier, glyph, value, goal, unlocked });
}
function ladder(
  prefix: string,
  glyph: Glyph,
  value: (c: EvalContext) => number,
  rows: [string, number, Tier][],
  hint: (goal: number) => string
) {
  for (const [name, goal, tier] of rows)
    mk(`${prefix}-${goal}`, name, hint(goal), tier, glyph, value, goal);
}

// 量(累計)
ladder("vol", "volume", (c) => c.total, [
  ["千里の一歩", 100, "bronze"],
  ["歩みを止めず", 300, "bronze"],
  ["反復の徒", 500, "silver"],
  ["千本ノック", 1000, "silver"],
  ["二千の壁", 2000, "gold"],
  ["研鑽の三千", 3000, "gold"],
  ["問題の海", 5000, "platinum"],
  ["八千の探求", 8000, "platinum"],
], (g) => `累計${g.toLocaleString()}問を解答`);
mk("vol-12000", "一万二千の頂", "累計12,000問かつ600問以上に挑戦", "diamond", "volume",
  (c) => c.total, 12000, (c) => c.total >= 12000 && c.uniq >= 400);

// 量(ユニーク)
ladder("uniq", "volume", (c) => c.uniq, [
  ["初見ハンター", 50, "bronze"],
  ["開拓者", 150, "silver"],
], (g) => `${g}種類の問題に挑戦`);

// リベンジ(延べ)
mk("rev-1", "初リベンジ", "間違えた問題を正解し直す", "bronze", "revenge", (c) => c.revengeB, 1);
ladder("rev", "revenge", (c) => c.revengeB, [
  ["雪辱の一撃", 10, "bronze"],
  ["雪辱を重ねて", 30, "silver"],
  ["七転八起", 50, "silver"],
  ["不屈の闘志", 100, "gold"],
  ["雪辱百戦", 200, "gold"],
  ["雪辱の覇者", 300, "platinum"],
  ["リベンジ王", 500, "platinum"],
  ["不撓不屈", 800, "diamond"],
], (g) => `リベンジ(誤答→正答)を通算${g}回`);

// リベンジ(克服した問題数)
ladder("over", "revenge", (c) => c.revengeC, [
  ["弱点撃破", 10, "bronze"],
  ["弱点克服", 30, "silver"],
  ["弱点殲滅", 50, "gold"],
  ["弱点マスター", 100, "platinum"],
  ["完全克服", 200, "diamond"],
], (g) => `一度間違えた問題を${g}種類克服`);

// 継続(連続)
ladder("streak", "streak", (c) => c.longestStreak, [
  ["三日坊主返上", 3, "bronze"],
  ["一週間皆勤", 7, "bronze"],
  ["二週間走破", 14, "silver"],
  ["継続は力", 30, "gold"],
  ["五十日の精進", 50, "platinum"],
  ["百日修行", 100, "diamond"],
  ["不動の継続", 150, "diamond"],
], (g) => `${g}日連続で学習`);

// 継続(延べ学習日数・休んでも減らない)
ladder("days", "recurring", (c) => c.studyDays, [
  ["学びの十日", 10, "bronze"],
  ["三十日生", 30, "silver"],
  ["還暦学習", 60, "gold"],
  ["百日到達", 100, "platinum"],
  ["二百日の軌跡", 200, "diamond"],
], (g) => `延べ${g}日学習(連続でなくてよい)`);

// 網羅(カバレッジ)
ladder("cov", "coverage", (c) => Math.floor(c.coverage), [
  ["序盤突破", 25, "bronze"],
  ["折り返し地点", 50, "silver"],
  ["山を越えて", 75, "gold"],
  ["大詰め", 90, "platinum"],
  ["全問踏破", 95, "diamond"],
], (g) => `全${TOTAL_Q}問の${g}%に挑戦`);

// 分野マスタリー
mk("mastery-1", "分野制覇", "いずれかの分野を完答", "silver", "mastery", (c) => c.masteredMiddles, 1);
mk("mastery-3", "三分野の達人", "3分野を完答", "gold", "mastery", (c) => c.masteredMiddles, 3);
mk("mastery-T", "テクノロジ制覇", "テクノロジ系を全分野完答", "gold", "mastery",
  (c) => bool(c.masteredMajors.has("T") ? 1 : 0), 1);
mk("mastery-M", "マネジメント制覇", "マネジメント系を全分野完答", "gold", "mastery",
  (c) => bool(c.masteredMajors.has("M") ? 1 : 0), 1);
mk("mastery-S", "ストラテジ制覇", "ストラテジ系を全分野完答", "gold", "mastery",
  (c) => bool(c.masteredMajors.has("S") ? 1 : 0), 1);
mk("mastery-all", "全分野マスター", "全分野を完答(生涯目標)", "diamond", "mastery",
  (c) => bool(c.allMastered ? 1 : 0), 1);

// 周期(デイリー/ウィークリー/マンスリー)
ladder("daily", "recurring", (c) => c.dailyGoalDays, [
  ["精進の芽", 5, "bronze"],
  ["精進の習慣", 15, "silver"],
  ["精進の達人", 30, "gold"],
  ["精進の鬼", 100, "diamond"],
], (g) => `1日${DAILY_GOAL}問以上を通算${g}日`);
ladder("weekly", "recurring", (c) => c.weeklyGoalWeeks, [
  ["週間皆勤", 4, "silver"],
  ["週間の鬼", 12, "gold"],
  ["継続の匠", 26, "platinum"],
], (g) => `週${WEEKLY_GOAL}問以上を通算${g}週`);
ladder("monthly", "recurring", (c) => c.monthlyGoalMonths, [
  ["ひと月完走", 1, "silver"],
  ["三ヶ月完走", 3, "gold"],
  ["半年完走", 6, "diamond"],
], (g) => `月${MONTHLY_GOAL_DAYS}日以上の学習を通算${g}ヶ月`);

// 挑戦・特殊
ladder("combo", "challenge", (c) => c.maxCombo, [
  ["連勝街道", 10, "silver"],
  ["連勝の達人", 30, "gold"],
], (g) => `${g}問連続で正解`);
ladder("burst", "challenge", (c) => c.maxDaily, [
  ["猛勉強", 50, "silver"],
  ["一日の鬼", 100, "gold"],
], (g) => `1日で${g}問を解答`);
mk("early", "朝活", "朝5〜8時に学習", "bronze", "challenge", (c) => bool(c.hasEarly ? 1 : 0), 1);
mk("night", "夜更かし勉強", "深夜0〜4時に学習", "bronze", "challenge", (c) => bool(c.hasNight ? 1 : 0), 1);
mk("weekend", "週末戦士", "土日に学習", "bronze", "challenge", (c) => bool(c.hasWeekend ? 1 : 0), 1);
mk("comeback", "おかえりなさい", "7日以上空けて学習を再開", "bronze", "challenge", (c) => bool(c.hasComeback ? 1 : 0), 1);
mk("calc-50", "計算も恐れず", "計算問題を50問正解", "silver", "challenge", (c) => c.calcCorrect, 50);
mk("calc-200", "計算マスター", "計算問題を200問正解", "gold", "challenge", (c) => c.calcCorrect, 200);
mk("modes-3", "三刀流", "演習・復習・模試すべてで解答", "silver", "challenge",
  (c) => bool(c.hasPractice && c.hasReview && c.hasMock ? 1 : 0), 1);

// 午後
mk("pm-1", "午後デビュー", "午後問題を1問採点", "bronze", "pm", (c) => c.pmParts, 1);
mk("pm-complete", "完答者", "午後問題を1問すべて採点", "silver", "pm", (c) => c.pmCompleted, 1);

// 初回・マイルストーン
mk("first-1", "はじめの一問", "最初の1問を解答", "bronze", "first", (c) => c.total, 1);
mk("first-correct", "初正解", "初めて正解する", "bronze", "first", (c) => bool(c.hasCorrect ? 1 : 0), 1);
mk("exam-set", "本気の宣言", "試験日を設定", "bronze", "first", (c) => bool(c.examDateSet ? 1 : 0), 1);
mk("exam-spurt", "ラストスパート", "試験7日前以内に学習", "silver", "challenge", (c) => bool(c.examSoon ? 1 : 0), 1);
mk("exam-eve", "走り抜けた", "試験前日まで学習を継続", "gold", "challenge", (c) => bool(c.examEve ? 1 : 0), 1);

export const ACHIEVEMENTS: readonly AchvDef[] = CATALOG;
const DEF_BY_ID = new Map(CATALOG.map((d) => [d.id, d]));
export function achvDef(id: AchvId): AchvDef | undefined {
  return DEF_BY_ID.get(id);
}
export function totalCount(): number {
  return CATALOG.length;
}

function isDone(def: AchvDef, c: EvalContext): boolean {
  return def.unlocked ? def.unlocked(c) : def.value(c) >= def.goal;
}

// ---------- 判定・解除 ----------
/** state.achievements を更新し、新規解除の id 配列を返す(add-only=巻き戻らない) */
export function reconcile(
  state: ProgressState,
  opts: { silent: boolean; emit: boolean }
): AchvId[] {
  const ctx = buildContext(state);
  const ach = (state.achievements ??= {});
  const now = Date.now();
  const newly: AchvId[] = [];
  for (const def of CATALOG) {
    const v = def.value(ctx);
    if (isDone(def, ctx)) {
      if (!ach[def.id]) {
        ach[def.id] = { unlockedAt: now, seen: opts.silent, progress: v };
        if (!opts.silent) newly.push(def.id);
      } else {
        ach[def.id].progress = Math.max(ach[def.id].progress ?? 0, v);
      }
    } else if (ach[def.id]) {
      ach[def.id].progress = Math.max(ach[def.id].progress ?? 0, v);
    }
  }
  if (opts.emit && newly.length && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("achv:unlock", { detail: newly }));
  }
  return newly;
}

/** 解答直後(演習・復習):新規解除をトースト用イベントで通知 */
export function refreshAfterAnswer(): AchvId[] {
  const s = loadState();
  const newly = reconcile(s, { silent: false, emit: true });
  saveStateRaw(s); // unlockedAt/progress を保存(updatedAt は据え置き)
  return newly;
}

/** 模試採点後:イベントは出さず、新規解除を呼び出し側(結果画面)に返す */
export function refreshAfterBatch(): AchvId[] {
  const s = loadState();
  const newly = reconcile(s, { silent: false, emit: false });
  saveStateRaw(s);
  return newly;
}

/** 起動時:既存履歴からの遡及解除をトーストなしで反映 */
export function reconcileSilent(): void {
  const s = loadState();
  reconcile(s, { silent: true, emit: false });
  saveStateRaw(s);
}

// ---------- 表示用 ----------
export interface AchvRow {
  def: AchvDef;
  unlocked: boolean;
  unlockedAt?: number;
  value: number;
  goal: number;
  ratio: number; // 0..1
}

export function achievementRows(state: ProgressState): AchvRow[] {
  const ctx = buildContext(state);
  return CATALOG.map((def) => {
    const rec = state.achievements?.[def.id];
    const done = Boolean(rec) || isDone(def, ctx);
    const value = Math.max(def.value(ctx), rec?.progress ?? 0);
    return {
      def,
      unlocked: done,
      unlockedAt: rec?.unlockedAt,
      value,
      goal: def.goal,
      ratio: def.goal ? Math.min(1, value / def.goal) : done ? 1 : 0,
    };
  });
}

export function unlockedCount(state: ProgressState): number {
  return achievementRows(state).filter((r) => r.unlocked).length;
}
