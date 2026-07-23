import { useLayoutEffect, useRef, useState } from "react";

export interface DayPoint {
  date: string; // YYYY-MM-DD
  n: number; // その日の解答数
  ok: number; // その日の正解数
}

interface Props {
  points: DayPoint[]; // 日付昇順
  average: number; // 全体正解率(0-100)。基準線として表示
}

const H = 184;
const PAD = { top: 16, right: 16, bottom: 26, left: 30 };
const GRID = [0, 25, 50, 75, 100];

function fmtMD(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 日別の正解率を折れ線で示すレスポンシブなSVGチャート。
 * 幅はコンテナに追従し(ResizeObserver)、色はテーマ変数でライト/ダーク両対応。
 */
export default function AccuracyTrend({ points, average }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const baseY = PAD.top + plotH;
  const yOf = (rate: number) => PAD.top + plotH * (1 - rate / 100);
  const xOf = (i: number) =>
    points.length <= 1
      ? PAD.left + plotW / 2
      : PAD.left + (plotW * i) / (points.length - 1);
  const rateOf = (p: DayPoint) => (p.n ? (p.ok / p.n) * 100 : 0);

  const linePts = points.map((p, i) => `${xOf(i)},${yOf(rateOf(p))}`).join(" ");
  const areaPath =
    points.length > 0
      ? `M ${xOf(0)},${baseY} ` +
        points.map((p, i) => `L ${xOf(i)},${yOf(rateOf(p))}`).join(" ") +
        ` L ${xOf(points.length - 1)},${baseY} Z`
      : "";

  // X軸ラベルは間引いて表示(先頭・末尾は必ず)
  const labelIdx = new Set<number>();
  if (points.length > 0) {
    const step = Math.max(1, Math.ceil(points.length / 5));
    for (let i = 0; i < points.length; i += step) labelIdx.add(i);
    labelIdx.add(points.length - 1);
  }
  const dotR = points.length > 40 ? 2 : points.length > 20 ? 2.6 : 3.4;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="正解率の推移(日別)">
          {GRID.map((g) => (
            <g key={g}>
              <line
                x1={PAD.left}
                y1={yOf(g)}
                x2={w - PAD.right}
                y2={yOf(g)}
                style={{ stroke: "var(--border)" }}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={yOf(g) + 3}
                textAnchor="end"
                style={{ fill: "var(--text-3)", fontSize: 10 }}
              >
                {g}
              </text>
            </g>
          ))}

          {areaPath && <path d={areaPath} style={{ fill: "var(--accent-bg)" }} />}

          {points.length > 1 && (
            <polyline
              points={linePts}
              style={{ fill: "none", stroke: "var(--accent)" }}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* 全体平均の基準線(面塗り・折れ線の上に重ねて常に見えるように) */}
          <line
            x1={PAD.left}
            y1={yOf(average)}
            x2={w - PAD.right}
            y2={yOf(average)}
            style={{ stroke: "var(--text-3)" }}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={w - PAD.right}
            y={yOf(average) - 4}
            textAnchor="end"
            style={{ fill: "var(--text-2)", fontSize: 10 }}
          >
            平均 {Math.round(average)}%
          </text>

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={xOf(i)}
              cy={yOf(rateOf(p))}
              r={dotR}
              style={{ fill: "var(--accent)" }}
            >
              <title>{`${fmtMD(p.date)}  ${Math.round(rateOf(p))}%(${p.ok}/${p.n}問)`}</title>
            </circle>
          ))}

          {points.map((p, i) =>
            labelIdx.has(i) ? (
              <text
                key={p.date}
                x={xOf(i)}
                y={H - 8}
                textAnchor="middle"
                style={{ fill: "var(--text-3)", fontSize: 10 }}
              >
                {fmtMD(p.date)}
              </text>
            ) : null
          )}
        </svg>
      )}
    </div>
  );
}
