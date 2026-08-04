import { useEffect } from "react";
import { choiceIndexFromKey, isPlainKey, isTypingTarget } from "../lib/keys";

interface Options {
  /** 有効にするか(結果画面や未出題時は false) */
  enabled: boolean;
  /** 選択肢の数。範囲外のキーは無視する */
  choiceCount: number;
  /** 選択肢を選ぶ。引数は**表示位置**(画面のア=0) */
  onPick: (displayIndex: number) => void;
  /** Enter / Space: 次の問題へ(解答後のみ渡す) */
  onNext?: () => void;
  /** R: あとで復習に登録(対応する画面のみ) */
  onReview?: () => void;
}

/**
 * 演習画面のキーボード操作。PCで手をマウスに移さず解き進められるようにする。
 *
 * - 1〜9 / A〜: 選択肢を選ぶ(表示位置。シャッフル時も画面の並び通り)
 * - Enter / Space: 次の問題へ
 * - R: あとで復習
 *
 * AIチャットなどの入力欄にフォーカスがある間と、修飾キー付きの入力は
 * ブラウザ・OSのショートカットを壊さないよう素通しする。
 */
export function useAnswerKeys({
  enabled,
  choiceCount,
  onPick,
  onNext,
  onReview,
}: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(document.activeElement)) return;
      if (e.key === "Enter" || e.key === " ") {
        if (!onNext) return;
        e.preventDefault(); // Space でのページスクロールを抑止
        onNext();
        return;
      }
      if ((e.key === "r" || e.key === "R") && onReview) {
        e.preventDefault();
        onReview();
        return;
      }
      const i = choiceIndexFromKey(e.key, choiceCount);
      if (i >= 0) {
        e.preventDefault();
        onPick(i);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, choiceCount, onPick, onNext, onReview]);
}
