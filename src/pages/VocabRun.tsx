import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconCheck, IconX } from "../components/Icons";
import KeyHint from "../components/KeyHint";
import { amQuestion, examLabel, KANA } from "../data";
import {
  loadTermsData,
  type TermCard,
  type TermsData,
} from "../data/terms";
import { useAnswerKeys } from "../hooks/useAnswerKeys";
import { isPlainKey, isTypingTarget } from "../lib/keys";
import { loadState, MAX_BOX, type VocabEntry } from "../lib/progress";
import { setVocabMode, vocabMode, type VocabMode } from "../lib/ui";
import {
  dueVocabIds,
  reconcileVocabFromStorage,
  recordVocabAnswer,
} from "../lib/vocab";

/** 1セッションの出題上限(dueVocabIds の先頭から) */
export const QUIZ_SESSION_MAX = 20;

/** ことばドリルの1問。選択肢は組み立て時にシャッフル済みで、表示中は固定 */
export interface QuizItem {
  termId: string;
  card: TermCard;
  /** true=定義文を見て用語を選ぶ / false=用語を見て定義文を選ぶ */
  askTerm: boolean;
  choices: string[];
  answer: number; // choices 内の正解添字
  fromBox: number; // セッション開始時の箱(結果画面の遷移表示用)
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 誤答肢の候補プール(優先順)から、正解と重複しないものを最大 n 件選ぶ。
 * 先頭のプールで足りなければ次のプールへ進む(同一 middle → 全体、の順で渡す)。
 */
function pickDistinct(
  pools: string[][],
  correct: string,
  n: number,
  rng: () => number
): string[] {
  const out: string[] = [];
  const used = new Set([correct]);
  for (const pool of pools) {
    for (const s of shuffle(pool, rng)) {
      if (out.length >= n) return out;
      if (used.has(s)) continue;
      used.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * ことばドリルの出題を組み立てる(純粋関数。テストは rng を注入して検証する)。
 *
 * カードの由来と箱で出題形式を変える:
 * - choice-def かつ box<=2: 定義文→用語。誤答肢は元問題の誤答選択肢(高品質)
 * - choice-def かつ box>=3: 用語→定義文。誤答肢は文字数±50%の他カードの定義
 *   (同一 middle を優先し、足りなければ全体から)
 * - text-def / point-pair: 定義文→用語。誤答肢は同一 middle の他カードの用語
 *   (足りなければ全体から)
 *
 * 選択肢の並びは組み立て時に一度だけシャッフルする(正解位置の偏り防止)。
 */
export function buildQuizItems(
  termIds: string[],
  data: TermsData,
  vocab: Record<string, VocabEntry>,
  rng: () => number = Math.random
): QuizItem[] {
  const items: QuizItem[] = [];
  for (const termId of termIds) {
    const card = data.byId.get(termId);
    const entry = vocab[termId];
    if (!card || !entry) continue; // 辞書更新でカードが消えた等はスキップ
    const sameMiddle = data.cards.filter(
      (c) => c.id !== card.id && c.middle === card.middle
    );
    const others = data.cards.filter((c) => c.id !== card.id);
    let askTerm: boolean;
    let correct: string;
    let wrongs: string[];
    if (
      card.source === "choice-def" &&
      entry.box <= 2 &&
      (card.distractors?.length ?? 0) >= 3
    ) {
      askTerm = true;
      correct = card.term;
      wrongs = shuffle(card.distractors!, rng).slice(0, 3);
    } else if (card.source === "choice-def") {
      // 定着してきたら逆向きに問う。見た目で選べないよう文字数の近い定義を混ぜる
      askTerm = false;
      correct = card.def;
      const near = (c: TermCard) =>
        c.def.length >= card.def.length * 0.5 &&
        c.def.length <= card.def.length * 1.5;
      wrongs = pickDistinct(
        [
          sameMiddle.filter(near).map((c) => c.def),
          others.filter(near).map((c) => c.def),
          others.map((c) => c.def),
        ],
        correct,
        3,
        rng
      );
    } else {
      askTerm = true;
      correct = card.term;
      wrongs = pickDistinct(
        [sameMiddle.map((c) => c.term), others.map((c) => c.term)],
        correct,
        3,
        rng
      );
    }
    const choices = shuffle([correct, ...wrongs], rng);
    items.push({
      termId,
      card,
      askTerm,
      choices,
      answer: choices.indexOf(correct),
      fromBox: entry.box,
    });
  }
  return items;
}

/** 出典表示(例: 令和7年度 秋期 問12)。問題が引けなければIDのまま */
function sourceLabel(card: TermCard): string {
  const q = amQuestion(card.defQid);
  return q ? `${examLabel(q.examId)} 問${q.number}` : card.defQid;
}

interface QuizResult {
  termId: string;
  term: string;
  ok: boolean;
  from: number;
  to: number;
}

/**
 * ことばドリル: 期日を迎えた用語を復習する(1問ごとに保存される)。
 * 出題形式は2つ(端末内設定 `ap-study:ui` に保存):
 * - choice: 4択で選ぶ(既定)。誤答肢との弁別も鍛えられる
 * - flip:   思い出してからめくって自己採点。選択肢のヒントが無いぶん想起が深い
 */
export default function VocabRun() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [mode, setMode] = useState<VocabMode>(() => vocabMode());
  const [flipped, setFlipped] = useState(false);

  // 辞書を読み込んでから出題を組み立てる(直接このURLを開いた場合にも備える)
  useEffect(() => {
    let alive = true;
    loadTermsData().then((data) => {
      if (!alive) return;
      reconcileVocabFromStorage(); // 導出漏れがあれば補う(冪等)
      const s = loadState();
      setItems(
        buildQuizItems(dueVocabIds(s).slice(0, QUIZ_SESSION_MAX), data, s.vocab ?? {})
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // --- 操作ハンドラとキーボード。早期リターンより前に置く(フック数を変えない) ---
  const curItem = items?.[idx];
  const answered = selected !== null;

  const handleSelect = (i: number) => {
    if (answered || !curItem) return;
    setSelected(i);
    const ok = i === curItem.answer;
    recordVocabAnswer(curItem.termId, ok); // 1問ごとに保存(途中離脱しても失われない)
    const to = ok ? (curItem.fromBox >= MAX_BOX ? 5 : curItem.fromBox + 1) : 1;
    setResults((r) => [
      ...r,
      { termId: curItem.termId, term: curItem.card.term, ok, from: curItem.fromBox, to },
    ]);
  };

  const handleNext = () => {
    if (!items) return;
    if (idx + 1 >= items.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setSelected(null);
      setFlipped(false);
    }
  };

  /** めくった後の自己採点。答えは表示済みなので確認を挟まず次の語へ進む */
  const handleFlipGrade = (ok: boolean) => {
    if (!flipped || !curItem || !items) return;
    recordVocabAnswer(curItem.termId, ok);
    const to = ok ? (curItem.fromBox >= MAX_BOX ? 5 : curItem.fromBox + 1) : 1;
    setResults((r) => [
      ...r,
      { termId: curItem.termId, term: curItem.card.term, ok, from: curItem.fromBox, to },
    ]);
    setFlipped(false);
    if (idx + 1 >= items.length) setFinished(true);
    else setIdx(idx + 1);
  };

  // 4択モードのキーボード(1〜4で選択、Enterで次へ)
  useAnswerKeys({
    enabled: mode === "choice" && !finished && Boolean(curItem),
    choiceCount: curItem?.choices.length ?? 0,
    onPick: handleSelect,
    onNext: answered ? handleNext : undefined,
  });

  // めくりモードのキーボード(Space/Enterでめくる、1/2で自己採点)
  useEffect(() => {
    if (mode !== "flip" || finished || !curItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(document.activeElement)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (flipped && (e.key === "1" || e.key === "j" || e.key === "J")) {
        e.preventDefault();
        handleFlipGrade(true);
        return;
      }
      if (flipped && (e.key === "2" || e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleFlipGrade(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFlipGrade は依存の items/idx/flipped から決まる
  }, [mode, finished, curItem, flipped, idx, items]);

  if (items === null) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>ことばドリル</h1>
        <p className="muted small">読み込み中…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>ことばドリル</h1>
        <div className="card">
          <p>今日のことばの復習はありません。</p>
          <p className="muted small" style={{ marginTop: 4 }}>
            演習で間違えた問題から、復習することばが自動で集まります。
          </p>
          <Link to="/vocab" className="btn btn-block" style={{ marginTop: 12 }}>
            用語ノートへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (finished) {
    const correct = results.filter((r) => r.ok).length;
    const ups = results.filter((r) => r.to > r.from);
    const downs = results.filter((r) => r.to < r.from);
    const boxLabel = (b: number) => (b === 5 ? "卒業" : `箱${b}`);
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>ことばドリルの結果</h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 32, fontWeight: 700 }}>
            {correct} / {results.length} 語正解
          </p>
          <p className="muted">
            正解すると箱が上がり、次の出題間隔が延びます。
          </p>
        </div>
        {ups.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>箱が上がった語</p>
            {ups.map((r) => (
              <div
                key={r.termId}
                className="small"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "3px 0",
                }}
              >
                <span>{r.term}</span>
                <span style={{ color: "var(--success-text)", fontWeight: 600 }}>
                  {boxLabel(r.from)} → {boxLabel(r.to)}
                </span>
              </div>
            ))}
          </div>
        )}
        {downs.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>箱が下がった語</p>
            {downs.map((r) => (
              <div
                key={r.termId}
                className="small"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "3px 0",
                }}
              >
                <span>{r.term}</span>
                <span style={{ color: "var(--danger-text)", fontWeight: 600 }}>
                  {boxLabel(r.from)} → {boxLabel(r.to)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/vocab" className="btn btn-primary btn-block">
            ノートへ戻る
          </Link>
          <Link to="/" className="btn btn-block">
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const cur = items[idx];
  const isCorrect = answered && selected === cur.answer;
  const liveCorrect = results.filter((r) => r.ok).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          paddingRight: 48,
        }}
      >
        <span className="chip">{cur.card.middle}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted small">
            {idx + 1} / {items.length} 語
          </span>
          <button
            className="small"
            style={{
              padding: "3px 9px",
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              color: "var(--text-2)",
            }}
            onClick={() => navigate("/vocab")}
          >
            やめる
          </button>
        </span>
      </div>
      <div className="progress-track" style={{ marginBottom: 6 }}>
        <div
          className="progress-fill"
          style={{
            width: `${((idx + (answered ? 1 : 0)) / items.length) * 100}%`,
          }}
        />
      </div>
      <p className="muted small" style={{ marginBottom: 10 }}>
        {results.length > 0
          ? `正解 ${liveCorrect} / ${results.length}`
          : "解答は1語ごとに保存されます。途中でやめても大丈夫。"}
      </p>

      {/* 出題形式の切替(端末内保存)。答えを見た後の切替は二重記録になるので不可 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(
          [
            ["choice", "4択で選ぶ"],
            ["flip", "思い出してめくる"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            className={`chip-toggle ${mode === m ? "on" : ""}`}
            disabled={answered || flipped}
            onClick={() => {
              setMode(m);
              setVocabMode(m);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p className="muted small" style={{ marginBottom: 4 }}>
          {mode === "flip"
            ? cur.askTerm
              ? "この説明の用語を思い出せますか?"
              : "この用語の説明を思い出せますか?"
            : cur.askTerm
              ? "この説明にあてはまる用語はどれ?"
              : "この用語の説明として正しいものはどれ?"}
        </p>
        {cur.askTerm ? (
          <p style={{ lineHeight: 1.8 }}>{cur.card.def}</p>
        ) : (
          <>
            <p style={{ fontSize: 18, fontWeight: 700 }}>{cur.card.term}</p>
            {cur.card.reading && (
              <p className="muted small">{cur.card.reading}</p>
            )}
          </>
        )}
      </div>

      {mode === "choice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cur.choices.map((choice, i) => {
            let cls = "choice";
            if (answered) {
              if (i === cur.answer) cls += " choice-correct";
              else if (i === selected) cls += " choice-wrong";
              else cls += " choice-dim";
            }
            return (
              <button
                key={i}
                className={cls}
                onClick={() => handleSelect(i)}
                disabled={answered}
              >
                <span className="choice-kana">{KANA[i]}</span>
                <span style={{ flex: 1 }}>{choice}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode === "choice" && answered && (
        <div style={{ marginTop: 14 }}>
          <div className={isCorrect ? "banner banner-ok" : "banner banner-ng"}>
            {isCorrect ? <IconCheck size={18} /> : <IconX size={18} />}
            <span>
              {isCorrect ? "正解!" : "不正解…"} 答えは「{KANA[cur.answer]}」
            </span>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>
              {cur.card.term}
              {cur.card.reading && (
                <span className="muted small" style={{ fontWeight: 400 }}>
                  ({cur.card.reading})
                </span>
              )}
            </p>
            <p className="small" style={{ lineHeight: 1.8 }}>
              {cur.card.def}
            </p>
            {cur.card.point && (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: 10,
                }}
              >
                <p className="small" style={{ fontWeight: 600 }}>💡 覚え方</p>
                <p className="small" style={{ lineHeight: 1.7 }}>
                  {cur.card.point}
                </p>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 8 }}>
              出典: {sourceLabel(cur.card)}
            </p>
          </div>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={handleNext}
          >
            {idx + 1 >= items.length ? "結果を見る" : "次のことばへ"}
          </button>
        </div>
      )}

      {mode === "flip" && !flipped && (
        <button
          className="btn btn-primary btn-block"
          onClick={() => setFlipped(true)}
        >
          答えを見る
        </button>
      )}

      {mode === "flip" && flipped && (
        <div>
          <div className="card">
            <p style={{ fontWeight: 700, marginBottom: 4 }}>
              {cur.card.term}
              {cur.card.reading && (
                <span className="muted small" style={{ fontWeight: 400 }}>
                  ({cur.card.reading})
                </span>
              )}
            </p>
            <p className="small" style={{ lineHeight: 1.8 }}>
              {cur.card.def}
            </p>
            {cur.card.point && (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: 10,
                }}
              >
                <p className="small" style={{ fontWeight: 600 }}>💡 覚え方</p>
                <p className="small" style={{ lineHeight: 1.7 }}>
                  {cur.card.point}
                </p>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 8 }}>
              出典: {sourceLabel(cur.card)}
            </p>
          </div>
          {/* 自己採点で次の語へ。正誤は4択と同じSRS遷移に流れる */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn"
              style={{
                flex: 1,
                background: "var(--success-bg)",
                borderColor: "var(--success-text)",
                color: "var(--success-text)",
                fontWeight: 700,
              }}
              onClick={() => handleFlipGrade(true)}
            >
              思い出せた
            </button>
            <button
              className="btn"
              style={{
                flex: 1,
                background: "var(--danger-bg)",
                borderColor: "var(--danger-text)",
                color: "var(--danger-text)",
                fontWeight: 700,
              }}
              onClick={() => handleFlipGrade(false)}
            >
              思い出せなかった
            </button>
          </div>
        </div>
      )}

      {mode === "choice" ? (
        <KeyHint choiceCount={cur.choices.length} answered={answered} />
      ) : (
        <div className="kbd-hint" aria-hidden>
          {!flipped ? (
            <span>
              <kbd>Space</kbd>でめくる
            </span>
          ) : (
            <span>
              <kbd>1</kbd>思い出せた / <kbd>2</kbd>思い出せなかった
            </span>
          )}
        </div>
      )}
    </div>
  );
}
