/**
 * 計算ドリルのテーマ索引(問題ID → テーマID)を機械生成する。
 *
 * 入力:
 *   src/data/ の全午前問題(isCalcQuestion で計算問題を抽出)
 *   src/data/calc-themes.json           … テーマ定義(公式カード)
 *   scripts/calc-theme-overrides.json   … キーワード分類の手動修正
 * 出力:
 *   src/data/calc-index.json            … { 問題ID: テーマID }
 *
 * 分類はキーワードルール(上から順に、最初にマッチしたテーマ)+ overrides。
 * 全計算問題がいずれかのテーマに属することをここで強制し(未分類なら exit 1)、
 * tests/calc.test.mjs が生成物と実データの整合を回帰検証する。
 * 問題を追加して未分類が出たら、ルールか overrides に追記して再生成する。
 *
 * 使い方: npm run build:calc
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AM_QUESTIONS, isCalcQuestion } from "../src/data";

const root = path.resolve(import.meta.dirname, "..");

interface Theme {
  id: string;
  name: string;
}
const themes: Theme[] = JSON.parse(
  readFileSync(path.join(root, "src/data/calc-themes.json"), "utf8")
).themes;
const themeIds = new Set(themes.map((t) => t.id));

interface Override {
  theme: string;
  note: string; // なぜキーワード分類に任せないかの記録
}
const overrides: Record<string, Override> = JSON.parse(
  readFileSync(path.join(root, "scripts/calc-theme-overrides.json"), "utf8")
);

// --- キーワードルール(上から順に評価し、最初にマッチしたテーマに入れる) -----
// 判定対象は問題文+選択肢のみ(解説まで見ると別テーマの用語で誤爆しやすい)。
// 特定的なテーマを先に、語彙の広いテーマ(perf/pm/biz)を後に置く。
const RULES: [string, RegExp][] = [
  ["queue", /M\/M\/1|待ち行列/],
  ["svc", /SLA|サービス可用性|サービス停止|サービスの停止|シフト|交替|交代勤務|バックアップ/],
  ["avail", /稼働率|MTBF|MTTR|フェールオーバ/],
  ["hw", /LED|D\/A変換|センサー|消費電流|消費電力|ダウンカウンター|カウントアップ|間欠動作|スイッチの値/],
  ["net", /LAN|回線|伝送|パケット|IPv4|IPアドレス|サブネット|MTU|標本化|サンプリング|量子化|画素|ピクセル|フレーム\/秒|base64|MIME/],
  ["radix", /ハミング|パリティ|符号語|符号長|符号化|浮動小数点|オーバフロー|オーバーフロー|基数|何桁|桁数|10進表示|補数/],
  ["logic", /カルノー図|論理式|論理積|論理和|論理回路|真理値|ブール演算|相補演算|排他的論理和|NAND|含意|LUT|Lookup|補集合|和集合|共通演算|差演算/],
  // 「キャッシュ」単独は「キャッシュイン(現金収入)」に誤爆するため「キャッシュメモリ」で判定する
  ["mem", /キャッシュメモリ|ヒット率|ページ|仮想記憶|主記憶|磁気ディスク|フラッシュメモリ|RAID|LRU|FIFO/],
  ["decision", /期待金額|デシジョンツリー|マクシミン|課金|テレワーク|スケールメリット|シナジー|BPR|Pay\s?Back|PBP|投資|比較表/],
  ["prob", /確率|期待値|何通り|総当たり/],
  ["algo", /探索|整列|ソート|逆ポーランド|再帰|流れ図|網羅|テストケース|スタック|2分|二分|SQL|SELECT|比較回数|クイック|アルゴリズム/],
  ["perf", /CPI|MIPS|クロック|パイプライン|高速化率|マルチプロセッサ|ターンアラウンド|多重度|CPU|命令|ジョブ|タスク|演算性能|プロセッサ/],
  ["pm", /アローダイアグラム|プレシデンス|クリティカルパス|スケジュール|工数|アーンドバリュー|プロジェクト|作業配分|要員|埋込み|作業/],
  ["ops", /製造|正味所要量|発注|在庫|段取り|ABC分析|評価点|目標達成度|出荷|最大利益|最大営業利益/],
  ["biz", /損益|変動費|固定費|減価償却|自己資本|貸借対照表|ROAS|Activity-Based|営業利益|利益/],
];

function classify(text: string): string | null {
  for (const [theme, re] of RULES) {
    if (re.test(text)) return theme;
  }
  return null;
}

// --- 分類の実行 -------------------------------------------------------------
const calcQuestions = AM_QUESTIONS.filter(isCalcQuestion);
console.log(`計算問題: ${calcQuestions.length}問 / テーマ: ${themes.length}件`);

const index: Record<string, string> = {};
const unclassified: string[] = [];

for (const q of calcQuestions) {
  const ov = overrides[q.id];
  const theme = ov ? ov.theme : classify(`${q.text}\n${q.choices.join("\n")}`);
  if (!theme) {
    unclassified.push(q.id);
    continue;
  }
  if (!themeIds.has(theme)) {
    console.error(`未定義のテーマ "${theme}" (${q.id})`);
    process.exit(1);
  }
  index[q.id] = theme;
}

// --- 検証(不変条件はテストでも回帰確認する) -------------------------------
for (const id of Object.keys(overrides)) {
  const q = AM_QUESTIONS.find((x) => x.id === id);
  if (!q) {
    console.error(`override の問題IDが存在しません: ${id}`);
    process.exit(1);
  }
  if (!isCalcQuestion(q)) {
    console.error(`override の問題は計算問題ではありません: ${id}`);
    process.exit(1);
  }
}

if (unclassified.length > 0) {
  console.error(`\n未分類の計算問題が ${unclassified.length} 問あります:`);
  for (const id of unclassified) {
    const q = calcQuestions.find((x) => x.id === id)!;
    console.error(`  ${id} [${q.middle}] ${q.text.slice(0, 60)}`);
  }
  console.error("ルールか scripts/calc-theme-overrides.json に追記してください。");
  process.exit(1);
}

const counts = new Map<string, number>();
for (const t of Object.values(index)) counts.set(t, (counts.get(t) ?? 0) + 1);
for (const t of themes) {
  const n = counts.get(t.id) ?? 0;
  console.log(`  ${t.id.padEnd(8)} ${String(n).padStart(3)}問  ${t.name}`);
  if (n === 0) {
    console.error(`テーマ "${t.id}" に問題が1問もありません`);
    process.exit(1);
  }
}

// キーをソートして出力を安定させる(差分レビューのため)
const sorted = Object.fromEntries(
  Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1))
);
writeFileSync(
  path.join(root, "src/data/calc-index.json"),
  JSON.stringify(sorted, null, 1) + "\n"
);
console.log(`\nsrc/data/calc-index.json を出力しました(${Object.keys(sorted).length}問)`);
