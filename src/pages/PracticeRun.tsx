import { useMemo } from "react";
import Player from "../components/Player";
import { questionsByMiddle } from "../data";
import { statsByQuestion } from "../lib/progress";

interface Config {
  middles: string[];
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

export default function PracticeRun() {
  const questions = useMemo(() => {
    const config: Config = JSON.parse(
      sessionStorage.getItem("ap-practice") ?? '{"middles":[],"count":10}'
    );
    const stats = statsByQuestion();
    // 解答回数が少ない問題を優先しつつ、同回数内はシャッフル
    return shuffle(questionsByMiddle(config.middles))
      .sort((a, b) => (stats.get(a.id)?.n ?? 0) - (stats.get(b.id)?.n ?? 0))
      .slice(0, config.count);
  }, []);

  return (
    <Player
      questions={questions}
      mode="practice"
      title="分野別演習"
      emptyMessage="選択した分野の問題がまだ収録されていません。"
    />
  );
}
