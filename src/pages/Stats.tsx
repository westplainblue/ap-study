import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AccuracyTrend, { type DayPoint } from "../components/AccuracyTrend";
import AchievementGrid from "../components/AchievementGrid";
import { IconChevronRight } from "../components/Icons";
import ContributionGraph from "../components/ContributionGraph";
import { amQuestion } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import {
  MODE_HINT,
  MODE_LABEL,
  MODE_ORDER,
  modesWithData,
  rateOf,
  statsByGroupAndMode,
  statsByMode,
} from "../lib/modeStats";
import { CALC_THEMES, statsByCalcTheme } from "../lib/calc";
import { addDaysStr, loadState, todayStr } from "../lib/progress";
import { delayedRetention } from "../lib/srs";

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

  const {
    byMiddle,
    byMajor,
    daily,
    total,
    dailyRate,
    overall,
    todayAgg,
    last7Agg,
    retention,
    calcByTheme,
    byMode,
    byMajorMode,
  } = useMemo(() => {
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
      const retention = delayedRetention(state.attempts, 7);
      const calcByTheme = statsByCalcTheme(state.attempts);
      const byMode = statsByMode(state.attempts);
      // 分野の粒度は大分類。中分類をモードで割ると1桁件数のセルばかりになり読めない
      const byMajorMode = statsByGroupAndMode(
        state.attempts,
        (qid) => amQuestion(qid)?.major
      );
      return {
        byMiddle,
        byMajor,
        daily,
        total: state.attempts.length,
        dailyRate,
        overall: { n: state.attempts.length, ok: okTotal } as Agg,
        todayAgg,
        last7Agg,
        retention,
        calcByTheme,
        byMode,
        byMajorMode,
      };
    }, []);

  const retentionRate =
    retention.n > 0 ? Math.round((retention.ok / retention.n) * 100) : null;

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

  // そのテーマだけを集中して解き直す(CalcSetup と同じ設定形式で渡す)
  const goCalcTheme = (themeId: string) => {
    sessionStorage.setItem(
      "ap-calc",
      JSON.stringify({ themes: [themeId], mix: "focus", count: 10 })
    );
    navigate("/calc/run");
  };

  // 解答実績のあるテーマだけを定義順に並べる(未着手のテーマは「成績」ではない)
  const calcRows = CALC_THEMES.map((t) => ({ theme: t, stat: calcByTheme.get(t.id) }))
    .filter((r): r is { theme: (typeof CALC_THEMES)[number]; stat: NonNullable<typeof r.stat> } =>
      Boolean(r.stat)
    );

  // 実施したモードが2つ以上あるときだけ、分野×モードの表を出す(1つなら上の表と同じ)
  const modeCols = modesWithData(byMode);

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
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>
            {retentionRate !== null ? `${retentionRate}%` : "—"}
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            遅延保持率
            {retentionRate !== null ? `(${retention.ok}/${retention.n}問)` : "(集計待ち)"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {([["全体", overall], ["今日", todayAgg], ["直近7日", last7Agg]] as [
            string,
            Agg,
          ][]).map(([label, agg]) => (
            <div key={label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}>
                {agg.n > 0 ? `${Math.round((agg.ok / agg.n) * 100)}%` : "—"}
              </div>
              <div className="muted small">
                {label}
                {agg.n > 0 ? `(${agg.ok}/${agg.n})` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>
        遅延保持率＝7日以上あけて解き直した問題の正解率。詰め込みではなく「あとで思い出せるか」を測る指標です。
        {retentionRate === null && " まだ十分なデータがありません(同じ問題を7日以上あけて解くと集計されます)。"}
      </p>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>正解率の推移(日別)</p>
      <AccuracyTrend points={dailyRate} average={overallRate} />
      <p className="muted small" style={{ marginTop: 6, marginBottom: 18 }}>
        各点はその日に解いた問題の正解率です。破線は全体平均。
        {dailyRate.length === 1 && "(2日以上学習すると推移が線で表示されます)"}
      </p>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>モード別の正答率</p>
      <div
        className="card"
        style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 12 }}
      >
        {MODE_ORDER.map((m) => {
          const agg = byMode.get(m);
          const rate = rateOf(agg);
          return (
            <div key={m}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 3,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{MODE_LABEL[m]}</span>
                {rate !== null ? (
                  <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
                    {rate}%
                    <span
                      className="muted small"
                      style={{ fontWeight: 400, marginLeft: 5 }}
                    >
                      ({agg!.ok}/{agg!.n})
                    </span>
                  </span>
                ) : (
                  <span className="muted small">未実施</span>
                )}
              </div>
              <div className="bar-track">
                <div
                  className={`bar-fill ${rate !== null && rate < 60 ? "warn" : ""}`}
                  style={{ width: `${rate ?? 0}%` }}
                />
              </div>
              <p className="muted small" style={{ marginTop: 3, lineHeight: 1.5 }}>
                {MODE_HINT[m]}
              </p>
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginBottom: 18, lineHeight: 1.6 }}>
        どのモードも「1問につき1回」を記録した値なので横に並べて比べられます。ただし復習だけは母集団が
        「一度つまずいた問題」なので、演習より低く出るのが普通です。
        {byMode.has("practice") && " なお、反復学習をモードとして分けたのは今回からで、それ以前の反復ぶんは分野別演習に含まれています。"}
      </p>

      {modeCols.length > 1 && (
        <>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>大分類 × モード</p>
          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>分野</th>
                  {modeCols.map((m) => (
                    <th
                      key={m}
                      style={{ textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap" }}
                    >
                      {MODE_LABEL[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(MAJOR_LABEL) as Major[]).map((major) => {
                  const inner = byMajorMode.get(major);
                  return (
                    <tr key={major} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                        {MAJOR_LABEL[major]}
                      </td>
                      {modeCols.map((m) => {
                        const agg = inner?.get(m);
                        const r = rateOf(agg);
                        return (
                          <td
                            key={m}
                            style={{
                              textAlign: "right",
                              padding: "6px",
                              whiteSpace: "nowrap",
                              color:
                                r !== null && r < 60 ? "var(--warning-text)" : undefined,
                              fontWeight: r !== null && r < 60 ? 600 : undefined,
                            }}
                          >
                            {r !== null ? (
                              <>
                                {r}%
                                <span className="muted" style={{ fontSize: 11, marginLeft: 3 }}>
                                  ({agg!.n})
                                </span>
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginBottom: 18, lineHeight: 1.6 }}>
            括弧内は解答数。中分類はモードで割ると1桁件数のセルばかりになって読めないため、大分類でまとめています(中分類は下の「分野別の成績」＝全モード合算)。
          </p>
        </>
      )}

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

      {calcRows.length > 0 && (
        <>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>🧮 計算テーマ別の成績</p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 6 }}
          >
            {calcRows.map(({ theme, stat }) => {
              const rate = Math.round((stat.ok / stat.n) * 100);
              const avgSec =
                stat.timedN > 0 ? Math.round(stat.msTotal / stat.timedN / 1000) : null;
              const slow = avgSec !== null && avgSec > theme.targetSec;
              return (
                <button
                  key={theme.id}
                  onClick={() => goCalcTheme(theme.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                  aria-label={`${theme.name} 正答率${rate}%。このテーマを特訓する`}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      fontSize: 13,
                      marginBottom: 3,
                    }}
                  >
                    {/* 押せる行であることを他画面(ホーム・弱点トピック)と同じ記号で示す */}
                    <span
                      style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
                    >
                      {theme.icon} {theme.name}
                      <span style={{ color: "var(--text-3)" }} aria-hidden>
                        <IconChevronRight size={13} />
                      </span>
                    </span>
                    <span className="muted" style={{ whiteSpace: "nowrap" }}>
                      {avgSec !== null && (
                        <span
                          style={{
                            color: slow ? "var(--warning-text)" : "var(--success-text)",
                            fontWeight: 600,
                            marginRight: 6,
                          }}
                        >
                          ⏱{avgSec}秒
                        </span>
                      )}
                      {rate}%({stat.ok}/{stat.n})
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${rate < 60 ? "warn" : ""}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="muted small" style={{ marginBottom: 18, lineHeight: 1.6 }}>
            正答率は演習・模試も含めた全モードの計算問題から。⏱は計算ドリルで測った平均解答時間で、
            テーマの目標時間を超えていると橙色になります。行をタップするとそのテーマだけを特訓できます。
          </p>
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
