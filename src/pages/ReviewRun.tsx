import { useMemo } from "react";
import Player from "../components/Player";
import { amQuestion } from "../data";
import type { AmQuestion } from "../data/types";
import { dueReviewIds } from "../lib/progress";
import { resumeQuestions } from "../lib/run";

export default function ReviewRun() {
  const questions = useMemo(() => {
    // 中断した復習があれば、同じ問題セットのまま再開する
    const resumed = resumeQuestions("review");
    if (resumed) return resumed;
    return dueReviewIds()
      .map((id) => amQuestion(id))
      .filter((q): q is AmQuestion => Boolean(q));
  }, []);

  return (
    <Player
      questions={questions}
      mode="review"
      title="今日の復習"
      emptyMessage="今日の復習はありません。よく頑張りました!"
      storageKey="review"
    />
  );
}
