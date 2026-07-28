import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { canShuffleChoices, KANA, sourceOf } from "../data";
import type { AmQuestion } from "../data/types";
import { setAiContext } from "../lib/aiContext";
import {
  getAiMarks,
  resolveMarks,
  setAiMarks,
  subscribeAiMarks,
} from "../lib/aiHighlight";
import { refreshAfterAnswer } from "../lib/achievements";
import {
  displayedIndex,
  newChoicePerm,
  remapKanaLabels,
} from "../lib/choiceShuffle";
import { loadState, recordAnswer } from "../lib/progress";
import { DRILL_CAP, drillNext } from "../lib/srs";
import { IconCheck, IconRefresh, IconX } from "./Icons";
import QuestionCard from "./QuestionCard";

interface Props {
  questions: AmQuestion[];
  title: string;
  emptyMessage?: string;
}

/**
 * 反復学習プレイヤー: 「正解するまで繰り返す」ドリル(セッション内上限つき)。
 * 誤答はキュー末尾へ再投入するが、1問あたり DRILL_CAP 回で打ち切り、それ以上は
 * その場で粘らず次回のスペース学習にまわす(第一セッションでの過剰学習を抑制)。
 * 履歴に残すのは各問題の初回解答のみ(以降の反復は記録せず、統計や
 * 間隔反復(Leitner)のスケジュールを乱さない)。
 */
