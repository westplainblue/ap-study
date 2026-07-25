import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { aiReady } from "../lib/aiConfig";
import { gradePmPart } from "../lib/aiGrade";
import { setPmAiScore } from "../lib/progress";
import { IconSparkle } from "./Icons";

interface Props {
  pmId: string;
  partKey: string;
  question: string;
  modelAnswer: string;
  note?: string;
  draft: string; // 現在の解答(空なら採点不可)
  savedFeedback?: string; // 保存済みのAI講評(あれば初期表示)
  onStart?: () => void; // 採点開始時(模範解答を開く等)
  onGraded?: () => void; // 採点保存後(records 再読込)
}

/** 午後の1設問をAIで自動採点する。評価は自己採点欄へ反映され、後から変更可能。 */
export default function PmAiGrade({
  pmId,
  partKey,
  question,
  modelAnswer,
  note,
  draft,
  savedFeedback,
  onStart,
  onGraded,
}: Props) {
  const ready = aiReady();
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canGrade = ready && draft.trim().length > 0 && !busy;
  const shown = busy ? stream : savedFeedback;

  const run = async () => {
    if (!canGrade) return;
    onStart?.();
    setError(null);
    setStream("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await gradePmPart({
        question,
        modelAnswer,
        note,
        userAnswer: draft,
        signal: ac.signal,
        onDelta: setStream,
      });
      setPmAiScore(pmId, partKey, res.grade, res.feedback, draft);
      onGraded?.();
      setStream("");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  if (!ready) {
    return (
      <p className="muted small" style={{ marginTop: 8 }}>
        <IconSparkle size={13} /> AIで採点するには{" "}
        <Link to="/settings" style={{ color: "var(--accent-text)" }}>
          設定でAIを登録
        </Link>
        してください。
      </p>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {busy ? (
          <button className="btn" onClick={() => abortRef.current?.abort()}>
            採点を停止
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => void run()}
            disabled={!canGrade}
            style={!canGrade ? { opacity: 0.5 } : undefined}
            title={draft.trim() ? undefined : "先に解答を入力してください"}
          >
            <IconSparkle size={15} /> {savedFeedback ? "AIで再採点" : "AIで採点"}
          </button>
        )}
        {savedFeedback && !busy && (
          <span className="muted small">AIの自動採点です(○△×は上で変更できます)</span>
        )}
      </div>

      {shown && (
        <div
          style={{
            background: "var(--accent-bg)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 8,
          }}
        >
          <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
            <IconSparkle size={13} /> AI採点
          </p>
          <p className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {shown}
            {busy && <span className="ai-cursor">▍</span>}
          </p>
          <p className="muted" style={{ fontSize: 10, marginTop: 6 }}>
            ※AIの採点は目安です。図表が絡む設問では精度が下がります。最終判断はご自身で。
          </p>
        </div>
      )}

      {error && (
        <p className="small" style={{ color: "var(--danger-text)", marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
