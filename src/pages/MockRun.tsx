import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import QuestionCard from "../components/QuestionCard";
import { EXAMS, KANA, sourceOf } from "../data";
import { MAJOR_LABEL, type Major } from "../data/types";
import { achvDef, refreshAfterBatch } from "../lib/achievements";
import { setAiContext } from "../lib/aiContext";
import { choiceIndexFromKey, isPlainKey, isTypingTarget } from "../lib/keys";
import { isPass, rateOf } from "../lib/mockHistory";
import { recordAnswersBatch } from "../lib/progress";
import { captureVocabForQuestion } from "../lib/vocab";
import { MOCK_KEY, type MockState } from "./MockExam";

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
    // 壊れた中断データで JSON.parse が throw すると画面ごと白画面になるため守る。
    // 壊れていれば null 扱いにして下の「模試が見つかりません」フォールバックに落とす。
    try {
      const raw = localStorage.getItem(MOCK_KEY);
      return raw ? (JSON.parse(raw) as MockState) : null;
    } catch {
      localStorage.removeItem(MOCK_KEY);
      return null;
    }
  });
  const [idx, setIdx] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [graded, setGraded] = useState(false);
  // 未解答が残ったまま「採点する」を押したときのアプリ内確認
  // (window.confirm はPWA等で無反応になるため使わない → components/ConfirmDialog)
  const [confirmGrade, setConfirmGrade] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  // キーハンドラは1度だけ登録し、最新の処理を ref 経由で呼ぶ
  // (依存に入れて貼り直すと、押しっぱなしの取りこぼしや無駄な再登録が起きる)
  const idxRef = useRef(0);
  const answerRef = useRef<(i: number) => void>(() => {});
  const flagRef = useRef<() => void>(() => {});

  const exam = useMemo(
    () => EXAMS.find((e) => e.examId === mock?.examId),
    [mock?.examId]
  );

  useEffect(() => {
    if (graded) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [graded]);

  // 表示中の問題をAIチャットに共有する(模試中はネタバレ防止の指示付き)
  useEffect(() => {
    const q = exam?.am[idx];
    if (!q || graded) {
      setAiContext(null);
      return;
    }
    setAiContext({
      label: `${sourceOf(q)}(模試中)`,
      text: [
        "【ユーザーが模試モードで現在解いている問題】",
        `出典: ${sourceOf(q)}(分野: ${q.middle})`,
        `問題文: ${q.text}`,
        ...q.choices.map((c, i) => `${KANA[i]}: ${c}`),
        q.figure ? "※この問題には図表が含まれますが、図はテキスト共有できていません。" : "",
        "模試の最中です。ユーザーが明示的に答えを要求しない限り、正答の記号や決定的な絞り込みは伝えず、考え方のヒントにとどめてください。",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }, [exam, idx, graded]);

  useEffect(() => () => setAiContext(null), []);

  // キーボード操作。模試は Player を使わない独自画面なので、ここで直接受ける。
  // 解答(1〜4 / A〜D)に加え、80問を行き来する模試特有の ←→ と F を割り当てる。
  const canKey = Boolean(mock && exam) && !graded && !confirmGrade;
  useEffect(() => {
    if (!canKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(document.activeElement)) return;
      const total = exam!.am.length;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((i) => Math.min(total - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        flagRef.current();
        return;
      }
      const d = choiceIndexFromKey(e.key, exam!.am[idxRef.current].choices.length);
      if (d >= 0) {
        e.preventDefault();
        answerRef.current(d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canKey, exam]);

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
  const flags = mock.flags ?? [];

  const patch = (next: MockState) => {
    setMock(next);
    localStorage.setItem(MOCK_KEY, JSON.stringify(next));
  };

  const answerAt = (i: number) => {
    if (timeUp) return;
    patch({ ...mock, answers: mock.answers.map((a, j) => (j === idx ? i : a)) });
  };

  /** 「あとで見直す」の付け外し。本番の「飛ばして後で戻る」戦略を画面上で表せるようにする */
  const toggleFlag = () => {
    patch({
      ...mock,
      flags: flags.includes(idx) ? flags.filter((f) => f !== idx) : [...flags, idx],
    });
  };

  // キーハンドラから最新の処理・位置を参照できるようにする
  idxRef.current = idx;
  answerRef.current = answerAt;
  flagRef.current = toggleFlag;

  const grade = () => {
    const res = questions.map((q, i) => mock.answers[i] === q.answer);
    recordAnswersBatch(
      questions.map((q, i) => ({ qid: q.id, ok: res[i], mode: "mock" as const }))
    );
    // 誤答した問題の用語をことば帳へ採取する(チップ表示は用語ノート側)
    questions.forEach((q, i) => {
      if (!res[i]) captureVocabForQuestion(q.id);
    });
    setUnlocked(refreshAfterBatch()); // 実績を判定(トーストは出さず結果画面に表示)
    localStorage.removeItem(MOCK_KEY);
    setResults(res);
    setGraded(true);
  };

  if (graded) {
    const correct = results.filter(Boolean).length;
    const rate = rateOf(correct, questions.length);
    const pass = isPass(correct, questions.length);
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
          {/* どの回を解いた結果なのかは、点数と同じカード内に出す
              (結果を見返したときに回次と点数が離れていると取り違えるため) */}
          <p style={{ fontWeight: 600, marginBottom: 6 }}>{exam.label} 午前</p>
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

        {unlocked.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>
              実績を{unlocked.length}件解除!
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {unlocked.map((id) => {
                const d = achvDef(id);
                return d ? (
                  <div key={id} style={{ width: 64, textAlign: "center" }}>
                    <Badge tier={d.tier} glyph={d.glyph} size={52} />
                    <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 4 }}>
                      {d.name}
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

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
                  正解: {KANA[q.answer]}
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

  // 問題番号の一覧。PCでは右に常時出し、モバイルはヘッダーのボタンで開閉する
  const grid = (
    <div className="mock-grid">
      {questions.map((_, i) => {
        const answered = mock.answers[i] !== null;
        const flagged = flags.includes(i);
        return (
          <button
            key={i}
            onClick={() => {
              setIdx(i);
              setShowGrid(false);
            }}
            className={`mock-cell${answered ? " answered" : ""}${flagged ? " flagged" : ""}${i === idx ? " current" : ""}`}
            aria-label={`問${i + 1}${answered ? " 解答済み" : " 未解答"}${flagged ? " 見直し" : ""}`}
            aria-current={i === idx ? "true" : undefined}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  const legend = (
    <p className="muted small mock-legend">
      <span className="mock-cell answered" aria-hidden>
        1
      </span>
      解答済み
      <span className="mock-cell flagged" aria-hidden>
        1
      </span>
      見直し
      <span className="mock-cell" aria-hidden>
        1
      </span>
      未解答
    </p>
  );

  return (
    <div className="pc-wide">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          paddingRight: 48,
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
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className={`chip-toggle ${flags.includes(idx) ? "on" : ""}`}
            onClick={toggleFlag}
            aria-pressed={flags.includes(idx)}
            title="あとで見直す(F)"
          >
            {flags.includes(idx) ? "🚩 見直す" : "🏳 見直し"}
          </button>
          {/* PCでは右に一覧を常時出すので、この開閉ボタンはモバイル用 */}
          <button className="chip-toggle pc-hide" onClick={() => setShowGrid((v) => !v)}>
            {idx + 1} / {questions.length}(解答済 {answeredCount})
          </button>
          <span className="muted small mock-count">
            {idx + 1} / {questions.length}(解答済 {answeredCount})
          </span>
        </span>
      </div>

      {timeUp && (
        <div className="banner banner-ng" style={{ marginBottom: 10 }}>
          時間切れです。「採点する」を押してください。
        </div>
      )}

      {/* モバイル: ヘッダーのボタンで開閉する一覧 */}
      {showGrid && (
        <div className="pc-hide" style={{ marginBottom: 12 }}>
          {grid}
          {legend}
        </div>
      )}

      {/* PCでは問題(左)と番号一覧(右)を並べる。80問を行き来する模試では
          「どこが未解答か」が常に見えていないと見直しの戦略が立てられない */}
      <div className="pc-split">
        <div>
          <QuestionCard
            question={q}
            selected={mock.answers[idx]}
            answered={timeUp}
            revealAnswer={false}
            onSelect={answerAt}
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
            if (questions.length - answeredCount === 0) grade();
            else setConfirmGrade(true);
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

          <div className="kbd-hint">
            <span>
              <kbd>1</kbd>〜<kbd>4</kbd>で解答
            </span>
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd>で移動
            </span>
            <span>
              <kbd>F</kbd>で見直し
            </span>
          </div>
        </div>

        {/* 番号一覧(PCのみ・画面内に固定) */}
        <div className="pc-split-sticky mock-side">
          <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
            解答状況({answeredCount} / {questions.length})
            {flags.length > 0 && ` ・ 見直し ${flags.length}`}
          </p>
          {grid}
          {legend}
        </div>
      </div>

      <ConfirmDialog
        open={confirmGrade}
        message={`未解答が${questions.length - answeredCount}問あります。\n未解答は不正解として採点します。`}
        confirmLabel="採点する"
        onConfirm={() => {
          setConfirmGrade(false);
          grade();
        }}
        onCancel={() => setConfirmGrade(false)}
      />
    </div>
  );
}
