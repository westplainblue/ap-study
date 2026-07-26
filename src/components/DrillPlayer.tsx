import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KANA, sourceOf } from "../data";
import type { AmQuestion } from "../data/types";
import { setAiContext } from "../lib/aiContext";
import { refreshAfterAnswer } from "../lib/achievements";
import { recordAnswer } from "../lib/progress";
import { IconCheck, IconRefresh, IconX } from "./Icons";
import QuestionCard from "./QuestionCard";

interface Props {
  questions: AmQuestion[];
  title: string;
  emptyMessage?: string;
}

/**
 * 反復学習プレイヤー: 「正解するまで繰り返す」ドリル。
 * 間違えた問題はセッション末尾に再投入し、全問正解できるまでループする。
 * 履歴に残すのは各問題の初回解答のみ(以降の反復は記録せず、統計や
 * 間隔反復(Leitner)のスケジュールを乱さない)。
 */
export default function DrillPlayer({ questions, title, emptyMessage }: Props) {
  const total = questions.length;
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  // 作業キュー(未マスターの問題ID)。正解で先頭を除去、誤答で末尾へ回す。
  const [queue, setQueue] = useState<string[]>(() => questions.map((q) => q.id));
  const [selected, setSelected] = useState<number | null>(null);
  const [recorded, setRecorded] = useState<Set<string>>(() => new Set());
  const [answers, setAnswers] = useState(0); // 延べ解答数
  const [firstTryOk, setFirstTryOk] = useState(0); // 初回で正解した問題数

  const currentId = queue[0];
  const q = currentId ? byId.get(currentId) : undefined;
  const finished = total > 0 && queue.length === 0;
  const mastered = total - queue.length;

  // 現在の問題をAIチャットに共有する
  useEffect(() => {
    if (finished || !q) {
      setAiContext(null);
      return;
    }
    const lines = [
      "【ユーザーが現在取り組んでいる問題(反復学習)】",
      `出典: ${sourceOf(q)}(分野: ${q.middle})`,
      `問題文: ${q.text}`,
      ...q.choices.map((c, i) => `${KANA[i]}: ${c}`),
    ];
    if (q.figure) {
      lines.push("※この問題には図表が含まれますが、図はテキスト共有できていません。");
    }
    if (selected !== null) {
      lines.push(
        `正解: ${KANA[q.answer]}`,
        `ユーザーの解答: ${KANA[selected]}(${selected === q.answer ? "正解" : "不正解"})`,
        `解説: ${q.explanation}`
      );
    } else {
      lines.push(
        "ユーザーはまだ解答中です。正答の記号を直接明かさず、考え方のヒントを中心に支援してください。"
      );
    }
    setAiContext({ label: sourceOf(q), text: lines.join("\n") });
  }, [q, selected, finished]);

  useEffect(() => () => setAiContext(null), []);

  if (total === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h1>
        <div className="card">
          <p>{emptyMessage ?? "出題できる問題がありません。"}</p>
          <Link to="/" className="btn btn-block" style={{ marginTop: 12 }}>
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>反復完了</h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
            🎉 全 {total} 問マスター!
          </p>
          <p className="muted">
            正解するまで繰り返し、すべてクリアしました。おつかれさま!
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              marginTop: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {firstTryOk} / {total}
              </div>
              <div className="muted small">一発正解</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{answers}</div>
              <div className="muted small">延べ解答数</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/drill" className="btn btn-primary btn-block">
            もう一度
          </Link>
          <Link to="/" className="btn btn-block">
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!q) return null;

  const answered = selected !== null;
  const correct = answered && selected === q.answer;

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    const ok = i === q.answer;
    setAnswers((n) => n + 1);
    // 初回の解答だけ履歴に記録する(反復ぶんは記録しない)
    if (!recorded.has(q.id)) {
      recordAnswer(q.id, ok, "practice");
      refreshAfterAnswer();
      setRecorded((s) => new Set(s).add(q.id));
      if (ok) setFirstTryOk((n) => n + 1);
    }
  };

  const handleNext = () => {
    // 正解: 先頭を除去してマスター / 誤答: 末尾へ回してあとで再挑戦
    setQueue(([head, ...rest]) => (correct ? rest : [...rest, head]));
    setSelected(null);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          paddingRight: 48,
        }}
      >
        <span className="chip">{q.middle}</span>
        <span className="muted small">
          マスター {mastered} / {total}
        </span>
      </div>
      <div className="progress-track" style={{ marginBottom: 6 }}>
        <div
          className="progress-fill"
          style={{ width: `${(mastered / total) * 100}%` }}
        />
      </div>
      <p className="muted small" style={{ marginBottom: 14 }}>
        <IconRefresh size={13} /> 残り {queue.length} 問。間違えた問題はあとでもう一度出ます。
      </p>

      <QuestionCard
        question={q}
        selected={selected}
        answered={answered}
        onSelect={handleSelect}
      />

      {answered && (
        <div style={{ marginTop: 14 }}>
          <div className={correct ? "banner banner-ok" : "banner banner-ng"}>
            {correct ? <IconCheck size={18} /> : <IconX size={18} />}
            <span>
              {correct
                ? "正解! マスターしました。"
                : `不正解… 答えは「${KANA[q.answer]}」。あとでもう一度出ます。`}
            </span>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>解説</p>
            <p className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
              {q.explanation}
            </p>
            {q.point && (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: 10,
                }}
              >
                <p className="small" style={{ fontWeight: 600 }}>💡 初学者ポイント</p>
                <p className="small" style={{ lineHeight: 1.7 }}>{q.point}</p>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={handleNext}
          >
            {queue.length === 1 && correct ? "完了する" : "次の問題へ"}
          </button>
        </div>
      )}
    </div>
  );
}
