import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { canShuffleChoices, KANA, sourceOf } from "../data";
import type { AmQuestion } from "../data/types";
import { setAiContext } from "../lib/aiContext";
import {
  getAiMarks,
  resolveMarks,
  setAiMarks,
  subscribeAiMarks,
} from "../lib/aiHighlight";
import { refreshAfterAnswer } from "../lib/achievements";
import { calcThemeOf, CALC_THEMES, type CalcTheme } from "../lib/calc";
import {
  displayedIndex,
  newChoicePerm,
  remapKanaLabels,
} from "../lib/choiceShuffle";
import { loadState, recordAnswer } from "../lib/progress";
import { captureVocabForQuestion } from "../lib/vocab";
import { useAnswerKeys } from "../hooks/useAnswerKeys";
import { IconCheck, IconX } from "./Icons";
import KeyHint from "./KeyHint";
import QuestionCard from "./QuestionCard";

interface Props {
  questions: AmQuestion[];
  emptyMessage?: string;
}

interface CalcResult {
  qid: string;
  ok: boolean;
  ms: number;
}

function fmtSec(ms: number): string {
  return `${Math.round(ms / 1000)}秒`;
}

/** テーマの公式カード(誤答時と結果画面で使う) */
function FormulaCard({ theme }: { theme: CalcTheme }) {
  return (
    <div
      className="card"
      style={{ marginTop: 10, borderColor: "var(--accent)", background: "var(--accent-bg)" }}
    >
      <p style={{ fontWeight: 700, marginBottom: 6 }}>
        {theme.icon} 公式カード: {theme.name}
      </p>
      <p className="small" style={{ lineHeight: 1.8, marginBottom: 6 }}>
        {theme.formula}
      </p>
      <p className="small" style={{ lineHeight: 1.7, color: "var(--text-2)" }}>
        🖊 {theme.howTo}
      </p>
    </div>
  );
}

/**
 * 計算ドリルの出題本体。演習プレイヤー(Player)とは役割が違うため別コンポーネント:
 * - 1問ごとに解答時間を測り、テーマの目標秒数と比べる
 * - 誤答時はテーマの公式カードを必ず提示する
 * - 結果画面はテーマ別の内訳(正答率・平均時間)を出す
 * 反復学習(DrillPlayer)と同じく、途中状態の保存・再開はしない(セッションは短い)。
 */
