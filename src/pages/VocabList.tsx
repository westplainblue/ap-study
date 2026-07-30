import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconX } from "../components/Icons";
import { amQuestion, examLabel } from "../data";
import { MAJOR_LABEL, MIDDLES_BY_MAJOR, type Major } from "../data/types";
import {
  loadTermsData,
  normalizeTermQuery,
  termsDataSync,
  type TermCard,
  type TermsData,
} from "../data/terms";
import {
  loadState,
  MAX_BOX,
  todayStr,
  type VocabEntry,
} from "../lib/progress";
import { clearRun } from "../lib/run";
import {
  reconcileVocabFromStorage,
  setVocabHidden,
  setVocabMemo,
  vocabCounts,
} from "../lib/vocab";

type Filter = "due" | "learning" | "graduated" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "due", label: "復習どき" },
  { key: "learning", label: "学習中" },
  { key: "graduated", label: "習得済み" },
  { key: "all", label: "すべての用語" },
];

/** 出典表示(例: 令和7年度 秋期 問12)。問題が引けなければIDのまま */
function sourceLabel(card: TermCard): string {
  const q = amQuestion(card.defQid);
  return q ? `${examLabel(q.examId)} 問${q.number}` : card.defQid;
}

/** 行の右側の状態バッジ(復習どき/箱N/卒業)。未収載・非表示は出さない */
function BoxBadge({ entry }: { entry?: VocabEntry }) {
  if (!entry || entry.hidden) return null;
  if (entry.box > MAX_BOX) {
    return (
      <span
        className="chip"
        style={{ background: "var(--success-bg)", color: "var(--success-text)" }}
      >
        卒業
      </span>
    );
  }
  if (entry.due <= todayStr()) {
    return (
      <span
        className="chip"
        style={{ background: "var(--accent)", color: "var(--on-accent)" }}
      >
        復習どき
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
    >
      箱{entry.box}
    </span>
  );
}

/** 用語カードの詳細ダイアログ(実績詳細と同じモーダルパターン) */
function TermDetail({
  card,
  entry,
  onClose,
  onChanged,
  onRetry,
}: {
  card: TermCard;
  entry?: VocabEntry;
  onClose: () => void;
  onChanged: () => void;
  onRetry: (card: TermCard) => void;
}) {
  // Escで閉じる + 背面のスクロールを止める
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const noted = entry && !entry.hidden;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`用語 ${card.term} の詳細`}
        style={{ textAlign: "left" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="閉じる" onClick={onClose}>
          <IconX size={18} />
        </button>

        <p style={{ fontSize: 18, fontWeight: 700, paddingRight: 24 }}>
          {noted && "📒 "}
          {card.term}
        </p>
        {card.reading && <p className="muted small">{card.reading}</p>}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
          }}
        >
          <span className="chip">{card.middle}</span>
          {card.fact && (
            <span
              className="chip"
              style={{
                background: "var(--warning-bg)",
                color: "var(--warning-text)",
              }}
            >
              出題ファクト
            </span>
          )}
          <BoxBadge entry={entry} />
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 12,
          }}
        >
          <p className="small" style={{ lineHeight: 1.8 }}>
            {card.def}
          </p>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>
          出典: {sourceLabel(card)}・出題{card.qids.length}回
        </p>

        {card.point && (
          <div
            style={{
              background: "var(--surface-2)",
              borderRadius: 8,
              padding: "8px 12px",
              marginTop: 10,
            }}
          >
            <p className="small" style={{ fontWeight: 600 }}>💡 覚え方</p>
            <p className="small" style={{ lineHeight: 1.7 }}>{card.point}</p>
          </div>
        )}

        {noted && (
          <div style={{ marginTop: 12 }}>
            <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
              自分メモ
            </p>
            <textarea
              defaultValue={entry.memo ?? ""}
              placeholder="自分の覚え方・ひっかかった点など"
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
              onBlur={(e) => {
                setVocabMemo(card.id, e.target.value.trim());
                onChanged();
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 14,
          }}
        >
          <button
            className="btn btn-primary btn-block"
            onClick={() => onRetry(card)}
          >
            出典問題を解き直す
          </button>
          {noted && (
            <button
              className="btn btn-block"
              onClick={() => {
                setVocabHidden(card.id, true);
                onChanged();
                onClose();
              }}
            >
              ノートから隠す
            </button>
          )}
          {entry?.hidden && (
            <button
              className="btn btn-block"
              onClick={() => {
                setVocabHidden(card.id, false);
                onChanged();
              }}
            >
              ノートに戻す
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 用語ノート: 誤答から自動で集まった用語の一覧と辞書全体のブラウズ */
export default function VocabList() {
  const navigate = useNavigate();
  const [data, setData] = useState<TermsData | null>(() => termsDataSync());
  const [pstate, setPstate] = useState(() => loadState());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(() => {
    const c = vocabCounts(loadState());
    return c.due > 0 ? "due" : c.noted > 0 ? "learning" : "all";
  });
  const [majors, setMajors] = useState<Set<Major>>(new Set());
  const [byFreq, setByFreq] = useState(false);
  const [detail, setDetail] = useState<TermCard | null>(null);

  // 辞書を読み込み、未導出の誤答があればことば帳へ反映してから表示する
  useEffect(() => {
    let alive = true;
    loadTermsData().then((d) => {
      if (!alive) return;
      if (reconcileVocabFromStorage()) setPstate(loadState());
      setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = () => setPstate(loadState());
  const counts = vocabCounts(pstate);
  const today = todayStr();
  const vocab = pstate.vocab ?? {};

  // シラバス順(T→M→S、各大分類内は中分類の掲載順)でグルーピングするための順序表
  const middleOrder = useMemo(() => {
    const order = new Map<string, number>();
    let i = 0;
    for (const major of ["T", "M", "S"] as Major[]) {
      for (const m of MIDDLES_BY_MAJOR[major]) order.set(m, i++);
    }
    return order;
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = normalizeTermQuery(query.trim());
    let cards = data.cards.filter((c) => {
      const e = vocab[c.id];
      const noted = e && !e.hidden;
      if (filter === "all") return true; // 辞書全体(非表示・未収載も含む)
      if (!noted) return false;
      if (filter === "due") return e.box <= MAX_BOX && e.due <= today;
      if (filter === "graduated") return e.box > MAX_BOX;
      return e.box <= MAX_BOX; // learning
    });
    if (majors.size > 0) cards = cards.filter((c) => majors.has(c.major));
    if (q) {
      cards = cards.filter((c) =>
        [c.term, ...(c.aliases ?? []), c.def].some((s) =>
          normalizeTermQuery(s).includes(q)
        )
      );
    }
    return [...cards].sort((a, b) =>
      byFreq
        ? b.qids.length - a.qids.length || a.term.localeCompare(b.term, "ja")
        : (middleOrder.get(a.middle) ?? 99) - (middleOrder.get(b.middle) ?? 99) ||
          a.term.localeCompare(b.term, "ja")
    );
  }, [data, vocab, query, filter, majors, byFreq, today, middleOrder]);

  // 出題回数順OFFのときは middle ごとの見出し付きで表示する
  const groups = useMemo(() => {
    if (byFreq) return null;
    const map = new Map<string, TermCard[]>();
    for (const c of rows) {
      const list = map.get(c.middle) ?? [];
      list.push(c);
      map.set(c.middle, list);
    }
    return [...map.entries()];
  }, [rows, byFreq]);

  const toggleMajor = (m: Major) => {
    const next = new Set(majors);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setMajors(next);
  };

  // 「出典問題を解き直す」: 契機となった誤答問題(無ければ出題実績のある問題)を
  // ids 指定で分野別演習プレイヤーに渡す
  const retry = (card: TermCard) => {
    const entry = vocab[card.id];
    const ids =
      entry && entry.wrongQids.length > 0 ? entry.wrongQids : card.qids;
    clearRun("practice"); // 前回の途中状態は破棄して指定問題で始める
    sessionStorage.setItem(
      "ap-practice",
      JSON.stringify({ middles: [], count: ids.length, ids })
    );
    navigate("/practice/run");
  };

  const renderRow = (c: TermCard) => {
    const e = vocab[c.id];
    const noted = e && !e.hidden;
    return (
      <button key={c.id} className="list-row" onClick={() => setDetail(c)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>
            {noted && "📒 "}
            {c.term}
          </span>
          <br />
          <span
            className="muted small"
            style={{
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {byFreq && `出題${c.qids.length}回・`}
            {c.def.slice(0, 20)}
            {c.def.length > 20 && "…"}
          </span>
        </span>
        <BoxBadge entry={e} />
      </button>
    );
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>📒 用語ノート</h1>
      <p className="muted small" style={{ marginBottom: 12 }}>
        あなたのノート {counts.noted}語(復習どき {counts.due})/ 辞書{" "}
        {data ? data.cards.length : "…"}語
      </p>

      {counts.due > 0 && (
        <Link
          to="/vocab/run"
          className="btn btn-primary btn-block"
          style={{ marginBottom: 12 }}
        >
          ことばドリルを始める({counts.due}語が復習どき)
        </Link>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="用語・定義を検索"
        style={{ width: "100%", marginBottom: 10 }}
      />

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip-toggle ${filter === f.key ? "on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}
      >
        {(Object.keys(MAJOR_LABEL) as Major[]).map((m) => (
          <button
            key={m}
            className={`chip-toggle ${majors.has(m) ? "on" : ""}`}
            onClick={() => toggleMajor(m)}
          >
            {MAJOR_LABEL[m]}
          </button>
        ))}
        <button
          className={`chip-toggle ${byFreq ? "on" : ""}`}
          onClick={() => setByFreq((v) => !v)}
        >
          出題回数順
        </button>
      </div>

      {!data ? (
        <p className="muted small">辞書を読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="card">
          {filter !== "all" && counts.noted === 0 ? (
            <>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>
                まだノートは空です
              </p>
              <p className="muted small" style={{ lineHeight: 1.8 }}>
                演習や模試で間違えた問題から、大事なことばが自動で集まります。
                まずは辞書全体を眺めてみるのもおすすめです。
              </p>
              <button
                className="btn btn-block"
                style={{ marginTop: 12 }}
                onClick={() => setFilter("all")}
              >
                すべての用語を見る
              </button>
            </>
          ) : (
            <p className="muted">該当する用語がありません。</p>
          )}
        </div>
      ) : groups ? (
        groups.map(([middle, cards]) => (
          <div key={middle} style={{ marginBottom: 14 }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>
              {middle}{" "}
              <span className="muted small">({cards.length})</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cards.map(renderRow)}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(renderRow)}
        </div>
      )}

      {detail && (
        <TermDetail
          card={detail}
          entry={vocab[detail.id]}
          onClose={() => setDetail(null)}
          onChanged={refresh}
          onRetry={retry}
        />
      )}
    </div>
  );
}
