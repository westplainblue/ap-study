import { useMemo } from "react";
import DrillPlayer from "../components/DrillPlayer";
import { amQuestion, questionsByMiddle } from "../data";
import type { AmQuestion } from "../data/types";
import { loadState } from "../lib/progress";

interface Config {
  pool: "wrong" | "middle";
  middles: string[];
  count: number; // 0 = 全部
  excludeCalc?: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DrillRun() {
  const config: Config = useMemo(
    () =>
      JSON.parse(
        sessionStorage.getItem("ap-drill") ??
          '{"pool":"wrong","middles":[],"count":20}'
      ),
    []
  );

  const questions = useMemo(() => {
    let pool: AmQuestion[];
    if (config.pool === "wrong") {
      // 間隔反復キューに入っている(=間違えてまだ卒業していない)問題を期日無視で全部
      pool = Object.keys(loadState().review)
        .map((id) => amQuestion(id))
        .filter((q): q is AmQuestion => Boolean(q));
    } else {
      pool = questionsByMiddle(config.middles, { excludeCalc: config.excludeCalc });
    }
    const shuffled = shuffle(pool);
    return config.count > 0 ? shuffled.slice(0, config.count) : shuffled;
  }, [config]);

  const emptyMessage =
    config.pool === "wrong"
      ? "まだ間違えた問題がありません。演習や模試で間違えると、ここに反復候補として溜まります。"
      : "選択した分野の問題が見つかりませんでした。";

  return (
    <DrillPlayer questions={questions} title="反復学習" emptyMessage={emptyMessage} />
  );
}
