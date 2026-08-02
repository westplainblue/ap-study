/**
 * 用語カード辞書(ことば帳)を既存の試験データから機械生成する。
 *
 * 入力:
 *   src/data/exams/*.am.json     … 収録済みの午前問題
 *   scripts/term-overrides.json  … キュレーション(drop/id/term/reading/aliases/fact)
 * 出力:
 *   src/data/terms.json          … TermCard[]
 *   src/data/term-index.json     … 問題ID → 用語ID[]
 *
 * 定義文は必ず出典問題の text/choices/point からの「連続部分文字列」で切り出す
 * (新規執筆はしない。tests/terms.test.mjs が逐語性を検証する)。
 *
 * 使い方: npm run build:terms
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AmQuestion } from "../src/data/types";
import type { CardSource, TermCard, TermIndex } from "../src/data/terms";
import { normalizeTermQuery } from "../src/data/terms";

const root = path.resolve(import.meta.dirname, "..");
const examsDir = path.join(root, "src/data/exams");

// --- 1. 全午前問題を読み込み ------------------------------------------------
const questions: AmQuestion[] = readdirSync(examsDir)
  .filter((f) => f.endsWith(".am.json"))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(path.join(examsDir, f), "utf8")).am as AmQuestion[]);

const questionById = new Map(questions.map((q) => [q.id, q]));
console.log(`問題数: ${questions.length}`);

// --- 2. 汚染フィルタ --------------------------------------------------------
// 否定形設問(「誤っているものはどれか」等)。正解が"当てはまらないもの"なので
// そのまま用語カードにすると逆定義になり有害。全パターンで抽出対象外とする。
const NEGATIVE_RE =
  /(ない[もこ]の[はも]?どれか|ないものはどれか|ないのはどれか|誤っているもの|間違っているもの|適切でないもの|不適切なもの|該当しないもの|含まれないもの|関係しないもの|当てはまらないもの|ふさわしくないもの)/;

// 問題固有の文脈(図・表・下線・「この〜」参照)を含む定義文は単独で読めないため捨てる
const CONTEXT_RE =
  /^(その|それ|これ|前述)|図のよう|図に示す|に示す図|次の図|下の図|表に示す|次の表|下線|図[1-9１-９]|表[1-9１-９]|本問|上記の|この|当該/;

// 数値・数式・アドレス表記など「用語でない」正解の判定
function isNumericOrFormula(s: string): boolean {
  const t = s.normalize("NFKC").replace(/[,\s　]/g, "");
  if (/^[0-9.]+[%％]?$/.test(t)) return true; // 数値(単位%まで)
  if (/^[0-9.]+[a-zA-Zビットバイト秒分時個台%％]{1,10}$/.test(t)) return true; // 数値+単位
  if (/^[0-9a-f:./^-]+$/i.test(t) && /[0-9]/.test(t) && /[:./^]/.test(t)) return true; // IPアドレス等
  if (/[×÷√∑∫≒≦≧]/.test(t) && !/[ぁ-ゖ一-鿿]/.test(t)) return true; // 数式
  return false;
}

// 選択肢が「用語名」か(文でない: 句点なし・30字以内・数値/数式でない)
function isTermLikeChoice(s: string): boolean {
  return !s.includes("。") && s.length <= 30 && s.length >= 2 && !isNumericOrFormula(s);
}

// 括弧の対応が取れているか(「指標の定義(〇〇率」のような切り出し事故の検出)
const BRACKET_PAIRS: [string, string][] = [["(（", ")）"], ["「", "」"], ["『", "』"]];
function parensBalanced(s: string): boolean {
  for (const [open, close] of BRACKET_PAIRS) {
    let depth = 0;
    for (const ch of s) {
      if (open.includes(ch)) depth++;
      else if (close.includes(ch)) depth--;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

// カードの見出し語として成立するか(選択肢用よりさらに厳しめ)
function isGoodTerm(s: string): boolean {
  if (!isTermLikeChoice(s)) return false;
  if (/[をへ]|こと|ため|など|及び/.test(s)) return false; // 句・節・列挙は見出しにしない
  if (/[、，「」『』“”"〇○◯〜~]/.test(s)) return false; // 引用符・伏せ字・波線入りは切り出し事故
  if (/[^0-9],|,[^0-9]/.test(s)) return false; // 列挙(桁区切り以外の半角カンマ)
  if (/における|によって|に係る/.test(s)) return false; // 問題固有の修飾句
  if (!parensBalanced(s)) return false;
  return true;
}

// --- 3. 抽出パターン --------------------------------------------------------
interface RawCard {
  term: string;
  def: string;
  defQid: string;
  source: CardSource;
  distractors?: string[];
}

const raw: RawCard[] = [];

// 見出し語末尾の「(EA)」等の括弧注記は別名に分離する
function splitParen(term: string): { term: string; alias?: string } {
  const m = term.match(/^(.+?)[(（]([^()（）]{2,25})[)）]$/);
  if (m && m[1].length >= 2) return { term: m[1].trim(), alias: m[2].trim() };
  return { term };
}

// 見出し語を囲む引用符("かんばん方式"等)を外す(見出しは逐語制約の対象外)
function stripQuotes(term: string): string {
  return term.replace(/^[“”"「『]+/, "").replace(/[“”"」』]+$/, "").trim();
}

// 設問文脈の前置き(「次の〜のうち,」等)を先頭から刈り込む
function trimLeadIn(stem: string): string {
  return stem
    .replace(/^次の[^。、，,]{0,15}のうち[、，,]\s*/, "")
    .replace(/^次のうち[、，,]\s*/, "")
    .replace(/^[、，,]\s*/, "");
}