export default function CalcPlayer({ questions, emptyMessage }: Props) {
  const navigate = useNavigate();
  const [askQuit, setAskQuit] = useState(false);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<CalcResult[]>([]);
  const [finished, setFinished] = useState(false);

  const cur: AmQuestion | undefined = questions[idx];
  const theme = cur ? calcThemeOf(cur.id) : undefined;

  // 解答時間の計測。問題が変わったら測り直し、解答した瞬間の経過を記録する
  const startRef = useRef(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const answered = selected !== null;
  useEffect(() => {
    startRef.current = Date.now();
    setElapsedSec(0);
  }, [idx]);
  useEffect(() => {
    if (answered || finished || !cur) return;
    const t = setInterval(
      () => setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [answered, finished, cur]);

  // 選択肢シャッフル(設定で無効化可)。数値選択肢の問題は canShuffleChoices が
  // 自動で除外する(実試験の昇順掲載の慣例)ため、対象は式選択肢の問題だけになる。
  const [shuffleOn] = useState(() => loadState().settings.shuffleChoices !== false);
  const order = useMemo(
    () => (shuffleOn && cur && canShuffleChoices(cur) ? newChoicePerm() : null),
    [shuffleOn, cur]
  );
  const kanaOf = (o: number) => KANA[order ? displayedIndex(order, o) : o];
  const remap = (t: string) => (order ? remapKanaLabels(t, order) : t);

  // AIマーク: チャットが発行した生マークを現在の問題の文字範囲へ解決する
  const rawMarks = useSyncExternalStore(subscribeAiMarks, getAiMarks, getAiMarks);
  const aiMarks = useMemo(
    () => (cur ? resolveMarks(cur, rawMarks) : []),
    [cur, rawMarks]
  );
  useEffect(() => {
    setAiMarks([]); // 問題が変わったら前の問題のマークを消す
  }, [cur?.id]);

  // 表示中の問題をAIチャットに共有する
  useEffect(() => {
    if (finished || !cur) {
      setAiContext(null);
      return;
    }
    const ord = order ?? cur.choices.map((_, i) => i);
    const lines = [
      "【ユーザーが現在取り組んでいる問題(計算ドリル)】",
      `出典: ${sourceOf(cur)}(分野: ${cur.middle} / テーマ: ${theme?.name ?? "計算"})`,
      `問題文: ${cur.text}`,
      ...ord.map((oi, di) => `${KANA[di]}: ${cur.choices[oi]}`),
    ];
    if (cur.figure) {
      lines.push("※この問題には図表が含まれますが、図はテキスト共有できていません。");
    }
    if (selected !== null) {
      lines.push(
        `正解: ${kanaOf(cur.answer)}`,
        `ユーザーの解答: ${kanaOf(selected)}(${selected === cur.answer ? "正解" : "不正解"})`,
        `解説: ${remap(cur.explanation)}`
      );
    } else {
      lines.push(
        "ユーザーはまだ解答中です。正答の記号を直接明かさず、計算の道筋のヒントを中心に支援してください。"
      );
    }
    setAiContext({ label: sourceOf(cur), text: lines.join("\n") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kanaOf/remap は order から導出
  }, [questions, idx, selected, finished, order]);

  useEffect(() => () => setAiContext(null), []);

  const correct = answered && cur !== undefined && selected === cur.answer;

  // --- 操作ハンドラ ---------------------------------------------------------
  // 早期リターン(出題なし・結果画面)より前に置く。この下でフックを呼ぶため、
  // returnを挟むと結果画面に切り替わった瞬間にフックの数が変わって React が落ちる。
  const handleSelect = (i: number) => {
    if (answered || !cur) return;
    const ms = Date.now() - startRef.current;
    setSelected(i);
    const ok = i === cur.answer;
    setResults((r) => [...r, { qid: cur.id, ok, ms }]);
    recordAnswer(cur.id, ok, "calc", ms);
    // 誤答した問題の用語をことば帳へ採取する(チップ表示は用語ノート側)
    if (!ok) captureVocabForQuestion(cur.id);
    refreshAfterAnswer(); // 実績を判定し、新規解除はトーストで通知
  };

  const handleNext = () => {
    if (idx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setSelected(null);
    }
  };

  // キーボード操作(PC)。キーは画面の並び順なので order で元の添字に戻す
  useAnswerKeys({
    // 中断ダイアログ表示中は無効化(背後での解答記録・進行を防ぐ)
    enabled: !finished && !askQuit && Boolean(cur),
    choiceCount: cur?.choices.length ?? 0,
    onPick: (d) => handleSelect(order ? order[d] : d),
    onNext: answered ? handleNext : undefined,
  });

  if (questions.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>計算ドリル</h1>
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
    const correct = results.filter((r) => r.ok).length;
    const rate = results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
    // 目標時間内に解けた問題数(テーマ未分類は母数から外れないよう目標∞扱いにしない)
    const inTime = results.filter((r) => {
      const t = calcThemeOf(r.qid);
      return t ? r.ms <= t.targetSec * 1000 : true;
    }).length;
    // テーマ別内訳(出題があったテーマだけ、定義順)
    const byTheme = CALC_THEMES.map((t) => {
      const rs = results.filter((r) => calcThemeOf(r.qid)?.id === t.id);
      if (rs.length === 0) return null;
      const avgMs = rs.reduce((s, r) => s + r.ms, 0) / rs.length;
      return { theme: t, n: rs.length, ok: rs.filter((r) => r.ok).length, avgMs };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    const wrong = questions.filter((q) => results.some((r) => r.qid === q.id && !r.ok));
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
              <p className="muted">
                正答率 {rate}% ・ ⏱ 目標時間内 {inTime} / {results.length} 問
              </p>
            </>
          )}
          {quitEarly && (
            <p className="small" style={{ marginTop: 8, color: "var(--success-text)" }}>
              ✓ ここまでの{results.length}問は記録済みです(全{questions.length}問中)
            </p>
          )}
        </div>

        {byTheme.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>テーマ別のできばえ</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byTheme.map(({ theme: t, n, ok, avgMs }) => {
                const over = avgMs > t.targetSec * 1000;
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span className="small" style={{ fontWeight: 600 }}>
                      {t.icon} {t.name}
                    </span>
                    <span className="small" style={{ whiteSpace: "nowrap" }}>
                      {ok}/{n} 正解 ・{" "}
                      <span
                        style={{
                          color: over ? "var(--warning-text)" : "var(--success-text)",
                          fontWeight: 600,
                        }}
                      >
                        平均{fmtSec(avgMs)}
                      </span>
                      <span className="muted">(目標{t.targetSec}秒)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {wrong.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>
              間違えた問題(復習キューに登録済み)
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {wrong.map((q) => (
                <li key={q.id} className="small">
                  問{q.number} {calcThemeOf(q.id)?.name ?? q.middle}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/calc" className="btn btn-primary btn-block">
            テーマを選んでもう一度
          </Link>
          <Link to="/" className="btn btn-block">
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const lastMs = results[results.length - 1]?.ms ?? 0;
  const overTarget = theme ? lastMs > theme.targetSec * 1000 : false;

  return (
    <div className={answered ? "pc-wide" : undefined}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          paddingRight: 48,
        }}
      >
        <span className="chip">
          {theme ? `${theme.icon} ${theme.name}` : q.middle}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted small">
            {idx + 1} / {questions.length} 問
          </span>
          <span
            className="small"
            style={{
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color:
                theme && elapsedSec > theme.targetSec
                  ? "var(--warning-text)"
                  : "var(--text-2)",
            }}
          >
            ⏱ {answered ? fmtSec(lastMs) : `${elapsedSec}秒`}
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
      <div className="progress-track" style={{ marginBottom: 14 }}>
        <div
          className="progress-fill"
          style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      {/* 解答後はPCで問題と解説・公式カードを左右に並べる */}
      <div className={answered ? "pc-split" : undefined}>
        <div>
          <QuestionCard
            question={q}
            selected={selected}
            answered={answered}
            onSelect={handleSelect}
            order={order ?? undefined}
            aiMarks={aiMarks}
          />
        </div>

      {answered && (
        <div className="answer-block">
          <div className={correct ? "banner banner-ok" : "banner banner-ng"}>
            {correct ? <IconCheck size={18} /> : <IconX size={18} />}
            <span>
              {correct ? "正解!" : "不正解…"} 答えは「{kanaOf(q.answer)}」 ・ ⏱{" "}
              {fmtSec(lastMs)}
              {theme &&
                (overTarget ? `(目標${theme.targetSec}秒を超過)` : `(目標${theme.targetSec}秒内)`)}
            </span>
          </div>

          {/* 誤答したら公式カードを必ず提示する(このモードの核) */}
          {!correct && theme && <FormulaCard theme={theme} />}

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
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={handleNext}
          >
            {idx + 1 >= questions.length ? "結果を見る" : "次の問題へ"}
          </button>
        </div>
      )}
      </div>

      <KeyHint choiceCount={q.choices.length} answered={answered} />

      {askQuit && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAskQuit(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="計算ドリルを中断する"
            style={{ textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              計算ドリルを中断しますか?
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
                  setFinished(true);
                }}
              >
                ここまでの結果を見て終了
              </button>
              <button
                className="btn btn-block"
                onClick={() => {
                  setAskQuit(false);
                  navigate("/");
                }}
              >
                ホームへ戻る(結果を見ない)
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
