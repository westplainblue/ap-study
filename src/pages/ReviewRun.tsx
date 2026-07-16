import { useMemo } from "react";
import Player from "../components/Player";
import { amQuestion } from "../data";
import type { AmQuestion } from "../data/types";
import { dueReviewIds } from "../lib/progress";

export default function ReviewRun() {
  const questions = useMemo(
    () =>
      dueReviewIds()
        .map((id) => amQuestion(id))
        .filter((q): q is AmQuestion => Boolean(q)),
    []
  );

  return (
    <Player
      questions={questions}
      mode="review"
      title="今日の復習"
      emptyMessage="今日の復習はありません。よく頑張りました!"
    />
  );
}