// 3-1. choice-def: 「〜はどれか。」+ 4選択肢すべてが用語名 → 正解が用語、問題文が定義
const TAIL_RES = [
  /として[、，,]\s*最も適切なものはどれか。$/,
  /として[、，,]\s*適切なものはどれか。$/,
  /として[、，,]\s*正しいものはどれか。$/,
  /はどれか。$/,
];
for (const q of questions) {
  const text = q.text.trim();
  if (!/はどれか。$/.test(text)) continue;
  if (NEGATIVE_RE.test(text)) continue;
  if (q.figure || q.choicesInFigure) continue;
  if (q.choices.length !== 4) continue;
  if (!q.choices.every(isTermLikeChoice)) continue;
  const term = q.choices[q.answer];
  if (!isGoodTerm(term)) continue;

  // 設問文(「〜はどれか。」で終わる最後の文)だけを定義の切り出し対象にする
  const lastSep = Math.max(text.lastIndexOf("。", text.length - 2), text.lastIndexOf("\n"));
  const sentence = text.slice(lastSep + 1);
  let stem = sentence;
  for (const re of TAIL_RES) {
    if (re.test(stem)) {
      stem = stem.replace(re, "");
      break;
    }
  }
  stem = trimLeadIn(stem).trim();
  if (!stem || /はどれか。$/.test(stem)) continue; // 設問句を除去できなかった
  if (CONTEXT_RE.test(stem)) continue;
  if (stem.length < 8) continue; // 短すぎて定義にならない
  // 前提文が別にある問題は、設問文単独で定義として読める長さを要求する
  if (lastSep >= 0 && stem.length < 16) continue;
  raw.push({
    term,
    def: stem,
    defQid: q.id,
    source: "choice-def",
    distractors: q.choices.filter((_, i) => i !== q.answer),
  });
}

// 3-2. text-def: 「Xの説明はどれか」等から主題語Xを抽出 → 正解選択肢が定義
const SUBJECT_RES = [
  /(?:^|。|\n)([^。\n]*?)の説明として[、，,]\s*(?:最も)?適切なものはどれか。/,
  /(?:^|。|\n)([^。\n]*?)の説明はどれか。/,
  /(?:^|。|\n)([^。\n]*?)の特徴を説明したものはどれか。/,
  /(?:^|。|\n)([^。\n]*?)を説明したものはどれか。/,
  /(?:^|。|\n)([^。\n]*?)に該当するものはどれか。/,
];
// 主題語の前に付く文脈(「AIにおける」「〜の一種である,」等)を最後の区切りで刈る
const SUBJECT_LEAD_RES = [
  /における/g, /に関する記述のうち[、，,]/g, /の一種である[、，,]?/g, /の一つである/g,
  /手法である/g, /が提唱した/g, /で規定されている/g, /で使われる/g, /で用いられる/g,
  /として用いられる/g, /として使われる/g, /に使われる/g, /で使用される/g, /が行っている/g,
  /が提供する/g, /が規定している/g, /の際に作成される/g, /である/g,
  /とは[、，,]/g, /では[、，,]/g, /のうち[、，,]/g, /[、，,]/g,
];
// 主題語の末尾がこれらの一般名詞なら「用語」ではなく問題固有の言い回し
const GENERIC_TAIL_RE =
  /(もの|記述|説明|方法|理由|目的|状況|状態|場合|とき|例|観点|手順|指標|形態|行為|措置|対策|活動|作業|内容|用語)$/;

