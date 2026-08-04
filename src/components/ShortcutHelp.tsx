import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isPlainKey, isTypingTarget } from "../lib/keys";

/** g に続けて押すキー → 移動先 */
const GOTO: [string, string, string][] = [
  ["h", "/", "ホーム"],
  ["p", "/practice", "分野別演習"],
  ["d", "/drill", "反復学習"],
  ["c", "/calc", "計算ドリル"],
  ["v", "/vocab", "用語ノート"],
  ["m", "/mock", "模試"],
  ["a", "/pm", "午後演習"],
  ["s", "/stats", "分析"],
  [",", "/settings", "設定"],
];

/**
 * アプリ全体のキーボードショートカット。
 *
 * - `?` … この一覧を開く(キー操作の存在に気づける唯一の入口)
 * - `g` → キー … 画面移動(Gmail/GitHub と同じ2ストローク方式)
 *
 * 2ストロークにしているのは、単独キーを画面移動に使うと演習の解答キー
 * (1〜9 / A〜D)と衝突するため。g の後 1.5 秒だけ受付を開く。
 */
export default function ShortcutHelp() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // g を押した時刻。null なら通常状態
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(document.activeElement)) return;

      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // g の待ち受け中: 対応するキーなら移動、外れたら黙って解除
      if (pending.current !== null) {
        const fresh = Date.now() - pending.current < 1500;
        pending.current = null;
        if (fresh) {
          const hit = GOTO.find(([k]) => k === e.key.toLowerCase());
          if (hit) {
            e.preventDefault();
            setOpen(false);
            navigate(hit[1]);
            return;
          }
        }
      }
      if (e.key === "g" || e.key === "G") {
        pending.current = Date.now();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="modal shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
          キーボードショートカット
        </p>

        <p className="shortcut-heading">演習中</p>
        <dl className="shortcut-list">
          <dt>
            <kbd>1</kbd>〜<kbd>4</kbd> / <kbd>A</kbd>〜<kbd>D</kbd>
          </dt>
          <dd>選択肢を選ぶ(画面の並び順)</dd>
          <dt>
            <kbd>Enter</kbd>
          </dt>
          <dd>次の問題へ</dd>
          <dt>
            <kbd>R</kbd>
          </dt>
          <dd>あとで復習に登録</dd>
        </dl>

        <p className="shortcut-heading">模試</p>
        <dl className="shortcut-list">
          <dt>
            <kbd>←</kbd> <kbd>→</kbd>
          </dt>
          <dd>前後の問題へ</dd>
          <dt>
            <kbd>F</kbd>
          </dt>
          <dd>あとで見直すフラグ</dd>
        </dl>

        <p className="shortcut-heading">移動</p>
        <dl className="shortcut-list">
          {GOTO.map(([k, , label]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>
                <kbd>G</kbd> <kbd>{k === "," ? "," : k.toUpperCase()}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>

        <p className="shortcut-heading">その他</p>
        <dl className="shortcut-list">
          <dt>
            <kbd>[</kbd>
          </dt>
          <dd>サイドバーの開閉(PC)</dd>
          <dt>
            <kbd>?</kbd>
          </dt>
          <dd>この一覧</dd>
        </dl>

        <button
          className="btn btn-block"
          style={{ marginTop: 14 }}
          onClick={() => setOpen(false)}
        >
          閉じる(Esc)
        </button>
      </div>
    </div>
  );
}
