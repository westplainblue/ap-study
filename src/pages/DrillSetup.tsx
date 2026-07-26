import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconRefresh } from "../components/Icons";
import { countByMiddle } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import { loadState } from "../lib/progress";

type Pool = "wrong" | "middle";
const COUNTS: [number, string][] = [
  [10, "10問"],
  [20, "20問"],
  [30, "30問"],
  [0, "全部"],
];

export default function DrillSetup() {
  const navigate = useNavigate();
  const [pool, setPool] = useState<Pool>("wrong");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [excludeCalc, setExcludeCalc] = useState(false);

  const counts = countByMiddle({ excludeCalc });
  const wrongCount = Object.keys(loadState().review).length;

  const toggle = (middle: string) => {
    const next = new Set(selected);
    if (next.has(middle)) next.delete(middle);
    else next.add(middle);
    setSelected(next);
  };

  const canStart = pool === "wrong" ? wrongCount > 0 : true;

  const start = () => {
    if (!canStart) return;
    sessionStorage.setItem(
      "ap-drill",
      JSON.stringify({ pool, middles: [...selected], count, excludeCalc })
    );
    navigate("/drill/run");
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>反復学習</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        <IconRefresh size={14} /> 正解するまで繰り返します。間違えた問題はその場で出直し、全問マスターで終了です。
      </p>

      {/* 出題プールの切り替え */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`chip-toggle ${pool === "wrong" ? "on" : ""}`}
          style={{ flex: 1, padding: "10px 0" }}
          onClick={() => setPool("wrong")}
        >
          苦手を反復
        </button>
        <button
          className={`chip-toggle ${pool === "middle" ? "on" : ""}`}
          style={{ flex: 1, padding: "10px 0" }}
          onClick={() => setPool("middle")}
        >
          分野で反復
        </button>
      </div>

      {pool === "wrong" ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            間違えた問題 {wrongCount} 問
          </p>
          <p className="muted small">
            {wrongCount > 0
              ? "これまでに間違えて、まだ定着していない問題をまとめて反復します(復習の期日は無視)。"
              : "まだ間違えた問題がありません。演習や模試で間違えると、ここに反復候補として溜まります。"}
          </p>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginBottom: 10 }}>
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
        </>
      )}

      <div className="card" style={{ marginTop: 4 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>問題数</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {COUNTS.map(([c, label]) => (
            <button
              key={c}
              className={`chip-toggle ${count === c ? "on" : ""}`}
              style={{ flex: 1, padding: "8px 0" }}
              onClick={() => setCount(c)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginBottom: 16 }}>
          反復するので、実際の解答回数は問題数より多くなります。
        </p>

        {pool === "middle" && (
          <button
            type="button"
            role="switch"
            aria-checked={excludeCalc}
            className={`chip-toggle ${excludeCalc ? "on" : ""}`}
            style={{
              width: "100%",
              padding: "10px 0",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onClick={() => setExcludeCalc((v) => !v)}
          >
            {excludeCalc ? "☑" : "☐"} 計算問題を除いて出題する
          </button>
        )}

        <button
          className="btn btn-primary btn-block"
          onClick={start}
          disabled={!canStart}
          style={!canStart ? { opacity: 0.5 } : undefined}
        >
          反復学習を始める
        </button>
      </div>
    </div>
  );
}
