import { useMemo, useState } from "react";
import { achievementRows, type AchvRow } from "../lib/achievements";
import { loadState } from "../lib/progress";
import Badge from "./Badge";

type Filter = "all" | "unlocked" | "locked";

export default function AchievementGrid() {
  const rows = useMemo(() => achievementRows(loadState()), []);
  const [filter, setFilter] = useState<Filter>("all");

  const unlocked = rows.filter((r) => r.unlocked).length;
  const sorted = useMemo(() => {
    const done = rows
      .filter((r) => r.unlocked)
      .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0));
    const todo = rows
      .filter((r) => !r.unlocked)
      .sort((a, b) => b.ratio - a.ratio); // 解除に近い順(モチベーション)
    return [...done, ...todo];
  }, [rows]);

  const shown = sorted.filter((r) =>
    filter === "all" ? true : filter === "unlocked" ? r.unlocked : !r.unlocked
  );

  const filters: [Filter, string][] = [
    ["all", "すべて"],
    ["unlocked", "解除済み"],
    ["locked", "未解除"],
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <p style={{ fontWeight: 600 }}>実績</p>
        <span className="muted small">
          {unlocked} / {rows.length} 解除
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {filters.map(([f, label]) => (
          <button
            key={f}
            className={`chip-toggle ${filter === f ? "on" : ""}`}
            style={{ fontSize: 12, padding: "5px 10px" }}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        {shown.map((r) => (
          <AchvCard key={r.def.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function AchvCard({ row }: { row: AchvRow }) {
  const { def, unlocked, ratio } = row;
  return (
    <div
      className="card"
      style={{
        padding: "12px 8px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 4,
        opacity: unlocked ? 1 : 0.72,
        borderColor: unlocked ? "var(--accent)" : "var(--border)",
        background: unlocked ? "var(--accent-bg)" : "var(--surface)",
      }}
      title={def.hint}
    >
      <Badge
        tier={def.tier}
        glyph={def.glyph}
        size={58}
        state={unlocked ? "unlocked" : "locked"}
      />
      <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>
        {def.name}
      </div>
      <div className="muted" style={{ fontSize: 9.5, lineHeight: 1.25 }}>
        {def.hint}
      </div>
      {!unlocked && ratio > 0 && (
        <div className="bar-track" style={{ width: "100%", marginTop: 2 }}>
          <div className="bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
