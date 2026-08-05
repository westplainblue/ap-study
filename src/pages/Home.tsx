import { useState } from "react";
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
import { pickGreeting } from "../lib/greeting";
import { dueReviewIds, loadState, studyStats } from "../lib/progress";
import { dueVocabIds } from "../lib/vocab";

/** 用語ノートの絵文字アイコン(Icons.tsx は線画SVGなので、ここだけ絵文字で代用) */
function IconVocab({ size = 20 }: { size?: number }) {
  return (
    <span style={{ fontSize: size - 3, lineHeight: 1 }} aria-hidden>
      📒
    </span>
  );
}

/** 計算ドリルの絵文字アイコン(IconVocab と同じ理由で絵文字) */
function IconCalc({ size = 20 }: { size?: number }) {
  return (
    <span style={{ fontSize: size - 3, lineHeight: 1 }} aria-hidden>
      🧮
    </span>
  );
}

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}

/** 1日の演習ノルマ(問)。設定項目にはせず固定値(利用者の希望で30問) */
const DAILY_GOAL = 30;

/**
 * 今日のプラン。ホームを「メニューの一覧」から「今日やることの指示」に変える中核。
 * 復習(期日)→ことば(期日)→新規演習(ノルマ)の順で、終わったものには✓が付く。
 * どの行も1タップでそのまま学習が始まる。
 */
function TodayPlan({
  due,
  vocabDue,
  today,
  total,
}: {
  due: number;
  vocabDue: number;
  today: number;
  total: number;
}) {
  // 初回起動: プランを出しても「復習✓(やったことがないだけ)」になり嘘くさい。
  // 最初の一歩だけを指す。
  if (total === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 4 }}>ようこそ!</p>
        <p className="small muted" style={{ marginBottom: 12, lineHeight: 1.7 }}>
          まずは肩慣らしに10問。間違えた問題は自動で復習キューに入り、
          明日から「今日のプラン」に復習が並びます。
        </p>
        <Link to="/practice" className="btn btn-primary btn-block">
          最初の10問を始める
        </Link>
      </div>
    );
  }

  const practiceDone = today >= DAILY_GOAL;
  const tasks = [
    {
      key: "review",
      icon: <IconRefresh size={16} />,
      label: due > 0 ? "復習を片づける" : "復習",
      detail: due > 0 ? `${due}問` : "完了",
      cta: `復習を始める(${due}問)`,
      to: "/review/run",
      done: due === 0,
    },
    {
      key: "vocab",
      icon: <IconVocab size={16} />,
      label: vocabDue > 0 ? "ことばの復習" : "ことば",
      detail: vocabDue > 0 ? `${vocabDue}語` : "完了",
      cta: `ことばの復習を始める(${vocabDue}語)`,
      to: "/vocab/run",
      done: vocabDue === 0,
    },
    {
      key: "practice",
      icon: <IconPencil size={16} />,
      label: "新しい問題に挑戦",
      detail: practiceDone
        ? `${DAILY_GOAL}問 完了`
        : `${Math.min(today, DAILY_GOAL)}/${DAILY_GOAL}問`,
      cta:
        today > 0
          ? `演習へ(今日あと${DAILY_GOAL - today}問)`
          : `演習を始める(${DAILY_GOAL}問)`,
      to: "/practice",
      done: practiceDone,
    },
  ];
  const allDone = tasks.every((t) => t.done);
  // 「次にやる」= 上から最初の未完了タスク。順序自体が推奨順(復習→ことば→新規)
  const next = tasks.find((t) => !t.done);

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        borderColor: allDone ? "var(--success-text)" : "var(--accent)",
        background: allDone ? "var(--success-bg)" : "var(--accent-bg)",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 8 }}>
        {allDone ? "今日のプラン完了!" : "今日のプラン"}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className="list-row"
            aria-label={`${t.label} ${t.detail}${t.done ? "(完了)" : ""}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              opacity: t.done ? 0.6 : 1,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* 未完了はチェック欄(空枠)、完了は✓。塗り円だと欄に見えない */}
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  flex: "none",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  border: t.done ? "none" : "2px solid var(--border-strong)",
                  background: t.done ? "var(--success-bg)" : "transparent",
                  color: "var(--success-text)",
                }}
              >
                {t.done ? "✓" : ""}
              </span>
              {t.icon}
              <span style={{ fontWeight: 600 }}>{t.label}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                className="small"
                style={{
                  fontWeight: 700,
                  color: t.done ? "var(--success-text)" : "var(--accent-text)",
                }}
              >
                {t.detail}
              </span>
              <IconChevronRight size={15} />
            </span>
          </Link>
        ))}
      </div>

      {next ? (
        <>
          {/* 「どれから?」を考えさせない: 最初の未完了タスクをそのまま主ボタンに */}
          <Link
            to={next.to}
            className="btn btn-primary btn-block"
            style={{ marginTop: 10 }}
          >
            {next.cta}
          </Link>
        </>
      ) : (
        <p className="small" style={{ marginTop: 10, color: "var(--success-text)" }}>
          おつかれさま! 続けるなら <Link to="/calc">計算ドリル</Link> や{" "}
          <Link to="/mock">模試</Link> を。
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const state = loadState();
  const stats = studyStats(state);
  const due = dueReviewIds(state).length;
  const vocabDue = dueVocabIds(state).length;
  const examDate = state.settings.examDate;
  const left = examDate ? daysUntil(examDate) : null;
  const [greeting] = useState(() => pickGreeting(state));

  const achvRows = achievementRows(state);
  const achvUnlocked = achvRows.filter((r) => r.unlocked);
  const latest = [...achvUnlocked].sort(
    (a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)
  )[0];

  return (
    <div className="pc-wide">
      {/* PCではサイドバーにブランド表記があるので二重に出さない */}
      <p
        className="pc-hide"
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--accent-text)",
          letterSpacing: 0.5,
          marginBottom: 6,
          paddingRight: 48,
        }}
      >
        AP Study
      </p>
      <h1
        style={{
          fontSize: 19,
          marginBottom: 4,
          lineHeight: 1.5,
          paddingRight: 48, // 右上のAIボタンに文字が重ならないようにする
        }}
      >
        {greeting}
      </h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        {left !== null && left >= 0
          ? `応用情報技術者試験まで あと${left}日`
          : "設定画面で試験日を登録するとカウントダウンが表示されます"}
      </p>

      <TodayPlan
        due={due}
        vocabDue={vocabDue}
        today={stats.today}
        total={stats.total}
      />

      {/* 学習量の常設サマリー。今日のプラン導入時にフッター1行へ縮約したが、
          「常に見えていてほしい」という要望でプラン導入前の3枠表示を復元した */}
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
        state={{ scrollTo: "achievements" }}
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

      {/* PCでは2列に並べて縦スクロールを減らす(1024px未満は1列のまま) */}
      <div className="pc-grid-2">
        {[
          {
            to: "/practice",
            icon: IconPencil,
            label: "分野別演習(午前)",
            desc: "分野と問数を選んで演習",
          },
          {
            to: "/drill",
            icon: IconRefresh,
            label: "反復学習",
            desc: "正解するまで繰り返して定着",
          },
          {
            to: "/calc",
            icon: IconCalc,
            label: "計算ドリル",
            desc: "公式のテーマ別に計算問題を特訓",
          },
          {
            to: "/vocab",
            icon: IconVocab,
            label: "用語ノート",
            desc: "間違えた問題のことばを整理・復習",
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
