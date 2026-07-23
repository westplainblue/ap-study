import { useEffect, useState } from "react";
import { achvDef, type AchvDef } from "../lib/achievements";
import { loadState, saveStateRaw } from "../lib/progress";
import Badge from "./Badge";

function markSeen(ids: string[]) {
  const s = loadState();
  let changed = false;
  for (const id of ids) {
    const rec = s.achievements?.[id];
    if (rec && !rec.seen) {
      rec.seen = true;
      changed = true;
    }
  }
  if (changed) saveStateRaw(s);
}

/**
 * 実績解除トースト。achv:unlock イベントを購読し、1回の解除(複数でも)を1枚にまとめて表示。
 * App 直下に常設する。
 */
export default function AchievementToast() {
  const [queue, setQueue] = useState<AchvDef[][]>([]);
  const [current, setCurrent] = useState<AchvDef[] | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ids = (e as CustomEvent<string[]>).detail ?? [];
      const defs = ids
        .map((id) => achvDef(id))
        .filter((d): d is AchvDef => Boolean(d));
      if (defs.length) setQueue((q) => [...q, defs]);
    };
    window.addEventListener("achv:unlock", handler);
    return () => window.removeEventListener("achv:unlock", handler);
  }, []);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    markSeen(next.map((d) => d.id));
    const timer = setTimeout(() => setCurrent(null), 4500);
    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;
  const main = current[0];
  const names = current.map((d) => d.name);
  return (
    <div
      className="achv-toast"
      role="status"
      onClick={() => setCurrent(null)}
    >
      <Badge tier={main.tier} glyph={main.glyph} size={46} />
      <div style={{ minWidth: 0 }}>
        <div className="achv-toast-title">
          実績{current.length > 1 ? `を${current.length}件` : ""}解除!
        </div>
        <div className="achv-toast-name">
          {names.slice(0, 3).join("、")}
          {names.length > 3 ? ` 他${names.length - 3}件` : ""}
        </div>
      </div>
    </div>
  );
}
