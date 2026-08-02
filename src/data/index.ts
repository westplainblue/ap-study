import { hasStandaloneKana } from "../lib/choiceShuffle";
import type { AmQuestion, ExamData, Major, PmQuestion } from "./types";
import r2025a from "./exams/2025r07a.am.json";
import r2025aPm from "./exams/2025r07a.pm.json";
import r2025h from "./exams/2025r07h.am.json";
import r2025hPm from "./exams/2025r07h.pm.json";
import r2024a from "./exams/2024r06a.am.json";
import r2024aPm from "./exams/2024r06a.pm.json";
import r2024h from "./exams/2024r06h.am.json";
import r2024hPm from "./exams/2024r06h.pm.json";
import r2023a from "./exams/2023r05a.am.json";
import r2023aPm from "./exams/2023r05a.pm.json";
import r2023h from "./exams/2023r05h.am.json";
import r2023hPm from "./exams/2023r05h.pm.json";
import r2022a from "./exams/2022r04a.am.json";
import r2022aPm from "./exams/2022r04a.pm.json";
import r2022h from "./exams/2022r04h.am.json";
import r2022hPm from "./exams/2022r04h.pm.json";
import r2021a from "./exams/2021r03a.am.json";
import r2021h from "./exams/2021r03h.am.json";
import r2020o from "./exams/2020r02o.am.json";

function normalize(raw: unknown, pm: unknown[]): ExamData {
  const e = raw as Partial<ExamData>;
  const am = (e.am ?? []) as AmQuestion[];
  // 図中選択肢(choicesInFigure)で choices が空のままの問題は、解答ボタンが
  // 1つも描画されず解答不能になる。既存の同型データと同じ「(図のア)」形式の
  // 選択肢を合成して、図を見ながらア〜エで解答できるようにする。
  for (const q of am) {
    if (q.choicesInFigure && (q.choices ?? []).length === 0) {
      q.choices = ["(図のア)", "(図のイ)", "(図のウ)", "(図のエ)"];
    }
  }
  return {
    examId: e.examId!,
    label: e.label!,
    source: e.source ?? "",
    am,
    pm: pm as PmQuestion[],
  };
}

export const EXAMS: ExamData[] = [
  normalize(r2025a, r2025aPm.pm),
  normalize(r2025h, r2025hPm.pm),
  normalize(r2024a, r2024aPm.pm),
  normalize(r2024h, r2024hPm.pm),
  normalize(r2023a, r2023aPm.pm),
  normalize(r2023h, r2023hPm.pm),
  normalize(r2022a, r2022aPm.pm),
  normalize(r2022h, r2022hPm.pm),
  normalize(r2021a, []),
  normalize(r2021h, []),
  normalize(r2020o, []),
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
// (概念問題の選択肢は文章。収録済み全問では数値選択肢が1〜2個の問題は0件で、
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

// 上付き文字の指数(例 10⁻⁶)を ^ 付きASCII(10^-6)へ寄せる。令和3年度以降の
// データは指数をUnicode上付き文字で書く規約のため、これが無いと数値判定から漏れる。
// n² のような変数付きの式は n^2 になり、数値の正規表現には一致しない(誤検出しない)。
const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};
function normalizeSuperscripts(t: string): string {
  return t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) =>
    `^${[...run].map((c) => SUPERSCRIPT_MAP[c]).join("")}`
  );
}

function isNumericChoice(s: string): boolean {
  let t = s.replace(/[,\s　]/g, ""); // カンマ・空白を先に除去
  t = t.replace(/^(約|およそ|最大|最小|マイナス|-|−)/, "");
  t = stripUnits(t);
  t = normalizeSuperscripts(t);
  if (!t) return false;
  return (
    /^\d+(\.\d+)?$/.test(t) || // 整数・小数
    /^\d+\/\d+$/.test(t) || // 分数(例 1/32)
    /^\d+(\.\d+)?[×xX]10\^?-?\d+$/.test(t) || // 指数表記(10^-6 / 10⁻⁶)
    /^2\^?-?\d+$/.test(t) // 2のべき
  );
}

