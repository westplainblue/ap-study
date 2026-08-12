import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconCheck, IconX } from "../components/Icons";
import QuestionCard from "../components/QuestionCard";
import { KANA, amQuestion, examLabel, sourceOf } from "../data";
import { MAJOR_LABEL, type Major } from "../data/types";
import { setAiContext } from "../lib/aiContext";
import { aggByGroup, findMockSession, isPass, rateOf } from "../lib/mockHistory";
import { loadState } from "../lib/progress";
import { formatWhen } from "./MockExam";

/** 「間違いが多かった分野」に出す中分類の件数(多すぎると弱点が埋もれる) */
const WEAK_LIMIT = 5;

/**
 * 過去に受けた模試1回ぶんの詳細。
 *
 * 受験結果は保存しておらず解答履歴から復元するため(→ lib/mockHistory)、
 * 出せるのは「どの問題を間違えたか」まで。受験時に選んだ選択肢・所要時間・
 * 見直しフラグは残っていないので、欄そのものを作らない(空欄はデータが
 * あるかのように誤解させる)。
 */
export default function MockResult() {
  const { examId, at } = useParams<{ examId: string; at: string }>();
  const session = useMemo(
    () => (examId && at ? findMockSession(loadState().attempts, examId, Number(at)) : null),
    [examId, at]
  );
  /** 開いている問題の位置(出題順の添字)。開いたものだけ描画する(80問ぶんは重い) */
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [wrongOnly, setWrongOnly] = useState(true);
  /** 番号グリッドから開いたときだけスクロールする(行クリックはもう見えている) */
  const [scrollTo, setScrollTo] = useState<number | null>(null);

  const openQuestion =
    session && openIdx !== null ? amQuestion(session.qids[openIdx]) : undefined;
  const openOk = session && openIdx !== null ? session.results[openIdx] : false;

  // 開いている問題をAIチャットに共有する(採点済みなので答えを伏せる必要はない)
  useEffect(() => {
    if (!openQuestion) {
      setAiContext(null);
      return;
    }
    setAiContext({
      label: sourceOf(openQuestion),
      text: [
        "【ユーザーが模試の結果を見返している問題】",
        `出典: ${sourceOf(openQuestion)}(分野: ${openQuestion.middle})`,
        `問題文: ${openQuestion.text}`,
        ...openQuestion.choices.map((c, i) => `${KANA[i]}: ${c}`),
        openQuestion.figure
          ? "※この問題には図表が含まれますが、図はテキスト共有できていません。"
          : "",
        `正解: ${KANA[openQuestion.answer]}`,
        `ユーザーはこの問題を模試で${openOk ? "正解" : "不正解"}でした。`,
        `解説: ${openQuestion.explanation}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }, [openQuestion, openOk]);

  useEffect(() => () => setAiContext(null), []);

  useEffect(() => {
    if (scrollTo === null) return;
    document
      .getElementById(`mq-${scrollTo}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTo(null);
  }, [scrollTo]);

  // 間違いが多かった中分類(弱点)。受験1回のなかでの内訳なので件数の多い順に出す
  const weakMiddles = useMemo(() => {
    if (!session) return [];
    return [...aggByGroup(session, (q) => amQuestion(q)?.middle).entries()]
      .map(([middle, agg]) => ({ middle, wrong: agg.n - agg.ok, n: agg.n }))
      .filter((x) => x.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || a.middle.localeCompare(b.middle, "ja"));
  }, [session]);

  if (!session) {
    return (
      <div>
        <div className="card">
          <p>この受験記録は見つかりませんでした。</p>
          <p className="muted small" style={{ marginTop: 6 }}>
            端末間の同期やデータの読み込みで、記録の区切りが変わった可能性があります。
          </p>
          <Link to="/mock" className="btn btn-block" style={{ marginTop: 12 }}>
            模試モードへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const pass = isPass(session.correct, session.total);
  const rows = session.qids.map((qid, i) => ({
    i,
    ok: session.results[i],
    q: amQuestion(qid),
  }));
  const wrongCount = session.total - session.correct;
  const shown = wrongOnly ? rows.filter((r) => !r.ok) : rows;

  /** 番号グリッドから問題を開く。正解の問題は絞り込みを解いてから開く */
  const openFromGrid = (i: number) => {
    if (session.results[i]) setWrongOnly(false);
    setOpenIdx(i);
    setScrollTo(i);
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>{examLabel(session.examId)} 午前</h1>
      <p className="muted small" style={{ marginBottom: 12 }}>
        {formatWhen(session.at)} に採点
      </p>

      <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 34, fontWeight: 700 }}>
          {session.correct} / {session.total}
        </p>
        <p className="muted" style={{ marginBottom: 8 }}>
          正答率 {rateOf(session.correct, session.total)}%
        </p>
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
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>問題ごとの正誤</p>
        <div className="mock-grid">
          {session.results.map((ok, i) => (
            <button
              key={i}
              className={`mock-cell ${ok ? "ok" : "ng"}${openIdx === i ? " current" : ""}`}
              onClick={() => openFromGrid(i)}
              aria-label={`問${i + 1} ${ok ? "正解" : "不正解"}`}
              aria-current={openIdx === i ? "true" : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <p className="muted small mock-legend">
          <span className="mock-cell ok" aria-hidden>
            1
          </span>
          正解
          <span className="mock-cell ng" aria-hidden>
            1
          </span>
          不正解
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>大分類別</p>
        {[...aggByGroup(session, (q) => amQuestion(q)?.major).entries()].map(
          ([major, agg]) => (
            <div
              key={major}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                padding: "3px 0",
              }}
            >
              <span>{MAJOR_LABEL[major as Major]}</span>
              <span className="muted">
                {agg.ok}/{agg.n}({Math.round((agg.ok / agg.n) * 100)}%)
              </span>
            </div>
          )
        )}
      </div>

      {weakMiddles.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>間違いが多かった分野</p>
          {weakMiddles.slice(0, WEAK_LIMIT).map((w) => (
            <div
              key={w.middle}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                padding: "3px 0",
              }}
            >
              <span>{w.middle}</span>
              <span className="muted">
                {w.wrong}問ミス / {w.n}問
              </span>
            </div>
          ))}
          {weakMiddles.length > WEAK_LIMIT && (
            <p className="muted small" style={{ marginTop: 6 }}>
              ほか{weakMiddles.length - WEAK_LIMIT}分野でも取りこぼしがあります。
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <p style={{ fontWeight: 600 }}>
            {wrongOnly ? `間違えた問題(${wrongCount}問)` : `全${session.total}問`}
          </p>
          <button
            className={`chip-toggle ${wrongOnly ? "on" : ""}`}
            onClick={() => setWrongOnly((v) => !v)}
            aria-pressed={wrongOnly}
          >
            {wrongOnly ? "誤答のみ" : "全問"}
          </button>
        </div>

        {shown.length === 0 && (
          <p className="muted small" style={{ padding: "8px 0" }}>
            間違えた問題はありません。全問正解です。
          </p>
        )}

        {shown.map(({ i, ok, q }) => (
          <div key={i} id={`mq-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              aria-expanded={openIdx === i}
              /* 正誤はアイコンと色でしか出していない(アイコンは装飾扱いで読み上げ対象外)
                 ので、行単体でも正誤が伝わるように名前に持たせる */
              aria-label={`問${q?.number ?? i + 1} ${q?.middle ?? ""} ${ok ? "正解" : "不正解"}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "none",
                border: "none",
                padding: "10px 0",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "flex",
                  color: ok ? "var(--success-text)" : "var(--danger-text)",
                }}
              >
                {ok ? <IconCheck size={16} /> : <IconX size={16} />}
              </span>
              <span style={{ flex: 1, fontSize: 14 }}>
                問{q?.number ?? i + 1}{" "}
                <span className="muted">{q?.middle ?? "収録から外れた問題"}</span>
              </span>
              <span className="muted small">{openIdx === i ? "閉じる" : "開く"}</span>
            </button>

            {openIdx === i &&
              (q ? (
                <div style={{ paddingBottom: 12 }}>
                  <QuestionCard
                    question={q}
                    selected={null}
                    answered
                    onSelect={() => {}}
                  />
                  <div
                    className={ok ? "banner banner-ok" : "banner banner-ng"}
                    style={{ marginTop: 12 }}
                  >
                    {ok ? <IconCheck size={18} /> : <IconX size={18} />}
                    <span>
                      {ok ? "正解" : "不正解"} 答えは「{KANA[q.answer]}」
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
                        <p className="small" style={{ fontWeight: 600 }}>
                          💡 初学者ポイント
                        </p>
                        <p className="small" style={{ lineHeight: 1.7 }}>
                          {q.point}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="muted small" style={{ paddingBottom: 12 }}>
                  この問題は現在の収録データに含まれていません。
                </p>
              ))}
          </div>
        ))}
      </div>

      <Link to="/mock" className="btn btn-block">
        模試モードへ戻る
      </Link>
    </div>
  );
}
