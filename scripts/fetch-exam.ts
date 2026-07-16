/**
 * IPA公式サイトから応用情報の過去問PDFを取得し、午前問題をページ画像化する。
 *
 * 使い方:
 *   npm run fetch-exam -- <examCode> <listingPageUrl>
 *   例: npm run fetch-exam -- 2025r07a https://www.ipa.go.jp/shiken/mondai-kaiotu/2025r07.html
 *
 * 取得物: data-src/pdf/<code>_ap_{am,pm}_{qs,ans}.pdf
 * 画像化: data-src/pages/am-<code>/p-NN.png (要 poppler: brew install poppler)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [code, listingUrl] = process.argv.slice(2);
if (!code || !listingUrl) {
  console.error("usage: npm run fetch-exam -- <examCode> <listingPageUrl>");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const pdfDir = path.join(root, "data-src/pdf");
mkdirSync(pdfDir, { recursive: true });

const html = await (await fetch(listingUrl)).text();
const targets = ["am_qs", "am_ans", "pm_qs", "pm_ans"].map(
  (kind) => `${code}_ap_${kind}.pdf`
);

for (const file of targets) {
  const re = new RegExp(`href="([^"]*${file})"`);
  const m = html.match(re);
  if (!m) {
    console.error(`リンクが見つかりません: ${file}(ページ構成を確認してください)`);
    continue;
  }
  const url = new URL(m[1], listingUrl).toString();
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const out = path.join(pdfDir, file);
  writeFileSync(out, buf);
  console.log(`downloaded: ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// 午前問題はテキスト層が無い(画像PDF)ため、ページ画像化して人手+AIで転記する
const pagesDir = path.join(root, `data-src/pages/am-${code}`);
mkdirSync(pagesDir, { recursive: true });
execFileSync("pdftoppm", [
  "-png",
  "-r",
  "200",
  path.join(pdfDir, `${code}_ap_am_qs.pdf`),
  path.join(pagesDir, "p"),
]);
console.log(`rendered pages -> ${pagesDir}`);
console.log(
  "次の手順: ページ画像から問題を data-src/work/am_chunks-<code>/*.json に転記し、npm run extract-am を実行"
);
