import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ContributionGraph from "../components/ContributionGraph";
import { amQuestion } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import { loadState, todayStr } from "../lib/progress";

interface Agg {
  n: number;
  ok: number;
}

export default function Stats() {
  const navigate = useNavigate();
  const { byMiddle, byMajor, daily, total } = useMemo(() => {
    const state = loadState();
    const byMiddle = new Map<string, Agg>();
    const byMajor = new Map<Major, Agg>();
    const daily = new Map<string, number>();
    for (const a of state.attempts) {
      const q = amQuestion(a.q);
      if (!q) continue;
      const m = byMiddle.get(q.middle) ?? { n: 0, ok: 0 };
      m.n += 1;
      if (a.ok) m.ok += 1;
      byMiddle.set(q.middle, m);
      const mj = byMajor.get(q.major) ?? { n: 0, ok: 0 };
      mj.n += 1;
      if (a.ok) mj.ok += 1;
      byMajor.set(q.major, mj);
      const day = todayStr(new Date(a.t));
      daily.set(day, (daily.get(day) ?? 0) + 1);
    }
    return { byMiddle, byMajor, daily, total: state.attempts.length };
  }, []);

  if (total === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>分析</h1>
        <div className="card">
          <p>まだ解答データがありません。</p>
          <p className="muted small" style={{ marginTop: 4 }}>
            演習を始めると、分野別の正答率や弱点がここに表示されます。
          </p>
        </div>
      </div>
    );
  }

  const goPractice = (middle: string) => {
    sessionStorage.setItem(
      "ap-practice",
      JSON.stringify({ middles: [middle], count: 10 })
    );
    navigate("/practice/run");
  };

  const weak = [...byMiddle.entries()]
    .filter(([, v]) => v.n >= 3 && v.ok / v.n < 0.6)
    .sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 14 }}>分析</h1>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>大分類別の正答率</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {(Object.keys(MAJOR_LABEL) as Major[]).map((major) => {
          const agg = byMajor.get(major);
          const rate = agg && agg.n > 0 ? Math.round((agg.ok / agg.n) * 100) : null;
          return (
            <div key={major}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 3,
                }}
              >
                <span>{MAJOR_LABEL[major]}</span>
                <span className="muted">
                  {rate !== null ? `${rate}%(${agg!.ok}/${agg!.n})` : "未演習"}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className={`bar-fill ${rate !== null && rate < 60 ? "warn" : ""}`}
                  style={{ width: `${rate ?? 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {weak.length > 0 && (
        <>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>弱点トピック(正答率60%未満)</p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}
          >
            {weak.map(([middle, v]) => (
              <button key={middle} className="list-row" onClick={() => goPractice(middle)}>
                <span>{middle}</span>
                <span style={{ color: "var(--warning-text)", fontWeight: 600 }}>
                  {Math.round((v.ok / v.n) * 100)}% → 演習する
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <p style={{ fontWeight: 600, marginBottom: 8 }}>分野別の成績</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {(Object.keys(MIDDLES_BY_MAJOR) as Major[]).flatMap((major) =>
          MIDDLES_BY_MAJOR[major]
            .filter((middle) => byMiddle.has(middle))
            .map((middle) => {
              const v = byMiddle.get(middle)!;
              const rate = Math.round((v.ok / v.n) * 100);
              return (
                <div key={middle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      marginBottom: 3,
                    }}
                  >
                    <span>{middle}</span>
                    <span className="muted">
                      {rate}%({v.ok}/{v.n})
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${rate < 60 ? "warn" : ""}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })
        )}
      </div>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>学習量(直近6か月)</p>
      <ContributionGraph daily={daily} />
    </div>
  );
}
