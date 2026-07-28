import { Fragment } from "react";
import type { AmQuestion } from "../data/types";
import { figureUrl, KANA, sourceOf } from "../data";
import { segmentText, type ResolvedMark } from "../lib/aiHighlight";

interface Props {
  question: AmQuestion;
  selected: number | null;
  answered: boolean;
  onSelect: (index: number) => void;
  /** 模試モードでは正誤の色付けをしない */
  revealAnswer?: boolean;
  /**
   * 選択肢の表示順(表示位置 d に choices[order[d]] を出す)。
   * 記号(ア〜エ)は表示位置に振り直す。onSelect には元の添字を渡すので、
   * 呼び出し側の正誤判定・記録は並び替えの影響を受けない。省略時は元の順。
   */
  order?: number[];
  /** AIが付けた重要箇所マーク(問題文・選択肢の文字範囲) */
  aiMarks?: ResolvedMark[];
}

/** マーク範囲を <mark> で包んで描画する(範囲が無ければ素のテキスト) */
function MarkedText({
  text,
  marks,
}: {
  text: string;
  marks: ResolvedMark[];
}) {
  if (marks.length === 0) return <>{text}</>;
  return (
    <>
      {segmentText(text, marks).map((s, i) =>
        s.mark ? (
          <mark
            key={i}
            className={s.mark.style === "underline" ? "ai-underline" : "ai-marker"}
            title={s.mark.note}
          >
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </>
  );
}

export default function QuestionCard({
  question: q,
  selected,
  answered,
  onSelect,
  revealAnswer = true,
  order,
  aiMarks = [],
}: Props) {
  const displayOrder = order ?? q.choices.map((_, i) => i);
  const textMarks = aiMarks.filter((m) => m.target === "text");
  return (
    <div>
      <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
        <MarkedText text={q.text} marks={textMarks} />
      </p>
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
        {displayOrder.map((oi, di) => {
          // oi=元データの添字(正誤判定・記録用), di=表示位置(記号ア〜エ用)
          const choice = q.choices[oi];
          const choiceMarks = aiMarks.filter((m) => m.target === oi);
          let cls = "choice";
          if (answered && revealAnswer) {
            if (oi === q.answer) cls += " choice-correct";
            else if (oi === selected) cls += " choice-wrong";
            else cls += " choice-dim";
          } else if (oi === selected) {
            cls += " choice-selected";
          }
          return (
            <button
              key={oi}
              className={cls}
              onClick={() => onSelect(oi)}
              disabled={answered && revealAnswer}
            >
              <span className="choice-kana">{KANA[di]}</span>
              <span style={{ flex: 1 }}>
                <MarkedText text={choice} marks={choiceMarks} />
              </span>
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
