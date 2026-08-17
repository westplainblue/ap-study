import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import { EXAMS, amQuestion, examLabel } from "../data";
import { MAJOR_LABEL, type Major } from "../data/types";
import { aggByGroup, isPass, mockSessions, rateOf } from "../lib/mockHistory";
import { loadState } from "../lib/progress";

export const MOCK_KEY = "ap-study:mock";
export const MOCK_MINUTES = 150;

export interface MockState {
  examId: string;
  answers: (number | null)[];
  deadline: number; // epoch ms
  /**
   * 「あとで見直す」を付けた問題の番号(0始まり)。
   * 途中から追加したフィールドなので、古い中断データには存在しない(undefined許容)。
   */
  flags?: number[];
}

/** 履歴の日時表記(例: 2026/08/12 09:30)。同じ日に受けた回も見分けられるようにする */
export function formatWhen(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function MockExam() {
  const navigate = useNavigate();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // 中断中の模試を上書きして始める前の確認対象(examId)。null=確認不要
  const [pendingExam, setPendingExam] = useState<string | null>(null);
  // 壊れた中断データ(書き込み中断・拡張機能による破損など)で JSON.parse が
  // throw すると、ErrorBoundary が無いためこの画面ごと白画面になり、破棄操作にも
  // たどり着けなくなる。読み取りをガードし、壊れていれば除去して無視する。
  const savedState: MockState | null = (() => {
    try {
      const raw = localStorage.getItem(MOCK_KEY);
      return raw ? (JSON.parse(raw) as MockState) : null;
    } catch {
      localStorage.removeItem(MOCK_KEY);
      return null;
    }
  })();
  // 受験結果は別に保存せず、解答履歴から復元する(→ lib/mockHistory)
  const history = useMemo(() => mockSessions(loadState().attempts), []);

  const beginExam = (examId: string) => {
    const exam = EXAMS.find((e) => e.examId === examId)!;
    const state: MockState = {
      examId,
      answers: Array(exam.am.length).fill(null),
      deadline: Date.now() + MOCK_MINUTES * 60 * 1000,
    };
    localStorage.setItem(MOCK_KEY, JSON.stringify(state));
    navigate("/mock/run");
  };

  const start = (examId: string) => {
    // 中断中の模試があるのに無確認で上書きすると、最大80問の解答・見直しフラグ・
    // 残り時間が一瞬で消える。破棄フローと同様に確認ダイアログを挟む。
    if (savedState) {
      setPendingExam(examId);
      return;
    }
    beginExam(examId);
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
              onClick={() => setConfirmDiscard(true)}
            >
              破棄する
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            これまでの模試({history.length}回)
          </p>
          {history.map((s) => {
            const pass = isPass(s.correct, s.total);
            return (
              <details
                key={`${s.examId}-${s.at}`}
                style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}
              >
                <summary style={{ cursor: "pointer", fontSize: 14 }}>
                  {examLabel(s.examId)} 午前{" "}
                  <span className="muted small">{formatWhen(s.at)}</span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {s.correct} / {s.total}
                    </span>
                    <span className="muted small">
                      正答率 {rateOf(s.correct, s.total)}%
                    </span>
                    <span
                      className="chip"
                      style={
                        pass
                          ? { background: "var(--success-bg)", color: "var(--success-text)" }
                          : { background: "var(--danger-bg)", color: "var(--danger-text)" }
                      }
                    >
                      {pass ? "合格ラインクリア" : "合格ライン未満"}
                    </span>
                  </span>
                </summary>
                <div style={{ marginTop: 6 }}>
                  {[...aggByGroup(s, (q) => amQuestion(q)?.major).entries()].map(
                    ([major, agg]) => (
                      <div
                        key={major}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          padding: "2px 0",
                        }}
                      >
                        <span className="muted">{MAJOR_LABEL[major as Major]}</span>
                        <span className="muted">
                          {agg.ok}/{agg.n}({Math.round((agg.ok / agg.n) * 100)}%)
                        </span>
                      </div>
                    )
                  )}
                  <Link
                    to={`/mock/result/${s.examId}/${s.at}`}
                    className="btn btn-block"
                    style={{ marginTop: 8 }}
                  >
                    詳しく見る(問題ごとの正誤・解説)
                  </Link>
                </div>
              </details>
            );
          })}
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

      <ConfirmDialog
        open={confirmDiscard}
        message="中断中の模試を破棄しますか?"
        confirmLabel="破棄する"
        danger
        onConfirm={() => {
          localStorage.removeItem(MOCK_KEY);
          setConfirmDiscard(false);
          navigate(0);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      <ConfirmDialog
        open={pendingExam !== null}
        message="中断中の模試があります。破棄して新しく始めますか?"
        confirmLabel="破棄して始める"
        danger
        onConfirm={() => {
          const id = pendingExam!;
          setPendingExam(null);
          beginExam(id);
        }}
        onCancel={() => setPendingExam(null)}
      />
    </div>
  );
}
