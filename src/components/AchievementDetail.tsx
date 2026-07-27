import { useEffect } from "react";
import type { AchvRow, Glyph, Tier } from "../lib/achievements";
import Badge from "./Badge";
import { IconX } from "./Icons";

const TIER_LABEL: Record<Tier, string> = {
  bronze: "ブロンズ",
  silver: "シルバー",
  gold: "ゴールド",
  platinum: "プラチナ",
  diamond: "ダイヤモンド",
};

const GLYPH_LABEL: Record<Glyph, string> = {
  volume: "演習量",
  revenge: "リベンジ",
  streak: "継続",
  coverage: "網羅",
  mastery: "マスタリー",
  recurring: "習慣",
  challenge: "挑戦",
  pm: "午後",
  first: "マイルストーン",
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 実績カードをタップしたときに出す詳細ダイアログ */
export default function AchievementDetail({
  row,
  onClose,
}: {
  row: AchvRow;
  onClose: () => void;
}) {
  const { def, unlocked, unlockedAt, value, goal, ratio } = row;

  // Escで閉じる + 背面のスクロールを止める
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // 達成条件が「する/しない」の実績(goal=1)は数値より状態表示のほうが分かりやすい
  const showNumbers = goal > 1;
  const shown = Math.min(value, goal);
  const remaining = Math.max(0, goal - value);
  const pct = Math.round(ratio * 100);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`実績 ${def.name} の詳細`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="閉じる" onClick={onClose}>
          <IconX size={18} />
        </button>

        <Badge
          tier={def.tier}
          glyph={def.glyph}
          size={104}
          state={unlocked ? "unlocked" : ratio > 0 ? "progress" : "locked"}
          progress={ratio}
        />

        <p style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>{def.name}</p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <span className="chip">{TIER_LABEL[def.tier]}</span>
          <span className="chip">{GLYPH_LABEL[def.glyph]}</span>
        </div>

        <p
          className="small"
          style={{ marginTop: 12, lineHeight: 1.7, color: "var(--text-2)" }}
        >
          {def.hint}
        </p>

        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: 10,
            padding: "12px 14px",
            marginTop: 14,
            textAlign: "left",
          }}
        >
          {showNumbers ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 6,
                }}
              >
                <span className="small" style={{ fontWeight: 600 }}>
                  進捗
                </span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {shown.toLocaleString()} / {goal.toLocaleString()}
                  <span className="muted small" style={{ marginLeft: 6 }}>
                    {pct}%
                  </span>
                </span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                {unlocked
                  ? `達成済み(現在 ${value.toLocaleString()})`
                  : `解除まであと ${remaining.toLocaleString()}`}
              </p>
            </>
          ) : (
            <p className="small" style={{ fontWeight: 600 }}>
              {unlocked ? "条件を達成しました" : "まだ達成していません"}
            </p>
          )}
        </div>

        <p
          className="small"
          style={{
            marginTop: 12,
            fontWeight: 600,
            color: unlocked ? "var(--success-text)" : "var(--text-3)",
          }}
        >
          {unlocked
            ? unlockedAt
              ? `🎉 ${formatDate(unlockedAt)} に解除`
              : "🎉 解除済み"
            : "🔒 未解除"}
        </p>
      </div>
    </div>
  );
}