for (const q of questions) {
  if (NEGATIVE_RE.test(q.text)) continue;
  let subject: string | null = null;
  for (const re of SUBJECT_RES) {
    const m = q.text.match(re);
    if (m) {
      subject = m[1];
      break;
    }
  }
  if (!subject) continue;
  // 前置き文脈を最後の区切りの位置で刈り込む
  let cut = 0;
  for (const re of SUBJECT_LEAD_RES) {
    for (const m of subject.matchAll(re)) {
      cut = Math.max(cut, (m.index ?? 0) + m[0].length);
    }
  }
  subject = stripQuotes(trimLeadIn(subject.slice(cut).trim()));
  if (!isGoodTerm(subject)) continue;
  if (GENERIC_TAIL_RE.test(subject)) continue;
  const def = q.choices[q.answer];
  if (!def || def.length < 10) continue; // 定義文として短すぎる(用語だけ等)
  if (CONTEXT_RE.test(def)) continue;
  if (isNumericOrFormula(def)) continue;
  raw.push({ term: subject, def, defQid: q.id, source: "text-def" });
}

// 3-3. point-pair: point欄の「用語=説明」形式
// 説明の末尾がこれらなら対比・否定の断片(「〜と区別」等)なので捨てる(保守的に)
const BROKEN_DESC_RE = /(と区別|と対比|と混同しない|ではない|とは別|の逆|に対し)$/;
// 「覚え方」「解き方」の話法(〜と覚えましょう等)は定義ではないので捨てる
const MNEMONIC_RE =
  /(なので|コツ|キーワード|覚え|忘れない|押さえ|しましょう|解けます|解きます|計算します|求めます|に当てはめ|イメージする|[、，,]\s*です$)/;
// 複合語の後半だけが残った断片(「フェールソフト」の「ソフト」等)や一般語すぎる左辺
const GENERIC_TERM_SET = new Set([
  "ソフト", "ハード", "セーフ", "データ", "システム", "メモリ", "機能", "方式",
  "処理", "管理", "計画", "設計", "時間", "コスト",
]);
for (const q of questions) {
  if (!q.point) continue;
  if (NEGATIVE_RE.test(q.text)) continue;
  // 文単位に分け、文内の「、」は直後に別ペア(〜=)が続く場合だけ区切りとみなす
  const sentences = q.point.split(/(?<=。)|\n/);
  for (const sentence of sentences) {
    const segments = sentence.replace(/。$/, "").split(/[、，](?=[^、，=＝]{2,24}[=＝])/);
    for (const seg of segments) {
      const m = seg.trim().match(/^(.{2,24}?)[=＝](.+)$/s);
      if (!m) continue;
      const term = stripQuotes(m[1].trim());
      let desc = m[2].trim();
      if (!isGoodTerm(term) || GENERIC_TERM_SET.has(term)) continue;
      if (/[は=＝+＋×÷:：]|する|した|より|から|とき|場合|まず|が|^\d.*\d/.test(term)) continue; // 文・数式・文脈の左辺は見出しにしない
      // 説明全体を囲む鉤括弧は外す(連続部分文字列のまま)
      const quoted = desc.match(/^「(.+)」$/s);
      if (quoted && parensBalanced(quoted[1])) desc = quoted[1];
      if (desc.length < 8) continue;
      if (/^[)）」』]/.test(desc) || !parensBalanced(desc)) continue; // 括弧の切り出し事故
      if (/[=＝]/.test(desc)) continue; // 連鎖(X=Y=Z)は壊れやすい
      if ((desc.match(/[ぁ-ゖ]/g) ?? []).length < 2) continue; // 数式・記号列を除外
      if (BROKEN_DESC_RE.test(desc) || MNEMONIC_RE.test(desc)) continue;
      if (CONTEXT_RE.test(desc)) continue;
      raw.push({ term, def: desc, defQid: q.id, source: "point-pair" });
    }
  }
}

