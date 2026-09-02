import { useMemo } from "react";
import Player from "../components/Player";
import { amQuestion } from "../data";
import type { AmQuestion } from "../data/types";
import { resumeQuestions } from "../lib/run";

interface Config {
  /** 出題する問題ID(一覧画面が回数順に選んだもの)。この順のまま出題する */
  ids: string[];
}

export default function FrequentRun() {
  const questions = useMemo(() => {
    // 中断した出題があれば、同じ問題セットのまま再開する
    const resumed = resumeQuestions("frequent");
    if (resumed) return resumed;
    const config: Config = JSON.parse(sessionStorage.getItem("ap-frequent") ?? '{"ids":[]}');
    return (config.ids ?? [])
      .map((id) => amQuestion(id))
      .filter((q): q is AmQuestion => Boolean(q));
  }, []);

  // 解答は分野別演習と同じ practice として記録する(初見の実力を測る出題であり、
  // 頻出かどうかは問題の属性であってモードの違いではない)
  return (
    <Player
      questions={questions}
      mode="practice"
      title="頻出問題"
      storageKey="frequent"
      emptyMessage="出題する頻出問題がありません。一覧から選び直してください。"
      retryLink={{ to: "/frequent", label: "頻出問題の一覧へ戻る" }}
    />
  );
}
