import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import DrillPlayer from "../components/DrillPlayer";
import { amQuestion, isCalcQuestion } from "../data";
import type { AmQuestion } from "../data/types";
import { findMockSession, wrongQids, type MockSession } from "../lib/mockHistory";
import { loadState } from "../lib/progress";

/**
 * 模試の解き直し。受験1回で間違えた問題(未解答を含む)を反復学習の形式で出す。
 *
 * 出題する問題は受験詳細と同じく解答履歴から復元する(→ lib/mockHistory)ので、
 * 保存を増やさず、再読込しても同じ問題で始め直せる。
 * 解答は反復学習(drill)として記録する(→ 決定記録「模試の解き直しは反復学習として記録する」)。
 */

/** 解き直しのURL。calcOnly なら間違えた計算問題だけを出す */
export function mockRetryPath(examId: string, at: number, calcOnly = false): string {
  return `/mock/retry/${examId}/${at}${calcOnly ? "?calc=1" : ""}`;
}

/**
 * 解き直しで出す問題(出題順)。ボタンに出す件数と出題画面で同じ集合を使うため共用する。
 * 収録から外れた問題は出せないので除く。
 */
export function mockRetryQuestions(session: MockSession, calcOnly: boolean): AmQuestion[] {
  return wrongQids(session)
    .map((id) => amQuestion(id))
    .filter((q): q is AmQuestion => Boolean(q) && (!calcOnly || isCalcQuestion(q!)));
}

export default function MockRetry() {
  const { examId, at } = useParams<{ examId: string; at: string }>();
  const [params] = useSearchParams();
  const calcOnly = params.get("calc") === "1";
  const { found, questions } = useMemo(() => {
    const session =
      examId && at ? findMockSession(loadState().attempts, examId, Number(at)) : null;
    return {
      found: Boolean(session),
      questions: session ? mockRetryQuestions(session, calcOnly) : [],
    };
  }, [examId, at, calcOnly]);

  return (
    <DrillPlayer
      questions={questions}
      title="模試の解き直し"
      emptyMessage={
        !found
          ? "この受験記録は見つかりませんでした。端末間の同期やデータの読み込みで、記録の区切りが変わった可能性があります。"
          : calcOnly
            ? "この模試で間違えた計算問題はありません。"
            : "この模試で間違えた問題はありません。"
      }
      retryLink={{ to: `/mock/result/${examId}/${at}`, label: "模試の結果に戻る" }}
    />
  );
}
