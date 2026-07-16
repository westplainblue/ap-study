import { useState } from "react";
import { Link } from "react-router-dom";
import type { AmQuestion } from "../data/types";
import { addToReview, isInReview, recordAnswer, type Mode } from "../lib/progress";
import { IconCheck, IconStar, IconX } from "./Icons";
import QuestionCard from "./QuestionCard";

interface Props {
  questions: AmQuestion[];
  mode: Extract<Mode, "practice" | "review">;
  title: string;
  emptyMessage?: string;
}

/** 1問ごと即時フィードバック型の演習プレイヤー(分野別演習・復習で共用) */
export default function Player({ questions, mode, title, emptyMessage }: Props) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);
  const [reviewAdded, setReviewAdded] = useState(false);

  if (questions.length === 0) {
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
    const correct = results.filter(Boolean).length;
    const rate = Math.round((correct / results.length) * 100);
    const wrong = questions.filter((_, i) => !results[i]);
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>結果</h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 32, fontWeight: 700 }}>
            {correct} / {results.length} 問正解
          </p>
          <p className="muted">正答率 {rate}%</p>
        </div>
        {wrong.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>
              間違えた問題(復習キューに登録済み)
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {wrong.map((q) => (
                <li key={q.id} className="small">
                  問{q.number} {q.middle}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "practice" && (
            <Link to="/practice" className="btn btn-primary btn-block">
              分野を選んでもう一度
            </Link>
          )}
          <Link to="/" className="btn btn-block">
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const answered = selected !== null;
  const correct = answered && selected === q.answer;

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    const ok = i === q.answer;
    setResults((r) => [...r, ok]);
    recordAnswer(q.id, ok, mode);
  };

  const handleNext = () => {
    if (idx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setSelected(null);
      setReviewAdded(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span className="chip">{q.middle}</span>
        <span className="muted small">
          {idx + 1} / {questions.length} 問
        </span>
      </div>
      <div className="progress-track" style={{ marginBottom: 14 }}>
        <div
          className="progress-fill"
          style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

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
              {correct ? "正解!" : "不正解…"} 答えは「
              {["ア", "イ", "ウ", "エ"][q.answer]}」
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
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={reviewAdded || isInReview(q.id)}
              onClick={() => {
                addToReview(q.id);
                setReviewAdded(true);
              }}
            >
              <IconStar size={16} />
              {reviewAdded || isInReview(q.id) ? "復習に登録済み" : "あとで復習"}
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleNext}>
              {idx + 1 >= questions.length ? "結果を見る" : "次の問題へ"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
