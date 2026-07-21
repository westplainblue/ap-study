import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { countByMiddle } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import { clearRun } from "../lib/run";

const COUNTS = [5, 10, 20];

export default function PracticeSetup() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(10);
  const counts = countByMiddle();

  const toggle = (middle: string) => {
    const next = new Set(selected);
    if (next.has(middle)) next.delete(middle);
    else next.add(middle);
    setSelected(next);
  };

  const start = () => {
    clearRun("practice"); // 新しい演習を始めるので、前回の途中状態は破棄する
    sessionStorage.setItem(
      "ap-practice",
      JSON.stringify({ middles: [...selected], count })
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

      <div className="card" style={{ marginTop: 18 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>出題数</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
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
        <button className="btn btn-primary btn-block" onClick={start}>
          演習を始める
        </button>
      </div>
    </div>
  );
}
