/**
 * 「いま画面で取り組んでいる問題」をAIチャットに共有するための軽量ストア。
 * 演習・模試・午後の各画面が setAiContext で更新し、チャットパネルが購読する。
 */

export interface AiStudyContext {
  /** チャットに表示する短いラベル(例: "令和7年秋 午前 問32") */
  label: string;
  /** システムプロンプトに埋め込む本文 */
  text: string;
}

let current: AiStudyContext | null = null;
const listeners = new Set<() => void>();

export function setAiContext(ctx: AiStudyContext | null): void {
  current = ctx;
  listeners.forEach((fn) => fn());
}

export function getAiContext(): AiStudyContext | null {
  return current;
}

export function subscribeAiContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
