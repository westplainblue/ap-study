import assert from "node:assert/strict";
import { test } from "node:test";
import { DRILL_CAP, drillNext, epochDay, sessionKey } from "../src/lib/srs.ts";

test("epochDay: same calendar day maps to same index", () => {
  const base = 1_700_000_000_000;
  assert.equal(epochDay(base), epochDay(base + 3600_000)); // +1h, same day bucket
  assert.equal(epochDay(base + 86_400_000), epochDay(base) + 1); // +1 day
});

test("drillNext: a correct answer masters the item and removes it", () => {
  const r = drillNext(["a", "b", "c"], true, 1, DRILL_CAP);
  assert.deepEqual(r.queue, ["b", "c"]);
  assert.equal(r.outcome, "mastered");
});

test("drillNext: a lapse below the cap re-queues the item to the back", () => {
  const r = drillNext(["a", "b", "c"], false, 1, DRILL_CAP);
  assert.deepEqual(r.queue, ["b", "c", "a"]); // other items sit between (R5)
  assert.equal(r.outcome, "requeued");
});

test("drillNext: a lapse at the cap defers the item (no more drilling this session)", () => {
  const r = drillNext(["a", "b"], false, DRILL_CAP, DRILL_CAP);
  assert.deepEqual(r.queue, ["b"]); // dropped, not re-queued
  assert.equal(r.outcome, "deferred");
});

test("drillNext: with cap=2 an item is seen at most twice before being deferred", () => {
  let queue = ["a", "b"];
  const attempts = new Map();
  const outcomes = [];
  // Always answer "a" wrong; "b" is answered correct when it surfaces.
  let guard = 0;
  while (queue.length && guard++ < 20) {
    const head = queue[0];
    const n = (attempts.get(head) ?? 0) + 1;
    attempts.set(head, n);
    const correct = head === "b";
    const r = drillNext(queue, correct, n, 2);
    if (head === "a") outcomes.push(r.outcome);
    queue = r.queue;
  }
  assert.equal(attempts.get("a"), 2); // exactly two exposures, then gone
  assert.deepEqual(outcomes, ["requeued", "deferred"]);
});

test("drillNext: empty queue is a no-op", () => {
  const r = drillNext([], false, 5, DRILL_CAP);
  assert.deepEqual(r.queue, []);
});

test("sessionKey: uses the explicit session id when present", () => {
  assert.equal(sessionKey({ t: 1, ok: true, s: "sess-42" }), "sess-42");
  assert.equal(
    sessionKey({ t: 1, ok: true, s: "a" }),
    sessionKey({ t: 999, ok: false, s: "a" }),
  ); // same id -> same session regardless of time
  assert.notEqual(
    sessionKey({ t: 1, ok: true, s: "a" }),
    sessionKey({ t: 1, ok: true, s: "b" }),
  );
});

test("sessionKey: legacy attempts (no id) group one session per day", () => {
  const base = 20_000 * 86_400_000; // aligned to a UTC-day boundary
  const morning = { t: base, ok: true };
  const evening = { t: base + 3600_000 * 8, ok: true }; // +8h, same UTC day
  const nextDay = { t: base + 86_400_000, ok: false };
  assert.equal(sessionKey(morning), sessionKey(evening));
  assert.notEqual(sessionKey(morning), sessionKey(nextDay));
  assert.match(sessionKey(morning), /^legacy:/);
});
