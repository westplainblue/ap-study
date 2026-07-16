import type { AmQuestion, ExamData, Major, PmQuestion } from "./types";
import r2025a from "./exams/2025r07a.am.json";
import r2025aPm from "./exams/2025r07a.pm.json";
import r2025h from "./exams/2025r07h.am.json";

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

export function questionsByMiddle(middles: string[]): AmQuestion[] {
  if (middles.length === 0) return AM_QUESTIONS;
  const set = new Set(middles);
  return AM_QUESTIONS.filter((q) => set.has(q.middle));
}

export function countByMiddle(): Map<string, number> {
  const map = new Map<string, number>();
  for (const q of AM_QUESTIONS) {
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
