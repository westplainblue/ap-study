import { todayStr } from "../lib/progress";

interface Props {
  /** YYYY-MM-DD → その日の解答数 */
  daily: Map<string, number>;
}

const WEEKS = 26; // 約6か月
const DAY_LABELS = ["", "月", "", "水", "", "金", ""];

function level(n: number): number {
  if (n === 0) return 0;
  if (n < 5) return 1;
  if (n < 10) return 2;
  if (n < 20) return 3;
  return 4;
}

/** GitHubの貢献グラフ風の学習量ヒートマップ(列=週、行=曜日) */
export default function ContributionGraph({ daily }: Props) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // 今週の日曜
  const start = new Date(weekStart);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);
  const todayS = todayStr();

  const weeks: { date: string; count: number | null }[][] = [];
  const monthLabels: string[] = [];
  let prevMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const sunday = new Date(start);
    sunday.setDate(start.getDate() + w * 7);
    const m = sunday.getMonth();
    monthLabels.push(m !== prevMonth ? `${m + 1}月` : "");
    prevMonth = m;
    const col: { date: string; count: number | null }[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(sunday);
      cur.setDate(sunday.getDate() + d);
      const ds = todayStr(cur);
      col.push({ date: ds, count: ds > todayS ? null : (daily.get(ds) ?? 0) });
    }
    weeks.push(col);
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 2, marginLeft: 26, height: 13 }}>
        {monthLabels.map((label, i) => (
          <div
            key={i}
            style={{
              width: 10,
              flexShrink: 0,
              fontSize: 9,
              color: "var(--text-3)",
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: 24,
            flexShrink: 0,
          }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              style={{
                height: 10,
                fontSize: 9,
                lineHeight: "10px",
                color: "var(--text-3)",
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((col, w) => (
          <div key={w} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {col.map((cell) =>
              cell.count === null ? (
                <div key={cell.date} style={{ width: 10, height: 10 }} />
              ) : (
                <div
                  key={cell.date}
                  className={`heat-cell heat-${level(cell.count)}`}
                  title={`${cell.date}: ${cell.count}問`}
                />
              )
            )}
          </div>
        ))}
      </div>
      <div
        className="small muted"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 8,
          justifyContent: "flex-end",
          fontSize: 11,
        }}
      >
        少
        {[0, 1, 2, 3, 4].map((lv) => (
          <span key={lv} className={`heat-cell heat-${lv}`} style={{ display: "inline-block" }} />
        ))}
        多
      </div>
    </div>
  );
}
