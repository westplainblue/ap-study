/**
 * Pure spaced-repetition domain logic.
 *
 * This module has no persistence and no browser APIs, so it can be unit-tested
 * directly with `node --test` (via the tsx loader). The localStorage wrappers
 * live in progress.ts and delegate the actual scheduling decisions to here.
 *
 * Design principle (see docs/spaced-repetition-upgrade.md): the attempt log is
 * the single source of truth; scheduler state is a pure function of it, so the
 * active scheduler can be switched behind a flag by re-deriving.
 */

export const DAY_MS = 86_400_000;

/** Whole-day index for an epoch-ms timestamp (local time is applied by callers). */
export function epochDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

// ---------------------------------------------------------------------------
// Sessions — R4 (successive relearning across distinct, spaced sessions)
// ---------------------------------------------------------------------------
//
// Successive relearning is measured across separate study sessions, so each
// review needs a session identity. New attempts carry an explicit `s`. Legacy
// attempts recorded before this field existed are grouped one-session-per-day
// from their timestamp, so historical data still yields a sensible session
// count without being rewritten (the attempt log stays the source of truth).

export interface SessionAttempt {
  t: number;
  ok: boolean;
  s?: string;
}

/** Session identity for an attempt; legacy attempts fall back to their day. */
export function sessionKey(a: SessionAttempt): string {
  return a.s ?? `legacy:${epochDay(a.t)}`;
}

// ---------------------------------------------------------------------------
// Drill (within-session "repeat until recalled") — R4/R5, option B
// ---------------------------------------------------------------------------
//
// Successive relearning beats first-session over-learning, so a drill must not
// grind a single item indefinitely. We cap per-item exposures within a session:
// once an item is recalled correctly it leaves the session, and a lapsed item is
// re-queued only until it reaches the cap, after which it is deferred to a later
// spaced session instead of being drilled again. Re-queued items go to the back
// so other items sit between the failure and the next sighting — this prevents
// recognition from standing in for recall (R5).

/** Default max exposures of one item within a single drill session. */
export const DRILL_CAP = 2;

export type DrillOutcome = "mastered" | "deferred" | "requeued";

export interface DrillNext {
  queue: string[];
  outcome: DrillOutcome;
}

/**
 * Advance the drill queue after the head item was answered.
 * @param queue         current working queue (head is the item just answered)
 * @param wasCorrect    whether the answer was correct
 * @param headAttempts  how many times the head item has been attempted this
 *                      session INCLUDING the answer just given
 * @param cap           per-session exposure cap (>= 1)
 */
export function drillNext(
  queue: string[],
  wasCorrect: boolean,
  headAttempts: number,
  cap: number = DRILL_CAP,
): DrillNext {
  const [head, ...rest] = queue;
  if (head === undefined) return { queue: [], outcome: "mastered" };
  if (wasCorrect) return { queue: rest, outcome: "mastered" };
  // Lapsed: re-queue until the cap, then defer to a future spaced session.
  if (headAttempts >= cap) return { queue: rest, outcome: "deferred" };
  return { queue: [...rest, head], outcome: "requeued" };
}
