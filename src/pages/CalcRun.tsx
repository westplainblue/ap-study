import { useMemo } from "react";
import CalcPlayer from "../components/CalcPlayer";
import { calcPool, calcThemeOf, CALC_THEMES } from "../lib/calc";
import { statsByQuestion } from "../lib/progress";
import type { CalcMix } from "./CalcSetup";

interface Config {
  themes: string[]; // 出題テーマ(空なら全テーマ)
  mix: CalcMix;
  count: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CalcRun() {
  const questions = useMemo(() => {
    const config: Config = JSON.parse(
      sessionStorage.getItem("ap-calc") ?? '{"themes":[],"mix":"focus","count":10}'
    );
    const stats = statsByQuestion();
    // 解答回数が少ない問題を優先しつつ、同回数内はシャッフル(分野別演習と同じ)
    const picked = shuffle(calcPool(config.themes))
      .sort((a, b) => (stats.get(a.id)?.n ?? 0) - (stats.get(b.id)?.n ?? 0))
      .slice(0, config.count);
    if (config.mix === "shuffle") return picked;
    // テーマ集中: 同じテーマ(公式)が連続するよう定義順に並べ替える(ブロック練習)
    const orderOf = new Map(CALC_THEMES.map((t, i) => [t.id, i]));
    return [...picked].sort(
      (a, b) =>
        (orderOf.get(calcThemeOf(a.id)?.id ?? "") ?? 99) -
        (orderOf.get(calcThemeOf(b.id)?.id ?? "") ?? 99)
    );
  }, []);

  return (
    <CalcPlayer
      questions={questions}
      emptyMessage="選択したテーマの問題がまだ収録されていません。"
    />
  );
}