// --- 4. 表記ゆれの正規化と統合 ----------------------------------------------
// normalizeTermQuery(NFKC+小文字+ひらがな→カタカナ)に加え、頻出のカタカナ
// 表記ゆれ(ディジタル/デジタル、インターフェース/インタフェース等)を寄せる
function canonicalKey(term: string): string {
  return normalizeTermQuery(term)
    .replace(/ヴァ/g, "バ").replace(/ヴィ/g, "ビ").replace(/ヴェ/g, "ベ")
    .replace(/ヴォ/g, "ボ").replace(/ヴ/g, "ブ")
    .replace(/ディジタル/g, "デジタル")
    .replace(/インターフェース|インターフェイス|インタフェイス/g, "インタフェース")
    .replace(/ウォーター/g, "ウォータ")
    .replace(/ー+$/, "") // 語末長音(サーバー/サーバ等)
    .replace(/[\s・]/g, "");
}

const PRIORITY: Record<CardSource, number> = { "text-def": 3, "choice-def": 2, "point-pair": 1 };

interface Merged {
  best: RawCard;
  aliases: Set<string>;
  qids: Set<string>;
}
const byKey = new Map<string, Merged>();
for (const rc of raw) {
  const { term, alias } = splitParen(rc.term);
  const key = canonicalKey(term);
  if (!key) continue;
  const entry = byKey.get(key);
  if (!entry) {
    byKey.set(key, {
      best: { ...rc, term },
      aliases: new Set(alias ? [alias] : []),
      qids: new Set([rc.defQid]),
    });
  } else {
    // def の優先度: text-def > choice-def > point-pair(同順位は先勝ち)
    if (PRIORITY[rc.source] > PRIORITY[entry.best.source]) {
      if (entry.best.term !== term) entry.aliases.add(entry.best.term);
      entry.best = { ...rc, term };
    } else if (term !== entry.best.term) {
      entry.aliases.add(term);
    }
    if (alias) entry.aliases.add(alias);
    entry.qids.add(rc.defQid); // 負けた出典の qid も併合
  }
}

// --- 5. オーバーライド適用と id 付与 -----------------------------------------
interface Override {
  drop?: boolean;
  id?: string;
  term?: string;
  reading?: string;
  aliases?: string[];
  fact?: boolean;
}
const overridesPath = path.join(root, "scripts/term-overrides.json");
const overrides: Record<string, Override> = existsSync(overridesPath)
  ? JSON.parse(readFileSync(overridesPath, "utf8"))
  : {};

