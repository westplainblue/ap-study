import { useId } from "react";
import type { Glyph, Tier } from "../lib/achievements";

const TIERS: Record<
  Tier,
  { a: string; b: string; rim: string; ink: string; rainbow?: boolean }
> = {
  bronze: { a: "#F0B87E", b: "#A9682F", rim: "#7E4A20", ink: "#5a3316" },
  silver: { a: "#EEF3F8", b: "#9BA7B4", rim: "#78838F", ink: "#59626c" },
  gold: { a: "#FBE08A", b: "#D09A1E", rim: "#9E7315", ink: "#6b4e0e" },
  platinum: { a: "#EAF7F4", b: "#93C3CF", rim: "#6693A0", ink: "#3f6772" },
  diamond: { a: "#9FEAF2", b: "#9E88F4", rim: "#6A54C6", ink: "#4b3aa0", rainbow: true },
};

const GLYPHS: Record<Glyph, string> = {
  volume:
    '<g fill="#fff"><rect x="32" y="39" width="36" height="8" rx="2.5"/><rect x="35" y="51" width="30" height="8" rx="2.5"/><rect x="38" y="63" width="24" height="8" rx="2.5"/></g>',
  revenge:
    '<g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M63 42 A17 17 0 1 0 66 58"/><path d="M63 33 L64 43 L54 44"/><path d="M42 52 l6 7 l13 -15"/></g>',
  streak:
    '<path fill="#fff" d="M52 28 C55 40 68 43 62 57 C59 65 53 70 50 70 C44 70 37 65 37 56 C37 49 43 47 45 42 C47 47 50 47 51 44 C53 40 51 34 52 28 Z"/>',
  coverage:
    '<g fill="#fff"><circle cx="38" cy="38" r="3.6"/><circle cx="50" cy="38" r="3.6"/><circle cx="62" cy="38" r="3.6"/><circle cx="38" cy="50" r="3.6"/><circle cx="50" cy="50" r="3.6"/><circle cx="62" cy="50" r="3.6"/><circle cx="38" cy="62" r="3.6" opacity="0.45"/><circle cx="50" cy="62" r="3.6" opacity="0.45"/><circle cx="62" cy="62" r="3.6" opacity="0.45"/></g>',
  mastery:
    '<path fill="#fff" d="M50 30 l5.6 11.3 12.5 1.8 -9 8.8 2.1 12.4 -11.2 -5.9 -11.2 5.9 2.1 -12.4 -9 -8.8 12.5 -1.8 Z"/>',
  recurring:
    '<g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><rect x="34" y="37" width="32" height="29" rx="4"/><line x1="34" y1="46" x2="66" y2="46"/><line x1="42" y1="33" x2="42" y2="40"/><line x1="58" y1="33" x2="58" y2="40"/><path stroke-width="4.5" d="M44 56 l4 4 l8 -9"/></g>',
  challenge: '<path fill="#fff" d="M55 29 L39 53 L49 53 L45 71 L63 45 L52 45 Z"/>',
  pm: '<g transform="rotate(45 50 50)" fill="#fff"><rect x="45.5" y="31" width="9" height="4" rx="1.2"/><rect x="45.5" y="35" width="9" height="26" rx="1.5"/><path d="M45.5 61 L54.5 61 L50 69 Z"/></g>',
  first:
    '<g fill="#fff"><path d="M50 70 L50 50" stroke="#fff" stroke-width="5" stroke-linecap="round"/><ellipse cx="41" cy="49" rx="9.5" ry="5.5" transform="rotate(-32 41 49)"/><ellipse cx="59" cy="45" rx="9.5" ry="5.5" transform="rotate(32 59 45)"/></g>',
};

interface Props {
  tier: Tier;
  glyph: Glyph;
  size?: number;
  state?: "unlocked" | "locked" | "progress";
  progress?: number; // 0..1(state="progress" のとき)
}

/** 実績バッジ(円形メダル)。すべてSVG生成・画像アセット不要。 */
export default function Badge({
  tier,
  glyph,
  size = 72,
  state = "unlocked",
  progress = 0,
}: Props) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, "");
  const t = TIERS[tier];
  const C = 2 * Math.PI * 45;
  const locked = state === "locked";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id={`${uid}d`} cx="0.38" cy="0.32" r="0.85">
          {t.rainbow ? (
            <>
              <stop offset="0" stopColor="#9FEAF2" />
              <stop offset="0.5" stopColor="#8FB4F2" />
              <stop offset="1" stopColor="#B58CF0" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={t.a} />
              <stop offset="1" stopColor={t.b} />
            </>
          )}
        </radialGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.rim} />
        </linearGradient>
      </defs>
      <g
        style={
          locked
            ? { filter: "grayscale(1) brightness(1.05)", opacity: 0.5 }
            : undefined
        }
      >
        <circle cx="50" cy="50" r="47" fill={`url(#${uid}r)`} />
        <circle cx="50" cy="50" r="40" fill={`url(#${uid}d)`} />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={t.ink}
          strokeOpacity="0.28"
          strokeWidth="1.4"
        />
        <ellipse cx="43" cy="34" rx="24" ry="13" fill="#fff" opacity="0.2" />
        <g
          opacity={locked ? 0.9 : 0.97}
          dangerouslySetInnerHTML={{ __html: GLYPHS[glyph] }}
        />
      </g>
      {state === "progress" && (
        <>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={t.ink}
            strokeOpacity="0.12"
            strokeWidth="5"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            style={{ stroke: "var(--accent)" }}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(Math.max(0, Math.min(1, progress)) * C).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 50 50)"
          />
        </>
      )}
      {locked && (
        <g transform="translate(50 58)">
          <rect x="-9" y="-2" width="18" height="14" rx="3" fill="#3a372f" />
          <path
            d="M-5 -2 v-4 a5 5 0 0 1 10 0 v4"
            fill="none"
            stroke="#3a372f"
            strokeWidth="3"
          />
          <circle cx="0" cy="5" r="2.4" fill="#cfcabb" />
        </g>
      )}
    </svg>
  );
}
