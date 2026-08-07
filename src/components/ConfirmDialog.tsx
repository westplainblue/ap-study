import { useEffect } from "react";

/**
 * アプリ内の確認ダイアログ。window.confirm の代替。
 *
 * window.confirm は iOS のホーム画面起動(PWA)や一部の組み込みブラウザで
 * 表示されないまま false を返すことがあり、「ボタンを押しても何も起きない」
 * 不具合になる(模試の採点ボタンで実際に発生)。確認はすべてこれを使うこと。
 */
export default function ConfirmDialog({
  open,
  message,
  confirmLabel = "OK",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  /** 破壊的な操作(削除・破棄など)は赤系の実行ボタンにする */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ marginBottom: 16, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {/* 押し間違い対策で初期フォーカスはキャンセル側に置く */}
          <button className="btn" style={{ flex: 1 }} onClick={onCancel} autoFocus>
            キャンセル
          </button>
          <button
            className={danger ? "btn" : "btn btn-primary"}
            style={
              danger
                ? {
                    flex: 1,
                    background: "var(--danger-bg)",
                    borderColor: "var(--danger-text)",
                    color: "var(--danger-text)",
                    fontWeight: 700,
                  }
                : { flex: 1 }
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