// 選択肢が数値でないため上の判定では拾えないが、式(論理式・集合演算・計算量・
// 漸化式・記法変換など)を導いて答える計算問題や、計算した結果を順序・金額・
// グラフで選ぶ計算問題。収録済み問題を精読して個別に列挙した。
const EXTRA_CALC_IDS = [
  // 式で答える(論理式・集合演算・ビット演算・計算量・漸化式・記法変換)
  "2020r02o-am-01", "2020r02o-am-03", // 進数の桁数 / 逆ポーランド表記
  "2021r03a-am-02", "2021r03a-am-08", // 待ち時間 / オーバフロー条件
  "2021r03a-am-22", "2021r03a-am-23", "2021r03a-am-35", // 論理回路 / ビット演算
  "2021r03h-am-01", "2021r03h-am-34", // 論理演算 / IPアドレスのビット演算
  "2022r04a-am-02", "2025r07a-am-01", // カルノー図→論理式
  "2022r04h-am-02", "2025r07h-am-28", // 集合/関係代数の式
  "2023r05h-am-21", "2025r07a-am-21", "2025r07h-am-01", // 論理式
  "2023r05h-am-01", // ビット演算の式
  "2023r05a-am-01", // 2進数の式
  "2023r05h-am-06", "2025r07a-am-06", // 平均比較回数の式
  "2024r06h-am-38", // 鍵数の式
  "2024r06h-am-02", // 待ち時間の式
  "2025r07h-am-07", // 再帰的定義
  "2022r04h-am-01", // 浮動小数点の計算
  "2024r06a-am-03", "2024r06h-am-06", // 逆ポーランド/木の走査出力
  // 計算するが答えが数値以外(順序・記述・グラフ・金額)で数値判定から漏れたもの
  "2020r02o-am-04", "2020r02o-am-12", // 符号長 / HPC性能(選択肢が図中)
  "2020r02o-am-23", "2020r02o-am-47", // LUT回路 / 流れ図のトレース
  "2020r02o-am-55", "2020r02o-am-75", // 逓減課金グラフ / 発注費用の式
  "2021r03a-am-68", "2021r03a-am-75", "2021r03a-am-77", // コスト比較 / マクシミン / 損益比較
  "2021r03h-am-14", // 稼働率の計算結果をグラフで選ぶ
  "2021r03h-am-25", // SR回路の状態遷移
  "2024r06a-am-14", "2023r05h-am-16", "2025r07h-am-13", // 稼働率の計算
  "2023r05h-am-75", "2024r06h-am-54", // 期待値(EMV)
  "2024r06h-am-64", "2024r06a-am-64", // PBP/BPRの金額計算
];

const calcIds = new Set<string>([
  ...AM_QUESTIONS.filter((q) => {
    const ch = q.choices ?? [];
    if (ch.length < 3) return false; // 選択肢が図中(choicesInFigure)等は対象外
    return ch.filter(isNumericChoice).length >= 3;
  }).map((q) => q.id),
  ...EXTRA_CALC_IDS,
]);

/** 計算問題(選択肢が数値の定量問題)かどうか */
export function isCalcQuestion(q: AmQuestion): boolean {
  return calcIds.has(q.id);
}

// --- 選択肢シャッフルの可否 ------------------------------------------------
// 「ア〜エ」のような範囲参照は記号の振り直し(文字単位の変換)では意味が壊れる
const KANA_RANGE = /[アイウエ]\s*[〜~-]\s*[アイウエ]/;

/**
 * 選択肢の並びをシャッフルして出題できる問題かどうか。除外するのは:
 * - 選択肢が図中にある問題(画面側で並び替えできない)
 * - 4択でない問題
 * - 数値選択肢の問題(実試験の昇順掲載の慣例を保つ。位置で覚える弊害も小さい)
 * - 問題文・選択肢が記号を参照する問題 / 解説等に範囲参照(ア〜エ)がある問題
 */
export function canShuffleChoices(q: AmQuestion): boolean {
  if (q.choicesInFigure) return false;
  const ch = q.choices ?? [];
  if (ch.length !== 4) return false;
  if (ch.filter(isNumericChoice).length >= 3) return false;
  if (hasStandaloneKana(q.text) || ch.some((c) => hasStandaloneKana(c))) return false;
  if (KANA_RANGE.test(`${q.explanation}\n${q.point ?? ""}`)) return false;
  return true;
}

interface QueryOptions {
  excludeCalc?: boolean; // 計算問題を除外する
  /** 出題する試験回(examId)。未指定・空配列なら全回から出題 */
  examIds?: string[];
}

export function questionsByMiddle(
  middles: string[],
  opts: QueryOptions = {}
): AmQuestion[] {
  const set = middles.length ? new Set(middles) : null;
  const exams = opts.examIds?.length ? new Set(opts.examIds) : null;
  return AM_QUESTIONS.filter(
    (q) =>
      (!set || set.has(q.middle)) &&
      (!exams || exams.has(q.examId)) &&
      (!opts.excludeCalc || !calcIds.has(q.id))
  );
}

export function countByMiddle(opts: QueryOptions = {}): Map<string, number> {
  const map = new Map<string, number>();
  const exams = opts.examIds?.length ? new Set(opts.examIds) : null;
  for (const q of AM_QUESTIONS) {
    if (opts.excludeCalc && calcIds.has(q.id)) continue;
    if (exams && !exams.has(q.examId)) continue;
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
