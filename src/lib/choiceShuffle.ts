/**
 * 選択肢シャッフル(毎回ランダムな並びで出題し、位置で答えを覚えるのを防ぐ)。
 *
 * 方式: 表示位置で記号を振り直す(表示1番目=ア、2番目=イ…)。
 * 解説・ポイント内の「正解はイ」「ア・ウは誤り」等の記号参照は、表示時に
 * remapKanaLabels で同時変換する。全640問の監査で、単独カタカナ(前後が
 * カタカナでないア/イ/ウ/エ)の出現1,717件はすべて選択肢記号の参照である
 * ことを確認済み(カタカナ語の一部は前後判定で除外される)。
 * 「ア〜エ」のような範囲参照だけは文字単位の変換では壊れるため、
 * そのような問題はシャッフル対象外とする(data/index.ts の canShuffleChoices)。
 *
 * このモジュールは純関数のみ(データ・ブラウザAPI非依存)で、node --test で
 * 直接ユニットテストできる。
 */

const KANA4 = ["ア", "イ", "ウ", "エ"];

// カタカナ(小書き・長音符含む)。この文字が前後に付く場合はカタカナ語の一部。
// Safari 16.3以前は正規表現の後読みに未対応のため、前1文字をキャプチャして判定する。
const ADJ = "[ァ-ヺー]";
const KANA_TOKEN = new RegExp(`(${ADJ})?([アイウエ])(?!${ADJ})`, "g");

/** 0..n-1 のランダムな置換を返す(Fisher–Yates)。displayed[d] = choices[perm[d]] */
export function newChoicePerm(n = 4): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 元の添字 o の選択肢が表示されている位置(=表示上の記号の添字)を返す */
export function displayedIndex(perm: number[], originalIdx: number): number {
  const d = perm.indexOf(originalIdx);
  return d >= 0 ? d : originalIdx;
}

/**
 * 文中の選択肢記号(単独のア/イ/ウ/エ)を、表示上の記号へ同時変換する。
 * カタカナ語の一部(アプリ、ウイルス等)は前後判定により変換されない。
 */
export function remapKanaLabels(text: string, perm: number[]): string {
  return text.replace(KANA_TOKEN, (m, prev: string | undefined, kana: string) => {
    if (prev) return m; // 前がカタカナ → 語の一部なのでそのまま
    const o = KANA4.indexOf(kana);
    return KANA4[displayedIndex(perm, o)];
  });
}

/** 保存データ由来の表示順が n 択の置換として妥当か(再開時の復元チェック) */
export function isValidPerm(v: unknown, n: number): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === n &&
    [...v].sort((a, b) => a - b).every((x, i) => x === i)
  );
}

/** 単独カタカナ(記号参照)を含むかどうか(シャッフル可否判定に使う) */
export function hasStandaloneKana(text: string): boolean {
  for (const m of text.matchAll(KANA_TOKEN)) {
    if (!m[1]) return true;
  }
  return false;
}
