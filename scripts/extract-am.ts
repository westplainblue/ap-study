/**
 * 午前問題の転記チャンク+公式解答例から、アプリ用の試験データJSONを組み立てる。
 *
 * 入力:
 *   data-src/work/am_chunks-<code>/*.json  … 転記チャンク(問題文・選択肢・解説・図表指定)
 *   data-src/pdf/<code>_ap_am_ans.pdf      … 公式解答例(正答と分野T/M/S)
 *   data-src/pages/am-<code>/p-NN.png      … ページ画像(図表切り出し元)
 * 出力:
 *   src/data/exams/<code>.am.json
 *   public/figures/<code>/am-qNN.png
 *
 * 使い方: npm run extract-am -- <examCode> "<label>"
 *   例:   npm run extract-am -- 2025r07a "令和7年度 秋期"
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface FigureSpec {
  page: number;
  top: number; // ページ高さに対する割合 0-1
  bottom: number;
  left?: number;
  right?: number;
}

interface ChunkQuestion {
  number: number;
  text: string;
  choices: string[];
  middle: string;
  figure?: FigureSpec;
  choicesInFigure?: boolean;
  explanation: string;
  point?: string;
}

const [code, label] = process.argv.slice(2);
if (!code || !label) {
  console.error('usage: npm run extract-am -- <examCode> "<label>"');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const chunksDir = path.join(root, `data-src/work/am_chunks-${code}`);
const pagesDir = path.join(root, `data-src/pages/am-${code}`);
const figuresDir = path.join(root, `public/figures/${code}`);
const ansPdf = path.join(root, `data-src/pdf/${code}_ap_am_ans.pdf`);

// --- 1. 公式解答例をパース(問N → 正答記号・分野) ---
const ansText = execFileSync("pdftotext", ["-layout", ansPdf, "-"]).toString();
const answers = new Map<number, { answer: number; major: "T" | "M" | "S" }>();
const kanaIndex: Record<string, number> = { ア: 0, イ: 1, ウ: 2, エ: 3 };
const majorMap: Record<string, "T" | "M" | "S"> = { Ｔ: "T", Ｍ: "M", Ｓ: "S", T: "T", M: "M", S: "S" };
for (const m of ansText.matchAll(/問\s*(\d{1,2})\s+([アイウエ])\s+([ＴＭＳTMS])/g)) {
  answers.set(Number(m[1]), {
    answer: kanaIndex[m[2]],
    major: majorMap[m[3]],
  });
}
if (answers.size !== 80) {
  console.error(`解答例のパース結果が80問になりません: ${answers.size}問`);
  process.exit(1);
}

// --- 2. 転記チャンクを読み込み ---
const chunks: ChunkQuestion[] = readdirSync(chunksDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(path.join(chunksDir, f), "utf8")));

const seen = new Set<number>();
for (const q of chunks) {
  if (seen.has(q.number)) throw new Error(`問${q.number} が重複しています`);
  seen.add(q.number);
}

// --- 3. 図表を切り出し(sips) ---
mkdirSync(figuresDir, { recursive: true });
function cropFigure(qNum: number, spec: FigureSpec): string {
  const pageFile = path.join(pagesDir, `p-${String(spec.page).padStart(2, "0")}.png`);
  if (!existsSync(pageFile)) throw new Error(`ページ画像がありません: ${pageFile}`);
  const info = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", pageFile])
    .toString();
  const width = Number(info.match(/pixelWidth: (\d+)/)?.[1]);
  const height = Number(info.match(/pixelHeight: (\d+)/)?.[1]);
  const left = Math.round((spec.left ?? 0.08) * width);
  const right = Math.round((spec.right ?? 0.95) * width);
  const top = Math.round(spec.top * height);
  const bottom = Math.round(spec.bottom * height);
  const outName = `am-q${String(qNum).padStart(2, "0")}.png`;
  const outPath = path.join(figuresDir, outName);
  execFileSync("sips", [
    "-c", String(bottom - top), String(right - left),
    "--cropOffset", String(top), String(left),
    pageFile, "--out", outPath,
  ]);
  return `figures/${code}/${outName}`;
}

// --- 4. 組み立て・検証 ---
const questions = chunks
  .sort((a, b) => a.number - b.number)
  .map((q) => {
    const ans = answers.get(q.number);
    if (!ans) throw new Error(`問${q.number} の正答がありません`);
    if (!q.choicesInFigure && q.choices.length !== 4)
      throw new Error(`問${q.number} の選択肢が4個ではありません`);
    if (!q.explanation) throw new Error(`問${q.number} の解説がありません`);
    return {
      id: `${code}-am-${String(q.number).padStart(2, "0")}`,
      examId: code,
      number: q.number,
      text: q.text,
      choices: q.choices,
      answer: ans.answer,
      major: ans.major,
      middle: q.middle,
      ...(q.figure ? { figure: cropFigure(q.number, q.figure) } : {}),
      ...(q.choicesInFigure ? { choicesInFigure: true } : {}),
      explanation: q.explanation,
      ...(q.point ? { point: q.point } : {}),
    };
  });

console.log(`組み立て: ${questions.length}問(80問未満でも途中経過として出力します)`);

const out = {
  examId: code,
  label,
  source: `出典: ${label} 応用情報技術者試験 午前問題(IPA 独立行政法人情報処理推進機構)`,
  am: questions,
};

const outPath = path.join(root, `src/data/exams/${code}.am.json`);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
console.log(`wrote: ${outPath}`);
