import { useEffect, useState } from "react";
import { figureUrl } from "../data";

interface Props {
  /** public/figures 配下の相対パス */
  src: string;
  alt: string;
}

/**
 * クリック/Enter で拡大表示できる図表。
 *
 * PCの2カラム表示では図の幅が半分(約560px)に制限され、回路図や表のような
 * 細かい図が読めなくなる。モバイルでも画面幅が上限になるので、
 * どの環境でも「元のサイズで見たい」が起きる。
 */
export default function ZoomableFigure({ src, alt }: Props) {
  const [zoom, setZoom] = useState(false);

  // 拡大中は Escape で閉じる(モーダルの作法を他画面と揃える)
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <>
      <button
        className="figure-btn"
        onClick={() => setZoom(true)}
        aria-label={`${alt}(クリックで拡大)`}
        title="クリックで拡大"
      >
        <img src={figureUrl(src)} alt={alt} />
        <span className="figure-zoom-hint" aria-hidden>
          ⤢
        </span>
      </button>

      {zoom && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setZoom(false)}
        >
          <div
            className="figure-zoom"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={figureUrl(src)} alt={alt} />
            <button className="btn" onClick={() => setZoom(false)}>
              閉じる(Esc)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
