import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { EXAMS } from "../data";
import { MAJOR_LABEL, type Major } from "../data/types";
import { recordAnswersBatch } from "../lib/progress";
import { MOCK_KEY, type MockState } from "./MockExam";

const PASS_RATE = 0.6;

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function MockRun() {
  const navigate = useNavigate();
  const [mock, setMock] = useState<MockState | null>(() => {
    const raw = localStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as MockState) : null;
  });
  const [idx, setIdx] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [graded, setGraded] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  const exam = useMemo(
    () => EXAMS.find((e) => e.examId === mock?.examId),
    [mock?.examId]
  );

  useEffect(() => {
    if (graded) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [graded]);

  if (!mock || !exam) {
    return (
      <div>
        <div className="card">
          <p>進行中の模試がありません。</p>
          <Link to="/mock" className="btn btn-block" style={{ marginTop: 12 }}>
            模試モードへ
          </Link>
        </div>
      </div>
    );
  }

  const questions = exam.am;
  const remaining = Math.max(0, Math.floor((mock.deadline - now) / 1000));
  const timeUp = remaining <= 0;
  const answeredCount = mock.answers.filter((a) => a !== null).length;

  const grade = () => {
    const res = questions.map((q, i) => mock.answers[i] === q.answer);
    recordAnswersBatch(
      questions.map((q, i) => ({ qid: q.id, ok: res[i], mode: "mock" as const }))
    );
    localStorage.removeItem(MOCK_KEY);
    setResults(res);
    setGraded(true);
  };

  if (graded) {
    const correct = results.filter(Boolean).length;
    const rate = Math.round((correct / questions.length) * 100);
    const pass = correct >= Math.ceil(questions.length * PASS_RATE);
    const majorAgg = new Map<Major, { n: number; ok: number }>();
    questions.forEach((q, i) => {
      const m = majorAgg.get(q.major) ?? { n: 0, ok: 0 };
      m.n += 1;
      if (results[i]) m.ok += 1;
      majorAgg.set(q.major, m);
    });
    const wrong = questions.filter((_, i) => !results[i]);
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>模試の結果</h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 34, fontWeight: 700 }}>
            {correct} / {questions.length}
          </p>
          <p className="muted" style={{ marginBottom: 8 }}>
            正答率 {rate}%
          </p>
          <span
            className="chip"
            style={
              pass
                ? { background: "var(--success-bg)", color: "var(--success-text)" }
                : { background: "var(--danger-bg)", color: "var(--danger-text)" }
            }
          >
            {pass ? "合格ライン(60%)クリア!" : "合格ラインまであと少し"}
          </span>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>大分類別</p>
          {[...majorAgg.entries()].map(([major, agg]) => (
            <div
              key={major}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                padding: "3px 0",
              }}
            >
              <span>{MAJOR_LABEL[major]}</span>
              <span className="muted">
                {agg.ok}/{agg.n}({Math.round((agg.ok / agg.n) * 100)}%)
              </span>
            </div>
          ))}
        </div>

        {wrong.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>
              間違えた問題({wrong.length}問・復習キューに登録済み)
            </p>
            {wrong.map((q) => (
              <details key={q.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                <summary style={{ cursor: "pointer", fontSize: 14 }}>
                  問{q.number} {q.middle}
                </summary>
                <p className="small" style={{ whiteSpace: "pre-wrap", margin: "8px 0 4px" }}>
                  {q.text}
                </p>
                <p className="small" style={{ fontWeight: 600 }}>
                  正解: {["ア", "イ", "ウ", "エ"][q.answer]}
                </p>
                <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>
                  {q.explanation}
                </p>
              </details>
            ))}
          </div>
        )}

        <Link to="/" className="btn btn-primary btn-block">
          ホームへ戻る
        </Link>
      </div>
    );
  }

  const q = questions[idx];

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
        <span
          style={{
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: remaining < 600 ? "var(--danger-text)" : "var(--text)",
          }}
        >
          ⏱ {formatTime(remaining)}
        </span>
        <button className="chip-toggle" onClick={() => setShowGrid((v) => !v)}>
          {idx + 1} / {questions.length}(解答済 {answeredCount})
        </button>
      </div>

      {timeUp && (
        <div className="banner banner-ng" style={{ marginBottom: 10 }}>
          時間切れです。「採点する」を押してください。
        </div>
      )}

      {showGrid && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gap: 4,
            marginBottom: 12,
          }}
        >
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setIdx(i);
                setShowGrid(false);
              }}
              style={{
                padding: "4px 0",
                fontSize: 11,
                borderRadius: 6,
                border:
                  i === idx
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--border)",
                background:
                  mock.answers[i] !== null ? "var(--accent-bg)" : "var(--surface)",
                color: mock.answers[i] !== null ? "var(--accent-text)" : "var(--text-2)",
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <QuestionCard
        question={q}
        selected={mock.answers[idx]}
        answered={timeUp}
        revealAnswer={false}
        onSelect={(i) => {
          if (timeUp) return;
          const next: MockState = {
            ...mock,
            answers: mock.answers.map((a, j) => (j === idx ? i : a)),
          };
          setMock(next);
          localStorage.setItem(MOCK_KEY, JSON.stringify(next));
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          className="btn"
          disabled={idx === 0}
          onClick={() => setIdx(idx - 1)}
          style={{ flex: 1 }}
        >
          前へ
        </button>
        <button
          className="btn"
          disabled={idx + 1 >= questions.length}
          onClick={() => setIdx(idx + 1)}
          style={{ flex: 1 }}
        >
          次へ
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            const unanswered = questions.length - answeredCount;
            if (
              unanswered === 0 ||
              window.confirm(`未解答が${unanswered}問あります。採点しますか?`)
            ) {
              grade();
            }
          }}
        >
          採点する
        </button>
      </div>
      <button
        className="btn btn-block"
        style={{ marginTop: 8 }}
        onClick={() => navigate("/mock")}
      >
        中断する(進行状況は保存されます)
      </button>
    </div>
  );
}
