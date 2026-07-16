import { Link } from "react-router-dom";
import { IconChevronRight } from "../components/Icons";
import { EXAMS } from "../data";
import { pmRecords } from "../lib/progress";
import type { PmQuestion } from "../data/types";

function partCount(q: PmQuestion): number {
  return q.setumon.reduce((n, s) => n + s.parts.length, 0);
}

export default function PmList() {
  const hasAny = EXAMS.some((e) => e.pm.length > 0);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>午後演習</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>
        問題文を読んで解答を書き、模範解答と見比べて自己採点(○△×)します。
      </p>

      {!hasAny && (
        <div className="card">
          <p>午後問題のデータを準備中です。</p>
          <p className="muted small" style={{ marginTop: 4 }}>
            収録予定: 問1 情報セキュリティ(必須)+文系セット(経営戦略・プロマネ・サビマネ・監査)
          </p>
        </div>
      )}

      {EXAMS.filter((e) => e.pm.length > 0).map((exam) => (
        <div key={exam.examId} style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>{exam.label}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exam.pm.map((q) => {
              const total = partCount(q);
              const graded = Object.keys(pmRecords(q.id)).length;
              return (
                <Link
                  key={q.id}
                  to={`/pm/${q.id}`}
                  className="list-row"
                  style={{ textDecoration: "none", color: "inherit", padding: "12px 14px" }}
                >
                  <span>
                    <span style={{ fontWeight: 600 }}>
                      問{q.number} {q.field}
                    </span>
                    <br />
                    <span className="muted small">
                      {q.title}
                      {graded > 0 && ` ・自己採点 ${graded}/${total}`}
                    </span>
                  </span>
                  <IconChevronRight size={18} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
