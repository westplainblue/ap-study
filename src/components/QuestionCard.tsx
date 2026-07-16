import type { AmQuestion } from "../data/types";
import { figureUrl, KANA, sourceOf } from "../data";

interface Props {
  question: AmQuestion;
  selected: number | null;
  answered: boolean;
  onSelect: (index: number) => void;
  /** 模試モードでは正誤の色付けをしない */
  revealAnswer?: boolean;
}

export default function QuestionCard({
  question: q,
  selected,
  answered,
  onSelect,
  revealAnswer = true,
}: Props) {
  return (
    <div>
      <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{q.text}</p>
      {q.figure && (
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            marginBottom: 12,
          }}
        >
          <img
            src={figureUrl(q.figure)}
            alt={`問${q.number}の図表`}
            style={{ maxWidth: "100%", display: "block", margin: "0 auto" }}
          />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.choices.map((choice, i) => {
          let cls = "choice";
          if (answered && revealAnswer) {
            if (i === q.answer) cls += " choice-correct";
            else if (i === selected) cls += " choice-wrong";
            else cls += " choice-dim";
          } else if (i === selected) {
            cls += " choice-selected";
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => onSelect(i)}
              disabled={answered && revealAnswer}
            >
              <span className="choice-kana">{KANA[i]}</span>
              <span style={{ flex: 1 }}>{choice}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        出典: {sourceOf(q)}(IPA)
      </p>
    </div>
  );
}
