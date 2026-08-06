import { useMemo } from "react";
import Player from "../components/Player";
import { amQuestion, questionsByMiddle } from "../data";
import type { AmQuestion } from "../data/types";
import { statsByQuestion } from "../lib/progress";
import { resumeQuestions } from "../lib/run";

interface Config {
  middles: string[];
  count: number;
  excludeCalc?: boolean;
  examIds?: string[]; // 出題する試験回(未指定なら全回)
  /** まだ一度も解答していない問題だけに絞る(モード不問の全履歴で判定) */
  unseenOnly?: boolean;
  /** 問題IDの直接指定(用語ノートの解き直し用)。指定時は他の条件を無視する */
  ids?: string[];
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
  const { questions, unseenOnly } = useMemo(() => {
    // 中断した演習があれば、同じ問題セットのまま再開する
    const resumed = resumeQuestions("practice");
    if (resumed) return { questions: resumed, unseenOnly: false };
    const config: Config = JSON.parse(
      sessionStorage.getItem("ap-practice") ?? '{"middles":[],"count":10}'
    );
    // ID直接指定は解決した問題をその順で出題する(件数・シャッフル等は適用しない)
    if (config.ids?.length) {
      return {
        questions: config.ids
          .map((id) => amQuestion(id))
          .filter((q): q is AmQuestion => Boolean(q)),
        unseenOnly: false,
      };
    }
    const stats = statsByQuestion();
    // 解答回数が少ない問題を優先しつつ、同回数内はシャッフル
    const questions = shuffle(
      questionsByMiddle(config.middles, {
        excludeCalc: config.excludeCalc,
        examIds: config.examIds,
        excludeIds: config.unseenOnly ? new Set(stats.keys()) : undefined,
      })
    )
      .sort((a, b) => (stats.get(a.id)?.n ?? 0) - (stats.get(b.id)?.n ?? 0))
      .slice(0, config.count);
    return { questions, unseenOnly: Boolean(config.unseenOnly) };
  }, []);

  return (
    <Player
      questions={questions}
      mode="practice"
      title="分野別演習"
      emptyMessage={
        unseenOnly
          ? "この条件の問題はすべて解答済みです。分野や試験回の指定を広げてください。"
          : "選択した分野の問題がまだ収録されていません。"
      }
      storageKey="practice"
    />
  );
}
