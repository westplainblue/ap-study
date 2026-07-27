import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { canShuffleChoices, KANA, sourceOf } from "../data";
import type { AmQuestion } from "../data/types";
import { setAiContext } from "../lib/aiContext";
import { refreshAfterAnswer } from "../lib/achievements";
import {
  displayedIndex,
  isValidPerm,
  newChoicePerm,
  remapKanaLabels,
} from "../lib/choiceShuffle";
import {
  addToReview,
  isInReview,
  loadState,
  recordAnswer,
  type Mode,
} from "../lib/progress";
import { clearRun, loadRun, saveRun, type RunState } from "../lib/run";
import { IconCheck, IconStar, IconX } from "./Icons";
import QuestionCard from "./QuestionCard";

interface Props {
  questions: AmQuestion[];
  mode: Extract<Mode, "practice" | "review">;
  title: string;
  emptyMessage?: string;
  /** 指定すると進行状況を保存し、タブ破棄・再読込をまたいで途中から再開できる */
  storageKey?: string;
}

/** 1問ごと即時フィードバック型の演習プレイヤー(分野別演習・復習で共用) */
export default function Player({ questions, mode, title, emptyMessage, storageKey }: Props) {
  const navigate = useNavigate();
  const [askQuit, setAskQuit] = useState(false); // 中断の確認ダイアログ
  // 保存済みセッションの問題セットが現在の出題と一致する場合のみ進捗を復元する
  const [saved] = useState<RunState | null>(() => {
    if (!storageKey) return null;
    const r = loadRun(storageKey);
    if (!r) return null;
    const currentIds = questions.map((q) => q.id).join(",");
    return r.questionIds.join(",") === currentIds ? r : null;
  });
  const [idx, setIdx] = useState(saved?.idx ?? 0);
  const [selected, setSelected] = useState<number | null>(saved?.selected ?? null);
  const [results, setResults] = useState<boolean[]>(saved?.results ?? []);
  const [finished, setFinished] = useState(saved?.finished ?? false);
  const [reviewAdded, setReviewAdded] = useState(false);

  // 選択肢シャッフル(設定で無効化可)。問題ごとに表示順を決め、解説の記号も
  // 表示に合わせて変換する。onSelect は元の添字を返すので記録・判定は不変。
  const [shuffleOn] = useState(() => loadState().settings.shuffleChoices !== false);
  const cur: AmQuestion | undefined = questions[idx];
  // 再開時は保存済みの並びを復元する(解答済み画面の記号が変わらないように)。
  // undefined=復元なし(新しく引く) / null=並び替えなし / 配列=その並びを使う
  const [restoredOrder, setRestoredOrder] = useState<number[] | null | undefined>(
    () => {
      if (!saved || saved.order === undefined) return undefined;
      if (saved.order === null) return null;
      const q0 = questions[saved.idx ?? 0];
      return q0 && isValidPerm(saved.order, q0.choices.length)
        ? saved.order
        : undefined;
    }
  );
  const order = useMemo(() => {
    if (restoredOrder !== undefined) return restoredOrder;
    return shuffleOn && cur && canShuffleChoices(cur) ? newChoicePerm() : null;
  }, [shuffleOn, cur, restoredOrder]);
  const kanaOf = (o: number) => KANA[order ? displayedIndex(order, o) : o];
  const remap = (t: string) => (order ? remapKanaLabels(t, order) : t);

  // 進行状況を保存(結果画面に到達したら破棄)。次回起動時に途中から再開できる。
  useEffect(() => {
    if (!storageKey || questions.length === 0) return;
    if (finished) {
      clearRun(storageKey);
      return;
    }
    saveRun(storageKey, {
      questionIds: questions.map((q) => q.id),
      idx,
      selected,
      results,
      finished,
      order, // 再開時に同じ並び・記号で見せる
    });
  }, [storageKey, questions, idx, selected, results, finished, order]);

  // 表示中の問題をAIチャットに共有する
  useEffect(() => {
    const q = questions[idx];
    if (finished || !q) {
      setAiContext(null);
      return;
    }
    const ord = order ?? q.choices.map((_, i) => i);
    const lines = [
      "【ユーザーが現在取り組んでいる問題】",
      `出典: ${sourceOf(q)}(分野: ${q.middle})`,
      `問題文: ${q.text}`,
      // 画面と同じ並び・記号で共有する(シャッフル時は記号を振り直している)
      ...ord.map((oi, di) => `${KANA[di]}: ${q.choices[oi]}`),
    ];
    if (q.figure) {
      lines.push("※この問題には図表が含まれますが、図はテキスト共有できていません。");
    }
    if (selected !== null) {
      lines.push(
        `正解: ${kanaOf(q.answer)}`,
        `ユーザーの解答: ${kanaOf(selected)}(${selected === q.answer ? "正解" : "不正解"})`,
        `解説: ${remap(q.explanation)}`
      );
    } else {
      lines.push(
        "ユーザーはまだ解答中です。正答の記号を直接明かさず、考え方のヒントを中心に支援してください。"
      );
    }
    setAiContext({ label: sourceOf(q), text: lines.join("\n") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kanaOf/remap は order から導出
  }, [questions, idx, selected, finished, order]);

  useEffect(() => () => setAiContext(null), []);

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
    const rate = results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
    // 解答済みの問題だけを対象にする(中断時は未解答分を含めない)
    const wrong = questions.filter((_, i) => i < results.length && !results[i]);
    const quitEarly = results.length < questions.length;
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>
          {quitEarly ? "中断しました" : "結果"}
        </h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          {results.length === 0 ? (
            <p style={{ fontWeight: 600 }}>解答した問題はありません。</p>
          ) : (
            <>
              <p style={{ fontSize: 32, fontWeight: 700 }}>
                {correct} / {results.length} 問正解
              </p>
              <p className="muted">正答率 {rate}%</p>
            </>
          )}
          {quitEarly && (
            <p className="small" style={{ marginTop: 8, color: "var(--success-text)" }}>
              ✓ ここまでの{results.length}問は記録済みです(全{questions.length}問中)
            </p>
          )}
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

  // このセッションのリアルタイム成績(解答した瞬間に results が伸びて更新される)
  const liveDone = results.length;
  const liveCorrect = results.filter(Boolean).length;
  const liveRate = liveDone > 0 ? Math.round((liveCorrect / liveDone) * 100) : 0;

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    const ok = i === q.answer;
    setResults((r) => [...r, ok]);
    recordAnswer(q.id, ok, mode);
    refreshAfterAnswer(); // 実績を判定し、新規解除はトーストで通知
  };

  const handleNext = () => {
    if (idx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setSelected(null);
      setReviewAdded(false);
      setRestoredOrder(undefined); // 次の問題は新しい並びを引く
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
          paddingRight: 48,
        }}
      >
        <span className="chip">{q.middle}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted small">
            {idx + 1} / {questions.length} 問
          </span>
          <button
            className="small"
            style={{
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              color: "var(--text-2)",
            }}
            onClick={() => setAskQuit(true)}
          >
            中断
          </button>
        </span>
      </div>
      <div className="progress-track" style={{ marginBottom: 6 }}>
        <div
          className="progress-fill"
          style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      {/* このセッションの正答率(1問解答するたびに更新) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
          minHeight: 18,
        }}
      >
        {liveDone > 0 ? (
          <>
            <span className="muted small">
              正答 {liveCorrect} / {liveDone}
            </span>
            <span
              className="small"
              style={{
                fontWeight: 700,
                color:
                  liveRate >= 60 ? "var(--success-text)" : "var(--warning-text)",
              }}
            >
              正答率 {liveRate}%
            </span>
          </>
        ) : (
          <span className="muted small">まだ解答していません</span>
        )}
      </div>

      <QuestionCard
        question={q}
        selected={selected}
        answered={answered}
        onSelect={handleSelect}
        order={order ?? undefined}
      />

      {answered && (
        <div style={{ marginTop: 14 }}>
          <div className={correct ? "banner banner-ok" : "banner banner-ng"}>
            {correct ? <IconCheck size={18} /> : <IconX size={18} />}
            <span>
              {correct ? "正解!" : "不正解…"} 答えは「{kanaOf(q.answer)}」
            </span>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>解説</p>
            <p className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
              {remap(q.explanation)}
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
                <p className="small" style={{ lineHeight: 1.7 }}>{remap(q.point)}</p>
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

      {askQuit && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAskQuit(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="演習を中断する"
            style={{ textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              演習を中断しますか?
            </p>
            <p className="small" style={{ lineHeight: 1.8, color: "var(--text-2)" }}>
              {results.length > 0 ? (
                <>
                  解答済みの <strong>{results.length}問</strong> はすでに記録されています。
                  中断しても成績や復習キューには反映されます。
                </>
              ) : (
                "まだ解答した問題はありません。"
              )}
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  setAskQuit(false);
                  setFinished(true); // ここまでの結果画面へ(保存済みセッションは破棄される)
                }}
              >
                ここまでの結果を見て終了
              </button>
              <button
                className="btn btn-block"
                onClick={() => {
                  setAskQuit(false);
                  navigate("/"); // 進行状況は保持したままホームへ(あとで続きから再開)
                }}
              >
                あとで続きから再開する
              </button>
              <button
                className="small muted"
                style={{ padding: "6px 0" }}
                onClick={() => setAskQuit(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
