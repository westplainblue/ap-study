import { useLayoutEffect, useRef, useState } from "react";
import { nearestIndex } from "../lib/chart";

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
 *
 * ホバー/タップ/キーボードでその日の値を表示する。当たり判定は点(半径2〜3px)
 * ではなくプロット領域全体で、X座標から最も近い日にスナップする(nearestIndex)。
 * 点を直接狙わせるとデータが増えるほど当てられなくなるため。
 */
export default function AccuracyTrend({ points, average }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  // ホバー/フォーカスで選択中の日(null=非選択)
  const [active, setActive] = useState<number | null>(null);

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

  // データ1点のときは xOf が中央固定なので、実際の点の位置で判定する
  const pickAt = (clientX: number, svg: SVGSVGElement): number => {
    const rect = svg.getBoundingClientRect();
    return nearestIndex(clientX - rect.left, PAD.left, plotW, points.length);
  };

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const i = pickAt(e.clientX, e.currentTarget);
    if (i >= 0) setActive(i);
  };

  // マウスは離れたら消す。タッチは指を離すと pointerleave が飛ぶので、
  // 消すと一瞬しか見えない。最後に触れた日の値を残す。
  const handleLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setActive(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const last = points.length - 1;
    // 未選択から矢印キーを押したときは、直近の日(右端)から始める
    const cur = active ?? last;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(last, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault(); // 矢印キーでのページスクロールを抑止
    setActive(next);
  };

  const activePoint = active !== null ? points[active] : undefined;
  const activeRate = activePoint ? rateOf(activePoint) : 0;
  const activeX = active !== null ? xOf(active) : 0;
  const activeY = activePoint ? yOf(activeRate) : 0;
  // ツールチップの読み上げ・表示テキスト(値が主役、日付と内訳が従)
  const activeText = activePoint
    ? `${fmtMD(activePoint.date)} 正答率${Math.round(activeRate)}% ${activePoint.ok}/${activePoint.n}問`
    : "";

  // 右半分では右端基準に切り替える(幅を実測せずに画面外へのはみ出しを防ぐ)
  const flipX = active !== null && activeX > w / 2;
  // 点が上寄りのときは吹き出しを下に出す(グラフ上端での見切れを防ぐ)
  const below = activeY < PAD.top + 46;

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      {w > 0 && (
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={
            points.length > 0
              ? "正解率の推移(日別)。グラフ上をなぞるか、フォーカス中に左右キーで各日の値を表示します。"
              : "正解率の推移(日別)"
          }
          tabIndex={0}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={handleLeave}
          onKeyDown={handleKeyDown}
          onBlur={() => setActive(null)}
          style={{ touchAction: "pan-y", outline: "none", display: "block" }}
        >
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

          {/* 選択中の日のガイド線(点より先に描いて背面へ) */}
          {activePoint && (
            <line
              x1={activeX}
              y1={PAD.top}
              x2={activeX}
              y2={baseY}
              style={{ stroke: "var(--text-3)" }}
              strokeWidth={1}
            />
          )}

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={xOf(i)}
              cy={yOf(rateOf(p))}
              r={dotR}
              style={{ fill: "var(--accent)" }}
            />
          ))}

          {/* 選択中の点を拡大し、背景色のリングで折れ線から浮かせる */}
          {activePoint && (
            <circle
              cx={activeX}
              cy={activeY}
              r={dotR + 2.5}
              style={{ fill: "var(--accent)", stroke: "var(--surface)" }}
              strokeWidth={2}
            />
          )}

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

      {/* 値の吹き出し。HTMLで描くのはテーマ変数と角丸・影をそのまま使えるため
          (SVGだと日本語の折返しに合わせた背景矩形の幅を手計算することになる) */}
      {activePoint && (
        <div
          aria-hidden // 読み上げは下のライブリージョンが担当(二重読みを防ぐ)
          style={{
            position: "absolute",
            ...(flipX ? { right: w - activeX } : { left: activeX }),
            ...(below ? { top: activeY + 14 } : { bottom: H - activeY + 14 }),
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
            padding: "6px 10px",
            pointerEvents: "none", // 吹き出し自身がポインタを奪わないように
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
            {Math.round(activeRate)}%
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
            {fmtMD(activePoint.date)} ・ {activePoint.ok}/{activePoint.n}問
          </div>
        </div>
      )}

      {/* 選択が変わるたびに読み上げる。吹き出しは数字と日付が別要素で読み上げ順が
          崩れるため、文として整えたこちらを唯一の読み上げ元にしている */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {activeText}
      </span>
    </div>
  );
}
