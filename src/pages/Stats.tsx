import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AccuracyTrend, { type DayPoint } from "../components/AccuracyTrend";
import AchievementGrid from "../components/AchievementGrid";
import ContributionGraph from "../components/ContributionGraph";
import { amQuestion } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import { addDaysStr, loadState, todayStr } from "../lib/progress";

interface Agg {
  n: number;
  ok: number;
}

export default function Stats() {
  const navigate = useNavigate();
  const location = useLocation();
  const achvRef = useRef<HTMLDivElement>(null);

  // ホームの実績カードから来たときは、実績セクションまで自動スクロールする
  useEffect(() => {
    const st = location.state as { scrollTo?: string } | null;
    if (st?.scrollTo !== "achievements") return;
    // グラフ(幅計測で高さが変わる)等のレイアウト確定後にスクロール
    const t = setTimeout(() => {
      achvRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160);
    return () => clearTimeout(t);
  }, [location.state]);

  const { byMiddle, byMajor, daily, total, dailyRate, overall, todayAgg, last7Agg } =
    useMemo(() => {
      const state = loadState();
      const byMiddle = new Map<string, Agg>();
      const byMajor = new Map<Major, Agg>();
      const daily = new Map<string, number>();
      const dayAgg = new Map<string, Agg>();
      let okTotal = 0;
      for (const a of state.attempts) {
        if (a.ok) okTotal += 1;
        const day = todayStr(new Date(a.t));
        daily.set(day, (daily.get(day) ?? 0) + 1);
        const da = dayAgg.get(day) ?? { n: 0, ok: 0 };
        da.n += 1;
        if (a.ok) da.ok += 1;
        dayAgg.set(day, da);
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
      }
      const dailyRate: DayPoint[] = [...dayAgg.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, v]) => ({ date, n: v.n, ok: v.ok }));
      const today = todayStr();
      const weekAgo = addDaysStr(today, -6);
      const todayAgg = dayAgg.get(today) ?? { n: 0, ok: 0 };
      const last7Agg: Agg = { n: 0, ok: 0 };
      for (const p of dailyRate) {
        if (p.date >= weekAgo) {
          last7Agg.n += p.n;
          last7Agg.ok += p.ok;
        }
      }
      return {
        byMiddle,
        byMajor,
        daily,
        total: state.attempts.length,
        dailyRate,
        overall: { n: state.attempts.length, ok: okTotal } as Agg,
        todayAgg,
        last7Agg,
      };
    }, []);

  const overallRate = overall.n > 0 ? Math.round((overall.ok / overall.n) * 100) : 0;

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

      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{overallRate}%</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            全体の正解率({overall.ok}/{overall.n}問)
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 18 }}>
          {([["今日", todayAgg], ["直近7日", last7Agg]] as [string, Agg][]).map(
            ([label, agg]) => (
              <div key={label} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>
                  {agg.n > 0 ? `${Math.round((agg.ok / agg.n) * 100)}%` : "—"}
                </div>
                <div className="muted small">
                  {label}
                  {agg.n > 0 ? `(${agg.ok}/${agg.n})` : ""}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>正解率の推移(日別)</p>
      <AccuracyTrend points={dailyRate} average={overallRate} />
      <p className="muted small" style={{ marginTop: 6, marginBottom: 18 }}>
        各点はその日に解いた問題の正解率です。破線は全体平均。
        {dailyRate.length === 1 && "(2日以上学習すると推移が線で表示されます)"}
      </p>

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

      <div
        ref={achvRef}
        id="achievements"
        style={{ marginTop: 22, scrollMarginTop: 12 }}
      >
        <AchievementGrid />
      </div>
    </div>
  );
}
