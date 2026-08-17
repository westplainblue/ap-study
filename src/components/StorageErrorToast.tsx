import { useEffect, useState } from "react";

/**
 * 保存失敗トースト。progress.ts が localStorage 保存に失敗したとき
 * (多くは容量超過)に出す storage:error イベントを購読して表示する。
 * 解答が黙って失われるのを防ぐため、ユーザーに気付いてもらうのが目的。
 * App 直下に常設する。
 */
export default function StorageErrorToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = () => {
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 8000);
    };
    window.addEventListener("storage:error", handler);
    return () => {
      window.removeEventListener("storage:error", handler);
      clearTimeout(timer);
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="achv-toast"
      role="alert"
      onClick={() => setShow(false)}
      style={{
        background: "var(--danger-bg)",
        borderColor: "color-mix(in srgb, var(--danger-text) 32%, var(--surface))",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="achv-toast-title" style={{ color: "var(--danger-text)" }}>
          保存に失敗しました
        </div>
        <div className="achv-toast-name" style={{ whiteSpace: "normal" }}>
          ブラウザの保存容量が不足している可能性があります。設定画面から進捗をエクスポートして空き容量を確認してください。
        </div>
      </div>
    </div>
  );
}
