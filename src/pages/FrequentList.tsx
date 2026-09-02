import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconChevronRight } from "../components/Icons";
import { AM_QUESTIONS, EXAMS, examLabel, shortExamLabel } from "../data";
import { MAJOR_LABEL, type Major } from "../data/types";
import {
  filterFrequentByMajor,
  FREQUENT_GROUPS,
  pickFrequentQuestions,
  statsByFrequentGroup,
  type FrequentGroup,
  type FrequentGroupStat,
} from "../lib/frequent";
import { loadState } from "../lib/progress";
import { clearRun } from "../lib/run";

const MAJORS: Major[] = ["T", "M", "S"];
const COUNTS = [10, 20];

/** 出題する問題IDを保存して出題画面へ */
function useStartFrequent() {
  const navigate = useNavigate();
  return (ids: string[]) => {
    clearRun("frequent"); // 新しく始めるので前回の途中状態は破棄する
    sessionStorage.setItem("ap-frequent", JSON.stringify({ ids }));
    navigate("/frequent/run");
  };
}

/** グループの解答状況(未解答 / 直近正解 / 直近不正解) */
function StatusMark({ stat }: { stat: FrequentGroupStat | undefined }) {
  if (!stat) {
    return (
      <span className="small muted" style={{ whiteSpace: "nowrap" }}>
        未解答
      </span>
    );
  }
  return (
    <span
      className="small"
      style={{
        whiteSpace: "nowrap",
        fontWeight: 700,
        color: stat.lastOk ? "var(--success-text)" : "var(--danger-text)",
      }}
      title={`${stat.n}回解答 / ${stat.ok}回正解`}
    >
      {stat.lastOk ? "○ 正解" : "× 不正解"}
      <span className="muted" style={{ fontWeight: 400 }}>
        {" "}
        {stat.ok}/{stat.n}
      </span>
    </span>
  );
}

function GroupRow({
  group: g,
  stat,
  onSolve,
}: {
  group: FrequentGroup;
  stat: FrequentGroupStat | undefined;
  onSolve: () => void;
}) {
  const exams = g.questions.map((q) => shortExamLabel(examLabel(q.examId))).join("・");
  return (
    <button
      type="button"
      className="list-row"
      onClick={onSolve}
      aria-label={`${g.count}回出題 ${g.latest.middle} ${g.latest.text.slice(0, 40)} を解く`}
      style={{ alignItems: "flex-start" }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            className="small"
            style={{
              fontWeight: 800,
              color: g.count >= 3 ? "var(--danger-text)" : "var(--accent-text)",
              whiteSpace: "nowrap",
            }}
          >
            {g.count}回出題
          </span>
          <span className="chip">{g.latest.middle}</span>
          <StatusMark stat={stat} />
        </span>
        {/* 問題文は2行で省略(一覧性を優先。全文は解く画面で読める) */}
        <span
          className="small"
          style={{
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {g.latest.text}
        </span>
        <span className="muted small">{exams}</span>
      </span>
      <IconChevronRight size={18} />
    </button>
  );
}

export default function FrequentList() {
  const start = useStartFrequent();
  const [majors, setMajors] = useState<Set<Major>>(new Set());
  const [count, setCount] = useState<number | "all">(10);
  const [unsolvedFirst, setUnsolvedFirst] = useState(true);
  // 解答履歴からグループ別の成績を導出(モード不問。別の回の版を解いていても合算)
  const stats = useMemo(() => statsByFrequentGroup(loadState().attempts), []);

  const groups = filterFrequentByMajor(FREQUENT_GROUPS, [...majors]);
  const totalQuestions = FREQUENT_GROUPS.reduce((n, g) => n + g.questions.length, 0);
  const solvedGroups = groups.filter((g) => stats.has(g.id)).length;
  const pickCount = count === "all" ? groups.length : Math.min(count, groups.length);

  const toggleMajor = (m: Major) => {
    const next = new Set(majors);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMajors(next);
  };

  const startPicked = () => {
    const qs = pickFrequentQuestions(groups, pickCount, { unsolvedFirst, stats });
    start(qs.map((q) => q.id));
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>🔁 頻出問題</h1>
      <p className="muted small" style={{ marginBottom: 12, lineHeight: 1.7 }}>
        収録{EXAMS.length}回分({AM_QUESTIONS.length}問)の過去問を解析し、問題文と選択肢が
        ほぼ同じ問題が複数回出題されたものを回数の多い順に並べました。同じ問題は今後も出る可能性が
        高いので、確実に得点できるようにしておきましょう。
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {[
          { label: "再出題の問題", value: `${FREQUENT_GROUPS.length}組` },
          { label: "のべ問数", value: `${totalQuestions}問` },
          { label: "解答済み", value: `${solvedGroups}/${groups.length}組` },
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
            <p style={{ fontSize: 18, fontWeight: 700 }}>{m.value}</p>
          </div>
        ))}
      </div>

      <p style={{ fontWeight: 600, marginBottom: 6 }}>大分類</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {MAJORS.map((m) => {
          const n = filterFrequentByMajor(FREQUENT_GROUPS, [m]).length;
          return (
            <button
              key={m}
              className={`chip-toggle ${majors.has(m) ? "on" : ""}`}
              onClick={() => toggleMajor(m)}
              disabled={n === 0}
            >
              {MAJOR_LABEL[m]} ({n})
            </button>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>出題数</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {COUNTS.map((c) => (
            <button
              key={c}
              className={`chip-toggle ${count === c ? "on" : ""}`}
              style={{ flex: 1, padding: "8px 0" }}
              onClick={() => setCount(c)}
              disabled={groups.length === 0}
            >
              {c}問
            </button>
          ))}
          <button
            className={`chip-toggle ${count === "all" ? "on" : ""}`}
            style={{ flex: 1, padding: "8px 0" }}
            onClick={() => setCount("all")}
            disabled={groups.length === 0}
          >
            全部({groups.length}問)
          </button>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={unsolvedFirst}
          className={`chip-toggle ${unsolvedFirst ? "on" : ""}`}
          style={{
            width: "100%",
            padding: "10px 0",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onClick={() => setUnsolvedFirst((v) => !v)}
        >
          {unsolvedFirst ? "☑" : "☐"} まだ解いていない問題を先に出す
        </button>
        <p className="muted small" style={{ marginBottom: 14, lineHeight: 1.7 }}>
          出題回数の多い順に、各問題の最新の回の版を出題します。
          {unsolvedFirst
            ? "一度でも解いた問題(別の回の版を含む)は後ろに回します。"
            : "解いたことがある問題も回数順のまま出題します。"}
        </p>

        <button
          className="btn btn-primary btn-block"
          onClick={startPicked}
          disabled={pickCount === 0}
        >
          頻出問題を解く({pickCount}問)
        </button>
      </div>

      <p style={{ fontWeight: 600, marginBottom: 6 }}>
        一覧(出題回数順)
        <span className="muted small" style={{ fontWeight: 400, marginLeft: 6 }}>
          タップするとその問題を解けます
        </span>
      </p>
      {groups.length === 0 ? (
        <div className="card">
          <p className="small muted">この大分類には再出題された問題がありません。</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              stat={stats.get(g.id)}
              onSolve={() => start([g.latest.id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
