import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { countByMiddle, EXAMS } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import { statsByQuestion } from "../lib/progress";
import { clearRun } from "../lib/run";

const COUNTS = [5, 10, 20];

/** チップ表示用の短い試験回名(例: 令和7年度 秋期 → 令和7秋期) */
function shortExamLabel(label: string): string {
  return label.replace(/年度 (?=\d+月$)/, "年").replace("年度 ", "");
}

export default function PracticeSetup() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [examIds, setExamIds] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(10);
  const [excludeCalc, setExcludeCalc] = useState(false);
  const [unseenOnly, setUnseenOnly] = useState(false);
  // 一度でも解答した問題のID(モード不問)。「未挑戦のみ」の除外対象
  const attempted = useMemo(() => new Set(statsByQuestion().keys()), []);
  const counts = countByMiddle({
    excludeCalc,
    examIds: [...examIds],
    excludeIds: unseenOnly ? attempted : undefined,
  });
  // いまの絞り込み(分野未選択なら全分野)で出題対象になる問題数
  const available = selected.size
    ? [...selected].reduce((sum, m) => sum + (counts.get(m) ?? 0), 0)
    : [...counts.values()].reduce((sum, n) => sum + n, 0);

  const toggle = (middle: string) => {
    const next = new Set(selected);
    if (next.has(middle)) next.delete(middle);
    else next.add(middle);
    setSelected(next);
  };

  const toggleExam = (examId: string) => {
    const next = new Set(examIds);
    if (next.has(examId)) next.delete(examId);
    else next.add(examId);
    setExamIds(next);
  };

  const start = () => {
    clearRun("practice"); // 新しい演習を始めるので、前回の途中状態は破棄する
    sessionStorage.setItem(
      "ap-practice",
      JSON.stringify({
        middles: [...selected],
        count,
        excludeCalc,
        unseenOnly,
        examIds: [...examIds],
      })
    );
    navigate("/practice/run");
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>分野別演習</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        分野を選んでください(未選択なら全分野から出題)
      </p>

      {(Object.keys(MIDDLES_BY_MAJOR) as Major[]).map((major) => (
        <div key={major} style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>{MAJOR_LABEL[major]}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MIDDLES_BY_MAJOR[major].map((middle) => {
              const n = counts.get(middle) ?? 0;
              return (
                <button
                  key={middle}
                  className={`chip-toggle ${selected.has(middle) ? "on" : ""}`}
                  onClick={() => toggle(middle)}
                  disabled={n === 0}
                  style={n === 0 ? { opacity: 0.4 } : undefined}
                >
                  {middle} ({n})
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>試験回</p>
        <p className="muted small" style={{ marginBottom: 6 }}>
          未選択なら全{EXAMS.length}回から出題。選ぶとその回の問題に絞られ、分野の問題数も連動します。
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EXAMS.map((e) => (
            <button
              key={e.examId}
              className={`chip-toggle ${examIds.has(e.examId) ? "on" : ""}`}
              onClick={() => toggleExam(e.examId)}
            >
              {shortExamLabel(e.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>出題数</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {COUNTS.map((c) => (
            <button
              key={c}
              className={`chip-toggle ${count === c ? "on" : ""}`}
              style={{ flex: 1, padding: "8px 0" }}
              onClick={() => setCount(c)}
            >
              {c}問
            </button>
          ))}
        </div>

        <p style={{ fontWeight: 600, marginBottom: 8 }}>オプション</p>
        <button
          type="button"
          role="switch"
          aria-checked={excludeCalc}
          className={`chip-toggle ${excludeCalc ? "on" : ""}`}
          style={{
            width: "100%",
            padding: "10px 0",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onClick={() => setExcludeCalc((v) => !v)}
        >
          {excludeCalc ? "☑" : "☐"} 計算問題を除いて出題する
        </button>
        <p className="muted small" style={{ marginBottom: 16 }}>
          待ち行列・稼働率・伝送時間など、選択肢が数値の計算問題を出題対象から外します。
        </p>

        <button
          type="button"
          role="switch"
          aria-checked={unseenOnly}
          className={`chip-toggle ${unseenOnly ? "on" : ""}`}
          style={{
            width: "100%",
            padding: "10px 0",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onClick={() => setUnseenOnly((v) => !v)}
        >
          {unseenOnly ? "☑" : "☐"} まだ解いていない問題だけを出題する
        </button>
        <p className="muted small" style={{ marginBottom: 16 }}>
          これまでに一度も解答したことのない問題に絞ります(どのモードで解いた問題も除外)。
          分野チップの件数も未挑戦の数に変わります。
          {unseenOnly && (
            <>
              <br />
              いまの絞り込みで未挑戦は <b>{available}問</b> です。
            </>
          )}
        </p>

        {available === 0 && (
          <p
            className="small"
            style={{ color: "var(--danger-text)", marginBottom: 8 }}
          >
            {unseenOnly
              ? "この条件の問題はすべて解答済みです。分野や試験回の指定を広げてください。"
              : "この条件に合う問題がありません。絞り込みを見直してください。"}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          onClick={start}
          disabled={available === 0}
        >
          演習を始める
        </button>
      </div>
    </div>
  );
}