export default function DrillPlayer({ questions, title, emptyMessage }: Props) {
  const total = questions.length;
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  // 作業キュー(未マスターの問題ID)。正解で先頭を除去、誤答で末尾へ回す。
  const [queue, setQueue] = useState<string[]>(() => questions.map((q) => q.id));
  const [selected, setSelected] = useState<number | null>(null);
  const [recorded, setRecorded] = useState<Set<string>>(() => new Set());
  const [answers, setAnswers] = useState(0); // 延べ解答数
  const [firstTryOk, setFirstTryOk] = useState(0); // 初回で正解した問題数
  const [mastered, setMastered] = useState(0); // このセッションで正解できた問題数
  const [deferred, setDeferred] = useState(0); // 上限に達して次回にまわした問題数
  const triesRef = useRef<Map<string, number>>(new Map()); // 問題ごとのセッション内挑戦回数

  const currentId = queue[0];
  const q = currentId ? byId.get(currentId) : undefined;
  const finished = total > 0 && queue.length === 0;
  const handled = total - queue.length; // 決着した問題数(マスター + 次回まわし)

  // 選択肢シャッフル(設定で無効化可)。再出題のたびに並びを引き直す(round)。
  const [shuffleOn] = useState(() => loadState().settings.shuffleChoices !== false);
  const [round, setRound] = useState(0);
  const order = useMemo(
    () => (shuffleOn && q && canShuffleChoices(q) ? newChoicePerm() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- round は再出題ごとの引き直し用
    [shuffleOn, currentId, round]
  );
  const kanaOf = (o: number) => KANA[order ? displayedIndex(order, o) : o];
  const remap = (t: string) => (order ? remapKanaLabels(t, order) : t);

  // AIマーク: チャットが発行した生マークを現在の問題の文字範囲へ解決する
  const rawMarks = useSyncExternalStore(subscribeAiMarks, getAiMarks, getAiMarks);
  const aiMarks = useMemo(
    () => (q ? resolveMarks(q, rawMarks) : []),
    [q, rawMarks]
  );
  useEffect(() => {
    setAiMarks([]); // 出題が変わったら前の問題のマークを消す
  }, [currentId]);

  // 現在の問題をAIチャットに共有する
  useEffect(() => {
    if (finished || !q) {
      setAiContext(null);
      return;
    }
    const ord = order ?? q.choices.map((_, i) => i);
    const lines = [
      "【ユーザーが現在取り組んでいる問題(反復学習)】",
      `出典: ${sourceOf(q)}(分野: ${q.middle})`,
      `問題文: ${q.text}`,
      // 画面と同じ並び・記号で共有する(シャッフル時は記号を振り直している)
      ...ord.map((oi, di) => `${KANA[di]}: ${q.choices[oi]}`),
    ];
    if (q.figure) {
      lines.push("※この問題には図表が含まれますが、図はテキスト共有できていません。");
    }
    if (selected !== null) {
      lines.push(
        `正解: ${kanaOf(q.answer)}`,
        `ユーザーの解答: ${kanaOf(selected)}(${selected === q.answer ? "正解" : "不正解"})`,
        `解説: ${remap(q.explanation)}`
      );
    } else {
      lines.push(
        "ユーザーはまだ解答中です。正答の記号を直接明かさず、考え方のヒントを中心に支援してください。"
      );
    }
    setAiContext({ label: sourceOf(q), text: lines.join("\n") });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kanaOf/remap は order から導出
  }, [q, selected, finished, order]);

  useEffect(() => () => setAiContext(null), []);

  if (total === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h1>
        <div className="card">
          <p>{emptyMessage ?? "出題できる問題がありません。"}</p>
          <Link to="/" className="btn btn-block" style={{ marginTop: 12 }}>
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>反復完了</h1>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <p style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
            {deferred === 0 ? `🎉 全 ${total} 問マスター!` : "おつかれさま!"}
          </p>
          <p className="muted">
            {deferred === 0
              ? "正解するまで繰り返し、すべてクリアしました。"
              : `${mastered} 問マスター、${deferred} 問は次回の復習にまわしました。`}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              marginTop: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {mastered} / {total}
              </div>
              <div className="muted small">マスター</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{firstTryOk}</div>
              <div className="muted small">一発正解</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{answers}</div>
              <div className="muted small">延べ解答</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/drill" className="btn btn-primary btn-block">
            もう一度
          </Link>
          <Link to="/" className="btn btn-block">
            ホームへ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!q) return null;

  const answered = selected !== null;
  const correct = answered && selected === q.answer;

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    const ok = i === q.answer;
    setAnswers((n) => n + 1);
    triesRef.current.set(q.id, (triesRef.current.get(q.id) ?? 0) + 1);
    // 初回の解答だけ履歴に記録する(反復ぶんは記録しない)
    if (!recorded.has(q.id)) {
      recordAnswer(q.id, ok, "practice");
      refreshAfterAnswer();
      setRecorded((s) => new Set(s).add(q.id));
      if (ok) setFirstTryOk((n) => n + 1);
    }
  };

  const handleNext = () => {
    const tries = triesRef.current.get(q.id) ?? 0;
    const { queue: next, outcome } = drillNext(queue, correct, tries, DRILL_CAP);
    if (outcome === "mastered") setMastered((m) => m + 1);
    else if (outcome === "deferred") setDeferred((d) => d + 1);
    setQueue(next);
    setSelected(null);
    setRound((r) => r + 1); // 次の出題で選択肢の並びを引き直す
  };

  const atCap = (triesRef.current.get(q.id) ?? 0) >= DRILL_CAP;
  const willDefer = answered && !correct && atCap; // これ以上は再出題せず次回へ
  const willFinish = queue.length === 1 && (correct || willDefer);

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
        <span className="chip">{q.middle}</span>
        <span className="muted small">
          マスター {mastered} / {total}
        </span>
      </div>
      <div className="progress-track" style={{ marginBottom: 6 }}>
        <div
          className="progress-fill"
          style={{ width: `${(handled / total) * 100}%` }}
        />
      </div>
      <p className="muted small" style={{ marginBottom: 14 }}>
        <IconRefresh size={13} /> 残り {queue.length} 問。間違えた問題はあとでもう一度出ます。
      </p>

      <QuestionCard
        question={q}
        selected={selected}
        answered={answered}
        onSelect={handleSelect}
        order={order ?? undefined}
        aiMarks={aiMarks}
      />

      {answered && (
        <div style={{ marginTop: 14 }}>
          <div className={correct ? "banner banner-ok" : "banner banner-ng"}>
            {correct ? <IconCheck size={18} /> : <IconX size={18} />}
            <span>
              {correct
                ? "正解! マスターしました。"
                : willDefer
                  ? `不正解… 答えは「${kanaOf(q.answer)}」。今回はここまで、次回の復習にまわします。`
                  : `不正解… 答えは「${kanaOf(q.answer)}」。あとでもう一度出ます。`}
            </span>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>解説</p>
            <p className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
              {remap(q.explanation)}
            </p>
            {q.point && (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: 10,
                }}
              >
                <p className="small" style={{ fontWeight: 600 }}>💡 初学者ポイント</p>
                <p className="small" style={{ lineHeight: 1.7 }}>{remap(q.point)}</p>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={handleNext}
          >
            {willFinish ? "完了する" : "次の問題へ"}
          </button>
        </div>
      )}
    </div>
  );
}
