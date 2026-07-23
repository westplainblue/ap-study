import type { AmQuestion, ExamData, Major, PmQuestion } from "./types";
import r2025a from "./exams/2025r07a.am.json";
import r2025aPm from "./exams/2025r07a.pm.json";
import r2025h from "./exams/2025r07h.am.json";
import r2024a from "./exams/2024r06a.am.json";
import r2024h from "./exams/2024r06h.am.json";
import r2023a from "./exams/2023r05a.am.json";
import r2023h from "./exams/2023r05h.am.json";
import r2022a from "./exams/2022r04a.am.json";
import r2022h from "./exams/2022r04h.am.json";

function normalize(raw: unknown, pm: unknown[]): ExamData {
  const e = raw as Partial<ExamData>;
  return {
    examId: e.examId!,
    label: e.label!,
    source: e.source ?? "",
    am: (e.am ?? []) as AmQuestion[],
    pm: pm as PmQuestion[],
  };
}

export const EXAMS: ExamData[] = [
  normalize(r2025a, r2025aPm.pm),
  normalize(r2025h, []),
  normalize(r2024a, []),
  normalize(r2024h, []),
  normalize(r2023a, []),
  normalize(r2023h, []),
  normalize(r2022a, []),
  normalize(r2022h, []),
];

export const AM_QUESTIONS: AmQuestion[] = EXAMS.flatMap((e) => e.am);
export const PM_QUESTIONS: PmQuestion[] = EXAMS.flatMap((e) => e.pm);

const amById = new Map(AM_QUESTIONS.map((q) => [q.id, q]));
const pmById = new Map(PM_QUESTIONS.map((q) => [q.id, q]));
const examById = new Map(EXAMS.map((e) => [e.examId, e]));

export function amQuestion(id: string): AmQuestion | undefined {
  return amById.get(id);
}

export function pmQuestion(id: string): PmQuestion | undefined {
  return pmById.get(id);
}

export function examLabel(examId: string): string {
  return examById.get(examId)?.label ?? examId;
}

/** 出典表記(例: 令和7年度 秋期 午前 問12) */
export function sourceOf(q: AmQuestion): string {
  return `${examLabel(q.examId)} 午前 問${q.number}`;
}

// --- 計算問題の判定 --------------------------------------------------------
// 応用情報の午前問題は「選択肢が数値」であることが計算問題のほぼ確実な目印
// (概念問題の選択肢は文章。実データ640問では数値選択肢が1〜2個の問題は0件で、
//  0個 or 3個以上にきれいに分かれる)。数値選択肢が3つ以上なら計算問題とみなす。
const CALC_UNITS = [
  "ミリ秒", "マイクロ秒", "ナノ秒", "kビット/秒", "Mビット/秒", "Gビット/秒",
  "ビット/秒", "バイト/秒", "kビット", "Mビット", "Gビット", "Tビット",
  "kバイト", "Mバイト", "Gバイト", "Tバイト", "ビット", "バイト",
  "秒", "分", "時間", "日", "年", "個", "回", "台", "人", "件",
  "万円", "千円", "百万円", "億円", "円", "ページ", "文字", "語", "面", "本", "枚",
  "％", "%", "倍", "ドット", "画素", "色", "GHz", "MHz", "kHz", "Hz",
  "GB", "MB", "KB", "TB", "万", "千", "百万", "億", "割", "段", "層", "次", "桁", "問",
].sort((a, b) => b.length - a.length);

function stripUnits(t: string): string {
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of CALC_UNITS) {
      if (t.endsWith(u)) {
        t = t.slice(0, -u.length);
        changed = true;
      }
    }
  }
  return t;
}

function isNumericChoice(s: string): boolean {
  let t = s.replace(/[,\s　]/g, ""); // カンマ・空白を先に除去
  t = t.replace(/^(約|およそ|最大|最小|マイナス|-|−)/, "");
  t = stripUnits(t);
  if (!t) return false;
  return (
    /^\d+(\.\d+)?$/.test(t) || // 整数・小数
    /^\d+\/\d+$/.test(t) || // 分数(例 1/32)
    /^\d+(\.\d+)?[×xX]10\^?-?\d+$/.test(t) || // 指数表記
    /^2\^?-?\d+$/.test(t) // 2のべき
  );
}

const calcIds = new Set(
  AM_QUESTIONS.filter((q) => {
    const ch = q.choices ?? [];
    if (ch.length < 3) return false; // 選択肢が図中(choicesInFigure)等は対象外
    return ch.filter(isNumericChoice).length >= 3;
  }).map((q) => q.id)
);

/** 計算問題(選択肢が数値の定量問題)かどうか */
export function isCalcQuestion(q: AmQuestion): boolean {
  return calcIds.has(q.id);
}

interface QueryOptions {
  excludeCalc?: boolean; // 計算問題を除外する
}

export function questionsByMiddle(
  middles: string[],
  opts: QueryOptions = {}
): AmQuestion[] {
  const set = middles.length ? new Set(middles) : null;
  return AM_QUESTIONS.filter(
    (q) =>
      (!set || set.has(q.middle)) &&
      (!opts.excludeCalc || !calcIds.has(q.id))
  );
}

export function countByMiddle(opts: QueryOptions = {}): Map<string, number> {
  const map = new Map<string, number>();
  for (const q of AM_QUESTIONS) {
    if (opts.excludeCalc && calcIds.has(q.id)) continue;
    map.set(q.middle, (map.get(q.middle) ?? 0) + 1);
  }
  return map;
}

export const KANA = ["ア", "イ", "ウ", "エ"];

export function majorOf(q: AmQuestion): Major {
  return q.major;
}

export function figureUrl(path: string): string {
  return import.meta.env.BASE_URL + path;
}
