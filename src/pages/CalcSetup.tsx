import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CALC_THEMES, calcQuestionsByTheme } from "../lib/calc";

const COUNTS = [5, 10, 20];

/** 出題の混ぜ方。focus=同じテーマを連続(ブロック練習)、shuffle=全部混ぜる */
export type CalcMix = "focus" | "shuffle";

export default function CalcSetup() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mix, setMix] = useState<CalcMix>("focus");
  const [count, setCount] = useState(10);
  const byTheme = calcQuestionsByTheme();

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const start = () => {
    sessionStorage.setItem(
      "ap-calc",
      JSON.stringify({ themes: [...selected], mix, count })
    );
    navigate("/calc/run");
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>🧮 計算ドリル</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        計算問題だけを公式のテーマ別に特訓します。1問ごとの解答時間を測り、
        間違えたら公式カードを表示します。
      </p>

      <p style={{ fontWeight: 600, marginBottom: 6 }}>テーマ</p>
      <p className="muted small" style={{ marginBottom: 8 }}>
        未選択なら全テーマから出題します。
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {CALC_THEMES.map((t) => {
          const n = byTheme.get(t.id)?.length ?? 0;
          return (
            <button
              key={t.id}
              className={`chip-toggle ${selected.has(t.id) ? "on" : ""}`}
              onClick={() => toggle(t.id)}
              disabled={n === 0}
            >
              {t.icon} {t.name} ({n})
            </button>
          );
        })}
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 8 }}>出題のしかた</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <button
            className={`chip-toggle ${mix === "focus" ? "on" : ""}`}
            style={{ flex: 1, padding: "8px 0" }}
            onClick={() => setMix("focus")}
          >
            テーマ集中
          </button>
          <button
            className={`chip-toggle ${mix === "shuffle" ? "on" : ""}`}
            style={{ flex: 1, padding: "8px 0" }}
            onClick={() => setMix("shuffle")}
          >
            ごちゃまぜ
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 16 }}>
          {mix === "focus"
            ? "同じテーマ(公式)を連続で解きます。初めて取り組む公式の習得に向いています。"
            : "テーマを混ぜて出題します。本番と同じ「どの公式を使うか」の判断込みで鍛えられます。"}
        </p>

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

        <button className="btn btn-primary btn-block" onClick={start}>
          計算ドリルを始める
        </button>
      </div>
    </div>
  );
}
