/**
 * キーボードでの解答操作のキー割り当て(純粋関数)。
 * 実際のイベント購読は hooks/useAnswerKeys.ts。
 */

/**
 * キー入力を選択肢の**表示位置**(0始まり)に変換する。該当しなければ -1。
 *
 * 数字(1〜9)とアルファベット(A〜)の両方を受けるのは、テンキー派と
 * ホームポジション派のどちらでも手を動かさずに解答できるようにするため。
 * 表示位置を返すのは、選択肢シャッフル時に画面の「ア」を押したときと
 * 同じ挙動にするため(元の添字への変換は呼び出し側が order で行う)。
 */
export function choiceIndexFromKey(key: string, count: number): number {
  if (count <= 0) return -1;
  if (/^[1-9]$/.test(key)) {
    const i = Number(key) - 1;
    return i < count ? i : -1;
  }
  if (/^[a-zA-Z]$/.test(key)) {
    const i = key.toLowerCase().charCodeAt(0) - 97; // a=0
    return i < count ? i : -1;
  }
  return -1;
}

/**
 * そのキーイベントを解答操作として扱ってよいか。
 * 修飾キー付き(ブラウザや OS のショートカット)と、文字入力中は横取りしない。
 */
export function isPlainKey(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** 入力欄(AIチャット等)にフォーカスがある間はキーを奪わない */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}
