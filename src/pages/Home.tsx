import { Link } from "react-router-dom";
import {
  IconChevronRight,
  IconClock,
  IconDoc,
  IconPencil,
  IconRefresh,
  IconStar,
} from "../components/Icons";
import Badge from "../components/Badge";
import { achievementRows, totalCount } from "../lib/achievements";
import { dueReviewIds, loadState, studyStats } from "../lib/progress";

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

export default function Home() {
  const state = loadState();
  const stats = studyStats(state);
  const due = dueReviewIds(state).length;
  const examDate = state.settings.examDate;
  const left = examDate ? daysUntil(examDate) : null;

  const achvRows = achievementRows(state);
  const achvUnlocked = achvRows.filter((r) => r.unlocked);
  const latest = [...achvUnlocked].sort(
    (a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)
  )[0];

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>AP Study</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        {left !== null && left >= 0
          ? `応用情報技術者試験まで あと${left}日`
          : "設定画面で試験日を登録するとカウントダウンが表示されます"}
      </p>

      <Link
        to="/review/run"
        className="card"
        style={{
          display: "block",
          background: due > 0 ? "var(--accent-bg)" : "var(--surface)",
          borderColor: due > 0 ? "var(--accent)" : "var(--border)",
          marginBottom: 12,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <p
          className="small"
          style={{ color: "var(--accent-text)", fontWeight: 600, marginBottom: 2 }}
        >
          <IconRefresh size={15} /> 今日の復習
        </p>
        <p
          style={{
            fontWeight: 600,
            color: due > 0 ? "var(--accent-text)" : "var(--text-2)",
          }}
        >
          {due > 0 ? `${due}問が復習どき → 始める` : "今日の復習はありません"}
        </p>
      </Link>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { label: "連続学習", value: `${stats.streak}日` },
          { label: "累計演習", value: `${stats.total}問` },
          { label: "今日", value: `${stats.today}問` },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: "var(--surface-2)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <p className="small muted">{m.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{m.value}</p>
          </div>
        ))}
      </div>

      <Link
        to="/stats"
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Badge
          tier={latest ? latest.def.tier : "bronze"}
          glyph={latest ? latest.def.glyph : "first"}
          size={40}
          state={latest ? "unlocked" : "locked"}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="small"
            style={{ color: "var(--accent-text)", fontWeight: 600, marginBottom: 2 }}
          >
            <IconStar size={14} /> 実績 {achvUnlocked.length} / {totalCount()}
          </p>
          <p
            style={{
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {latest ? `最新: ${latest.def.name}` : "最初の1問で実績を解除しよう"}
          </p>
        </div>
        <IconChevronRight size={18} />
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          {
            to: "/practice",
            icon: IconPencil,
            label: "分野別演習(午前)",
            desc: "分野と問数を選んで演習",
          },
          { to: "/pm", icon: IconDoc, label: "午後演習", desc: "長文読解と自己採点" },
          { to: "/mock", icon: IconClock, label: "模試モード", desc: "80問150分の通し演習" },
        ].map(({ to, icon: Icon, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="list-row"
            style={{ textDecoration: "none", color: "inherit", padding: "12px 14px" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon size={20} />
              <span>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <br />
                <span className="muted small">{desc}</span>
              </span>
            </span>
            <IconChevronRight size={18} />
          </Link>
        ))}
      </div>
    </div>
  );
}
