import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { examLabel, figureUrl, pmQuestion } from "../data";
import {
  pmRecords,
  setPmGrade,
  type PmGrade,
  type PmPartRecord,
} from "../lib/progress";

const GRADES: { value: PmGrade; label: string; color: string; bg: string }[] = [
  { value: "o", label: "○", color: "var(--success-text)", bg: "var(--success-bg)" },
  { value: "d", label: "△", color: "var(--warning-text)", bg: "var(--warning-bg)" },
  { value: "x", label: "×", color: "var(--danger-text)", bg: "var(--danger-bg)" },
];

export default function PmDetail() {
  const { id } = useParams<{ id: string }>();
  const q = id ? pmQuestion(id) : undefined;
  const [records, setRecords] = useState<Record<string, PmPartRecord>>(() =>
    id ? pmRecords(id) : {}
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!q) {
    return (
      <div className="card">
        <p>問題が見つかりませんでした。</p>
        <Link to="/pm" className="btn btn-block" style={{ marginTop: 12 }}>
          午後演習へ戻る
        </Link>
      </div>
    );
  }

  const reveal = (key: string) => {
    setRevealed((prev) => new Set(prev).add(key));
  };

  const gradePart = (key: string, grade: PmGrade) => {
    setPmGrade(q.id, key, grade, drafts[key] ?? records[key]?.my);
    setRecords(pmRecords(q.id));
  };

  return (
    <div>
      <p className="muted small">{examLabel(q.examId)} 午後(IPA)</p>
      <h1 style={{ fontSize: 19, margin: "2px 0 4px" }}>
        問{q.number} {q.field}
      </h1>
      <p className="muted small" style={{ marginBottom: 14 }}>
        {q.title}
      </p>

      <p style={{ fontWeight: 600, marginBottom: 6 }}>問題文</p>
      <p className="muted small" style={{ marginBottom: 8 }}>
        セクションをタップすると開閉できます。設問を解きながら必要な箇所だけ開くと読みやすいです。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {q.sections.map((sec, i) => (
          <details
            key={i}
            open={i === 0}
            className="card"
            style={{ padding: "10px 14px" }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
              {sec.heading ?? `本文 ${i + 1}`}
            </summary>
            <p
              className="small"
              style={{ whiteSpace: "pre-wrap", lineHeight: 1.9, marginTop: 8 }}
            >
              {sec.body}
            </p>
            {sec.figure && (
              <img
                src={figureUrl(sec.figure)}
                alt={`${sec.heading ?? "本文"}の図表`}
                style={{ maxWidth: "100%", marginTop: 8, background: "#fff", borderRadius: 8 }}
              />
            )}
          </details>
        ))}
      </div>

      <p style={{ fontWeight: 600, marginBottom: 8 }}>設問</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.setumon.map((setu) => (
          <div key={setu.label} className="card">
            <p style={{ fontWeight: 700, marginBottom: 8 }}>{setu.label}</p>
            {setu.parts.map((part) => {
              const key = `${setu.label}:${part.label}`;
              const rec = records[key];
              const isOpen = revealed.has(key) || Boolean(rec);
              return (
                <div
                  key={key}
                  style={{
                    borderTop: "1px solid var(--border)",
                    padding: "10px 0",
                  }}
                >
                  <p className="small" style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>
                    <strong>{part.label}</strong> {part.question}
                  </p>
                  <textarea
                    rows={2}
                    placeholder="自分の解答を書いてみる(任意)"
                    style={{ width: "100%", fontSize: 14 }}
                    value={drafts[key] ?? rec?.my ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [key]: e.target.value }))
                    }
                  />
                  {!isOpen ? (
                    <button
                      className="btn btn-block"
                      style={{ marginTop: 8 }}
                      onClick={() => reveal(key)}
                    >
                      模範解答を見る
                    </button>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          background: "var(--surface-2)",
                          borderRadius: 8,
                          padding: "8px 12px",
                          marginBottom: 8,
                        }}
                      >
                        <p className="small" style={{ fontWeight: 600 }}>
                          模範解答(IPA公表)
                        </p>
                        <p className="small" style={{ whiteSpace: "pre-wrap" }}>
                          {part.answer}
                        </p>
                        {part.note && (
                          <p
                            className="muted small"
                            style={{ whiteSpace: "pre-wrap", marginTop: 4 }}
                          >
                            {part.note}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="muted small">自己採点:</span>
                        {GRADES.map((g) => (
                          <button
                            key={g.value}
                            onClick={() => gradePart(key, g.value)}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              fontSize: 18,
                              fontWeight: 700,
                              border:
                                rec?.grade === g.value
                                  ? `2px solid ${g.color}`
                                  : "1px solid var(--border-strong)",
                              background: rec?.grade === g.value ? g.bg : "var(--surface)",
                              color: g.color,
                            }}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Link to="/pm" className="btn btn-block" style={{ marginTop: 16 }}>
        午後演習の一覧へ戻る
      </Link>
    </div>
  );
}
