/**
 * 頻出問題の索引(同じ問題が複数回出題されたグループ)を機械生成する。
 *
 * 入力:
 *   src/data/ の全午前問題
 * 出力:
 *   src/data/frequent-index.json … string[][](各要素が1グループの問題ID。古い回→新しい回の順)
 *
 * 応用情報の午前は、過去問がほぼ同文(表記ゆれ程度)で再出題されることが多い。
 * 別の試験回の問題どうしを「問題文」と「選択肢の集合」の文字2-gram Dice係数で
 * 比べ、次のいずれかを満たすペアを同一問題とみなして Union-Find で束ねる。
 *
 *   A. 問題文 ≥ 0.8 かつ 選択肢 ≥ 0.6 … 同文の再出題(表記ゆれ・軽微な言い換え)
 *   B. 問題文 ≥ 0.6 かつ 選択肢 ≥ 0.6 … 前置きが変わった再出題(「平成30年」→「令和5年」等)
 *   C. 選択肢 ≥ 0.9 かつ 問題文 ≥ 0.4 … 同じ選択肢セットから別の項目を問う
 *      (例: SL理論/PM理論/コンティンジェンシー理論)。数値選択肢は「1,2,3,4」のような
 *      偶然の一致が多いので、計算問題はこの規則から除く
 *   D. 選択肢が図中にある問題どうしは 問題文 ≥ 0.85 … 選択肢が「(図のア)」に合成されて
 *      いて比較できないため、問題文だけで厳しめに判定する
 *
 * 問題文だけの一致は「〜に関する記述のうち,適切なものはどれか」型の定型文で
 * 別問題が大量に誤爆するため採用しない(選択肢まで見て初めて同一と言える)。
 * しきい値は収録880問の全ペアを目視して決めた(tests/frequent.test.mjs が
 * 生成物と実データの整合を回帰検証する)。
 *
 * 使い方: npm run build:frequent
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { AM_QUESTIONS, EXAMS, isCalcQuestion } from "../src/data";
import type { AmQuestion } from "../src/data/types";

const root = path.resolve(import.meta.dirname, "..");

// --- 正規化と類似度 ---------------------------------------------------------
// 全角/半角・記号・空白の違いは同一視する(IPAの表記規約が年度で変わるため)
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s,，、。．.()（）「」〔〕:：;；・/／\-−―~〜"'’“”]/g, "");
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) set.add(s.slice(i, i + 2));
  return set;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const g of a) if (b.has(g)) common++;
  return (2 * common) / (a.size + b.size);
}

interface Entry {
  q: AmQuestion;
  text: Set<string>;
  choices: Set<string>;
  calc: boolean;
  inFigure: boolean; // 選択肢が図中(choices は合成された仮のもの)
}

const entries: Entry[] = AM_QUESTIONS.map((q) => ({
  q,
  text: bigrams(normalize(q.text)),
  // 選択肢は並び順に依らず集合として比べる
  choices: bigrams(normalize([...q.choices].sort().join(""))),
  calc: isCalcQuestion(q),
  inFigure: Boolean(q.choicesInFigure),
}));

function isSameQuestion(a: Entry, b: Entry): boolean {
  if (a.q.examId === b.q.examId) return false; // 同じ回の中では束ねない
  const t = dice(a.text, b.text);
  if (t < 0.4) return false; // 早期打切り(選択肢の比較は重い)
  if (a.inFigure || b.inFigure) return a.inFigure && b.inFigure && t >= 0.85; // D
  const c = dice(a.choices, b.choices);
  if (t >= 0.8 && c >= 0.6) return true; // A
  if (t >= 0.6 && c >= 0.6) return true; // B
  if (c >= 0.9 && !a.calc && !b.calc) return true; // C
  return false;
}

// --- Union-Find で束ねる -----------------------------------------------------
const parent = new Map<string, string>(AM_QUESTIONS.map((q) => [q.id, q.id]));
function find(x: string): string {
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r)!;
  while (parent.get(x) !== r) {
    const next = parent.get(x)!;
    parent.set(x, r);
    x = next;
  }
  return r;
}
function union(a: string, b: string): void {
  parent.set(find(a), find(b));
}

let pairs = 0;
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    if (isSameQuestion(entries[i], entries[j])) {
      union(entries[i].q.id, entries[j].q.id);
      pairs++;
    }
  }
}

const members = new Map<string, AmQuestion[]>();
for (const q of AM_QUESTIONS) {
  const r = find(q.id);
  if (!members.has(r)) members.set(r, []);
  members.get(r)!.push(q);
}

// EXAMS は新しい回が先。グループ内は古い回→新しい回の順に並べる
const examOrder = new Map(EXAMS.map((e, i) => [e.examId, EXAMS.length - i]));
const groups = [...members.values()]
  .filter((g) => new Set(g.map((q) => q.examId)).size >= 2)
  .map((g) =>
    [...g].sort(
      (a, b) =>
        (examOrder.get(a.examId) ?? 0) - (examOrder.get(b.examId) ?? 0) ||
        a.number - b.number
    )
  )
  // 出力を安定させる(差分レビューのため): 先頭IDの辞書順
  .sort((a, b) => (a[0].id < b[0].id ? -1 : 1));

// --- 検証と出力 -------------------------------------------------------------
const total = groups.reduce((n, g) => n + g.length, 0);
console.log(`同一判定ペア: ${pairs} / グループ: ${groups.length}組 ${total}問`);
const sizes = new Map<number, number>();
for (const g of groups) {
  const n = new Set(g.map((q) => q.examId)).size;
  sizes.set(n, (sizes.get(n) ?? 0) + 1);
}
for (const [n, c] of [...sizes].sort((a, b) => b[0] - a[0])) {
  console.log(`  ${n}回出題: ${c}組`);
}
const big = groups.filter((g) => g.length >= 6);
if (big.length > 0) {
  // 推移的な連結で無関係な問題が巻き込まれた疑い。しきい値を見直す
  console.error(`6問以上のグループがあります(誤結合の疑い): ${big.map((g) => g[0].id)}`);
  process.exit(1);
}

if (process.argv.includes("--verbose")) {
  for (const g of groups) {
    console.log(`\n[${g.length}] ${g.map((q) => q.id).join(" ")}`);
    for (const q of g) console.log(`  ${q.text.slice(0, 70).replace(/\n/g, " ")}`);
  }
}

writeFileSync(
  path.join(root, "src/data/frequent-index.json"),
  JSON.stringify(groups.map((g) => g.map((q) => q.id)), null, 1) + "\n"
);
console.log(`\nsrc/data/frequent-index.json を出力しました(${groups.length}組)`);
