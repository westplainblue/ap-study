/**
 * 用語カード辞書(ことば帳)の型とローダ。
 *
 * カード本体(terms.json)と問題→用語の索引(term-index.json)は
 * scripts/build-terms.ts が既存の試験データから機械生成してコミットする。
 * 定義文はすべて過去問からの逐語切り出しで、新規執筆はしない
 * (tests/terms.test.mjs が出典との部分文字列一致を強制する)。
 *
 * 初期バンドルを肥大させないよう dynamic import で読み込む。
 */

export type CardSource = "choice-def" | "text-def" | "point-pair";

export interface TermCard {
  id: string;
  term: string;
  /** かな読み(五十音ソート・検索用。キュレーションで追記) */
  reading?: string;
  /** 表記ゆれ(検索用) */
  aliases?: string[];
  /** 定義 = 過去問からの逐語切り出し */
  def: string;
  /** 定義の出典問題ID */
  defQid: string;
  source: CardSource;
  /** 一般定義ではなく出題固有の事実(表示でバッジ区別) */
  fact?: boolean;
  /** 出典問題のpoint由来「覚え方」 */
  point?: string;
  /** この用語が登場する問題ID(索引と整合) */
  qids: string[];
  middle: string;
  major: "T" | "M" | "S";
  /** choice-def由来: 元問題の誤答選択肢(高品質な4択ディストラクタ) */
  distractors?: string[];
}

/** 問題ID → その問題に登場する用語ID */
export type TermIndex = Record<string, string[]>;

export interface TermsData {
  cards: TermCard[];
  byId: Map<string, TermCard>;
  index: TermIndex;
}

let cache: TermsData | null = null;

export async function loadTermsData(): Promise<TermsData> {
  if (cache) return cache;
  const [cardsMod, indexMod] = await Promise.all([
    import("./terms.json"),
    import("./term-index.json"),
  ]);
  const cards = (cardsMod.default ?? []) as TermCard[];
  const index = (indexMod.default ?? {}) as TermIndex;
  cache = { cards, byId: new Map(cards.map((c) => [c.id, c])), index };
  return cache;
}

/** 読み込み済みならキャッシュを返す(未ロード時はnull。呼び出し側はスキップ可) */
export function termsDataSync(): TermsData | null {
  return cache;
}

/** テスト用: キャッシュに依存しない注入 */
export function __setTermsDataForTest(data: TermsData | null): void {
  cache = data;
}

/** 検索用正規化: NFKC(全半角統一)+小文字化+ひらがな→カタカナ */
export function normalizeTermQuery(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
