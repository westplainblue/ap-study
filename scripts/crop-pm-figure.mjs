/**
 * 午後問題PDFのページから図表を切り出して public/figures/<code>/ に保存する。
 *
 * 使い方:
 *   node scripts/crop-pm-figure.mjs <code> <page> <top> <bottom> <outName> [left] [right]
 *   例: node scripts/crop-pm-figure.mjs 2025r07h 6 0.68 0.93 pm-q01-fig1
 *
 * top/bottom/left/right はページに対する比率(0〜1)。left/right は省略時 0.10/0.95
 * (IPAの午後PDFは左右に広い余白があるため既定で少し詰める)。
 * poppler の pdftoppm だけで完結する(画像ライブラリ不要)。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const [code, page, top, bottom, outName, left = "0.10", right = "0.95"] =
  process.argv.slice(2);

if (!code || !page || !top || !bottom || !outName) {
  console.error(
    "usage: node scripts/crop-pm-figure.mjs <code> <page> <top> <bottom> <outName> [left] [right]"
  );
  process.exit(1);
}

const DPI = 200;
const root = path.resolve(import.meta.dirname, "..");
const pdf = path.join(root, `data-src/pdf/${code}_ap_pm_qs.pdf`);
const outDir = path.join(root, `public/figures/${code}`);
mkdirSync(outDir, { recursive: true });

// ページの実寸(pt)を取得してピクセル寸法を求める
const info = execFileSync("pdfinfo", ["-f", page, "-l", page, pdf], {
  encoding: "utf8",
});
const m = info.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/);
if (!m) {
  console.error("ページサイズを取得できませんでした:\n" + info);
  process.exit(1);
}
const pxW = Math.round((Number(m[1]) / 72) * DPI);
const pxH = Math.round((Number(m[2]) / 72) * DPI);

const x = Math.round(pxW * Number(left));
const y = Math.round(pxH * Number(top));
const w = Math.round(pxW * (Number(right) - Number(left)));
const h = Math.round(pxH * (Number(bottom) - Number(top)));

const tmpPrefix = path.join(outDir, `.tmp-${outName}`);
execFileSync("pdftoppm", [
  "-png",
  "-r", String(DPI),
  "-f", page,
  "-l", page,
  "-x", String(x),
  "-y", String(y),
  "-W", String(w),
  "-H", String(h),
  pdf,
  tmpPrefix,
]);

const produced = readdirSync(outDir).filter((f) =>
  f.startsWith(`.tmp-${outName}`)
);
if (produced.length !== 1) {
  produced.forEach((f) => rmSync(path.join(outDir, f)));
  console.error(`切り出しに失敗しました(生成ファイル数: ${produced.length})`);
  process.exit(1);
}
const dest = path.join(outDir, `${outName}.png`);
renameSync(path.join(outDir, produced[0]), dest);
console.log(
  `figures/${code}/${outName}.png (${w}x${h}px, p.${page} ${top}-${bottom})`
);
