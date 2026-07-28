/**
 * AIマーキング: AIの返答末尾に付く ```marks フェンスブロックを解釈し、
 * 問題文・選択肢内の文字範囲へ対応付けて蛍光マーカー/下線を表示する。
 *
 * - AIには「画面に実在する文字列をそのまま引用させる」だけで、位置は
 *   クライアント側の正規化マッチャで解決する(全640問で100%一致を検証済み)。
 * - 引用が見つからない・書式が壊れているマークは黙って捨てる(機能は劣化縮退)。
 * - ストアは aiContext と同じ購読パターン。AiChat が生マークを発行し、
 *   Player/DrillPlayer が現在の問題に解決して QuestionCard へ渡す。
 */

export type MarkStyle = "marker" | "underline";

export interface RawMark {
  quote: string;
  style?: string;
  note?: string;
}

/** target: "text"=問題文 / 数値=選択肢の元添字 */
export interface ResolvedMark {
  target: "text" | number;
  start: number;
  end: number;
  style: MarkStyle;
  note?: string;
}

export const MARKS_FENCE = "```marks";
const MAX_MARKS = 5; // AIに許す最大件数(プロンプトでは3件までと案内)
const MAX_RANGES = 8; // 描画する範囲の総数上限
const MIN_QUOTE = 3; // これ未満の引用は誤爆しやすいので無視

// --- 返答テキストの処理 ------------------------------------------------------

/** チャット表示用: marks ブロックを除去する(ストリーミング途中の未完ブロックも隠す) */
export function stripMarksBlock(text: string): string {
  const i = text.indexOf(MARKS_FENCE);
  if (i < 0) return text;
  const end = text.indexOf("```", i + MARKS_FENCE.length);
  const rest = end >= 0 ? text.slice(end + 3) : "";
  return (text.slice(0, i) + rest).replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** 返答から marks ブロックを取り出して解釈する(壊れていれば空配列) */
export function parseMarks(text: string): RawMark[] {
  const i = text.lastIndexOf(MARKS_FENCE);
  if (i < 0) return [];
  const end = text.indexOf("```", i + MARKS_FENCE.length);
  if (end < 0) return []; // 未完(ストリーミング途中)は不採用
  const body = text.slice(i + MARKS_FENCE.length, end).trim();
  let arr: unknown;
  try {
    arr = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: RawMark[] = [];
  for (const m of arr) {
    if (out.length >= MAX_MARKS) break;
    if (!m || typeof m !== "object") continue;
    const quote = (m as RawMark).quote;
    if (typeof quote !== "string" || quote.trim().length < MIN_QUOTE) continue;
    out.push({
      quote: quote.trim(),
      style: typeof (m as RawMark).style === "string" ? (m as RawMark).style : undefined,
      note: typeof (m as RawMark).note === "string" ? (m as RawMark).note : undefined,
    });
  }
  return out;
}

// --- 引用 → 文字範囲の解決 ---------------------------------------------------

/** 全半角・空白・句読点のゆれを吸収する正規化 */
function normChar(c: string): string {
  if (/[\s　]/.test(c)) return "";
  if (c === "，" || c === ",") return ",";
  if (c === "．" || c === "." || c === "。") return ".";
  const code = c.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
  return c;
}

/** text 中の quote の出現位置(最大 limit 件)を、表記ゆれを許して返す */
export function findRanges(
  text: string,
  quote: string,
  limit = 3
): [number, number][] {
  const out: [number, number][] = [];
  // 1) 素朴な完全一致(複数箇所)
  for (let i = text.indexOf(quote); i >= 0 && out.length < limit; i = text.indexOf(quote, i + 1)) {
    out.push([i, i + quote.length]);
  }
  if (out.length > 0) return out;
  // 2) 正規化空間で探し、元テキストの位置へ写像する
  let nq = "";
  for (const c of quote) nq += normChar(c);
  if (nq.length < MIN_QUOTE) return [];
  let nt = "";
  const map: number[] = [];
  for (let k = 0; k < text.length; k++) {
    const c = normChar(text[k]);
    for (let j = 0; j < c.length; j++) map.push(k);
    nt += c;
  }
  for (let j = nt.indexOf(nq); j >= 0 && out.length < limit; j = nt.indexOf(nq, j + 1)) {
    out.push([map[j], map[j + nq.length - 1] + 1]);
  }
  return out;
}

/** 現在の問題に対して生マークを文字範囲へ解決する */
export function resolveMarks(
  q: { text: string; choices: string[] },
  marks: RawMark[]
): ResolvedMark[] {
  const out: ResolvedMark[] = [];
  for (const m of marks) {
    if (out.length >= MAX_RANGES) break;
    const style: MarkStyle = m.style === "underline" ? "underline" : "marker";
    let found = false;
    for (const [start, end] of findRanges(q.text, m.quote)) {
      out.push({ target: "text", start, end, style, note: m.note });
      found = true;
    }
    q.choices.forEach((c, oi) => {
      for (const [start, end] of findRanges(c, m.quote)) {
        out.push({ target: oi, start, end, style, note: m.note });
        found = true;
      }
    });
    void found; // 見つからない引用は黙って捨てる
  }
  return out.slice(0, MAX_RANGES);
}

/** 1つの文字列に対する範囲群を、重なりを統合したセグメント列に変換する(描画用) */
export interface TextSegment {
  text: string;
  mark?: { style: MarkStyle; note?: string };
}

export function segmentText(
  text: string,
  marks: { start: number; end: number; style: MarkStyle; note?: string }[]
): TextSegment[] {
  const sorted = [...marks]
    .filter((m) => m.start < m.end && m.start >= 0 && m.end <= text.length)
    .sort((a, b) => a.start - b.start);
  // 重なりは統合(先勝ちのスタイル・noteを維持)
  const merged: typeof sorted = [];
  for (const m of sorted) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ ...m });
    }
  }
  const segs: TextSegment[] = [];
  let pos = 0;
  for (const m of merged) {
    if (m.start > pos) segs.push({ text: text.slice(pos, m.start) });
    segs.push({
      text: text.slice(m.start, m.end),
      mark: { style: m.style, note: m.note },
    });
    pos = m.end;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}

// --- ストア(生マークの受け渡し) ---------------------------------------------

let current: RawMark[] = [];
const listeners = new Set<() => void>();

export function setAiMarks(marks: RawMark[]): void {
  current = marks;
  listeners.forEach((fn) => fn());
}

export function getAiMarks(): RawMark[] {
  return current;
}

export function subscribeAiMarks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- プロンプト --------------------------------------------------------------

/** マーキング有効時にシステムプロンプトへ足す指示 */
export const MARKS_PROMPT = [
  "",
  "【重要箇所のマーキング】",
  "解説で根拠となる箇所を示すときは、返答本文の最後に次の形式のブロックを1つだけ付けてください。",
  '```marks',
  '[{"quote":"問題文または選択肢から一字一句そのまま写した引用","style":"marker","note":"短い補足"}]',
  "```",
  '- quote は画面の問題文・選択肢に実在する連続した文字列をそのまま写す(要約・言い換えは不可)',
  '- style は "marker"(蛍光ペン) か "underline"(下線)',
  "- 多くても3件まで。本文への言及が無い回答ではブロック自体を付けない",
].join("\n");
