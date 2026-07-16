import { useNavigate } from "react-router-dom";
import { EXAMS } from "../data";

export const MOCK_KEY = "ap-study:mock";
export const MOCK_MINUTES = 150;

export interface MockState {
  examId: string;
  answers: (number | null)[];
  deadline: number; // epoch ms
}

export default function MockExam() {
  const navigate = useNavigate();
  const saved = localStorage.getItem(MOCK_KEY);
  const savedState: MockState | null = saved ? JSON.parse(saved) : null;

  const start = (examId: string) => {
    const exam = EXAMS.find((e) => e.examId === examId)!;
    const state: MockState = {
      examId,
      answers: Array(exam.am.length).fill(null),
      deadline: Date.now() + MOCK_MINUTES * 60 * 1000,
    };
    localStorage.setItem(MOCK_KEY, JSON.stringify(state));
    navigate("/mock/run");
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>模試モード</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        本番同様、80問を150分で解きます。合格ラインは60%(48問)です。
      </p>

      {savedState && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent)" }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>中断中の模試があります</p>
          <p className="muted small" style={{ marginBottom: 10 }}>
            解答済み: {savedState.answers.filter((a) => a !== null).length} /{" "}
            {savedState.answers.length}問
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => navigate("/mock/run")}
            >
              再開する
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => {
                if (window.confirm("中断中の模試を破棄しますか?")) {
                  localStorage.removeItem(MOCK_KEY);
                  navigate(0);
                }
              }}
            >
              破棄する
            </button>
          </div>
        </div>
      )}

      {EXAMS.map((exam) => (
        <div key={exam.examId} className="card" style={{ marginBottom: 10 }}>
          <p style={{ fontWeight: 600 }}>{exam.label} 午前</p>
          <p className="muted small" style={{ marginBottom: 10 }}>
            {exam.am.length}問 / {MOCK_MINUTES}分
          </p>
          <button className="btn btn-primary btn-block" onClick={() => start(exam.examId)}>
            この回で模試を始める
          </button>
        </div>
      ))}
    </div>
  );
}