// slug: 小文字英数とハイフン。日本語(NFKC正規化済み)はそのまま
function slugify(term: string): string {
  return normalizeTermQuery(term)
    .replace(/[^0-9a-zァ-ヶー一-鿿々〆]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const usedIds = new Set<string>();
const cards: TermCard[] = [];
for (const [, entry] of byKey) {
  const q = questionById.get(entry.best.defQid)!;
  const generatedId = slugify(entry.best.term);
  if (!generatedId) continue;
  const ov = overrides[generatedId];
  if (ov?.drop) continue;
  let id = ov?.id ?? generatedId;
  while (usedIds.has(id)) id += "-2"; // slug衝突(表記ゆれ正規化で寄り切らない同名)
  usedIds.add(id);

  const term = ov?.term ?? entry.best.term;
  const aliases = new Set(entry.aliases);
  aliases.delete(entry.best.term);
  aliases.delete(term);
  if (term !== entry.best.term) aliases.add(entry.best.term);
  for (const a of ov?.aliases ?? []) aliases.add(a);

  const card: TermCard = {
    id,
    term,
    ...(ov?.reading ? { reading: ov.reading } : {}),
    ...(aliases.size ? { aliases: [...aliases].sort() } : {}),
    def: entry.best.def,
    defQid: entry.best.defQid,
    source: entry.best.source,
    ...(ov?.fact ? { fact: true } : {}),
    ...(q.point ? { point: q.point } : {}),
    qids: [...entry.qids].sort(),
    middle: q.middle,
    major: q.major,
    ...(entry.best.source === "choice-def" && entry.best.distractors
      ? { distractors: entry.best.distractors }
      : {}),
  };
  cards.push(card);
}
cards.sort((a, b) => (a.id < b.id ? -1 : 1));

// --- 6. 問題→用語の索引(term-index.json) -----------------------------------
const KATAKANA_RE = /[ァ-ヶー]/;
const ASCII_RE = /[0-9a-z]/;

// 出現照合に使うパターン(正規化済みの term/aliases)。誤ヒット対策:
// カタカナ語は3文字以上のみ、英字略語は前後が英数字でない位置のみ(IP≠VoIP)
function matchPatterns(card: TermCard): string[] {
  const out = new Set<string>();
  for (const t of [card.term, ...(card.aliases ?? [])]) {
    const n = normalizeTermQuery(t);
    if (KATAKANA_RE.test(n) && n.replace(/[^ァ-ヶー]/g, "").length === n.length && n.length < 3)
      continue; // 純カタカナ2文字以下
    if (n.length < 2) continue;
    out.add(n);
  }
  return [...out];
}

// 端がカタカナ/英数字のパターンは、その外側に同種の文字が続く位置ではヒットさせない
function occursIn(hay: string, pat: string): boolean {
  let from = 0;
  while (true) {
    const i = hay.indexOf(pat, from);
    if (i < 0) return false;
    const prev = i > 0 ? hay[i - 1] : "";
    const next = i + pat.length < hay.length ? hay[i + pat.length] : "";
    const headOk = KATAKANA_RE.test(pat[0])
      ? !KATAKANA_RE.test(prev)
      : ASCII_RE.test(pat[0])
        ? !ASCII_RE.test(prev)
        : true;
    const tailOk = KATAKANA_RE.test(pat[pat.length - 1])
      ? !KATAKANA_RE.test(next)
      : ASCII_RE.test(pat[pat.length - 1])
        ? !ASCII_RE.test(next)
        : true;
    if (headOk && tailOk) return true;
    from = i + 1;
  }
}

const patternsByCard = new Map(cards.map((c) => [c.id, matchPatterns(c)]));
const hits = new Map<string, string[]>(); // qid → termIds(上限適用前)
const occCount = new Map<string, number>(); // termId → 出現問題数(希少度)
for (const q of questions) {
  const hay = normalizeTermQuery(`${q.text}\n${q.choices.join("\n")}`);
  const found: string[] = [];
  for (const c of cards) {
    if (patternsByCard.get(c.id)!.some((p) => occursIn(hay, p))) found.push(c.id);
  }
  if (found.length) {
    hits.set(q.id, found);
    for (const id of found) occCount.set(id, (occCount.get(id) ?? 0) + 1);
  }
}

const MAX_TERMS_PER_QUESTION = 8;
const index: TermIndex = {};
for (const [qid, ids] of hits) {
  // 上限超過時は出現回数が少ない=希少な語を優先する
  const sorted = [...ids].sort(
    (a, b) => (occCount.get(a)! - occCount.get(b)!) || (a < b ? -1 : 1)
  );
  index[qid] = sorted.slice(0, MAX_TERMS_PER_QUESTION);
}

// カードの qids に索引の逆引きを併合(索引と整合させる)
const qidsByCard = new Map<string, Set<string>>(cards.map((c) => [c.id, new Set(c.qids)]));
for (const [qid, ids] of Object.entries(index)) {
  for (const id of ids) qidsByCard.get(id)!.add(qid);
}
for (const c of cards) c.qids = [...qidsByCard.get(c.id)!].sort();

// --- 7. 書き出しと集計 ------------------------------------------------------
writeFileSync(path.join(root, "src/data/terms.json"), JSON.stringify(cards, null, 1), "utf8");
writeFileSync(path.join(root, "src/data/term-index.json"), JSON.stringify(index, null, 1), "utf8");

const bySource = new Map<string, number>();
for (const c of cards) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
console.log(`カード総数: ${cards.length}`);
for (const [s, n] of bySource) console.log(`  ${s}: ${n}`);
console.log(`索引カバレッジ: ${Object.keys(index).length}/${questions.length}問に1語以上`);
console.log("wrote: src/data/terms.json, src/data/term-index.json");
