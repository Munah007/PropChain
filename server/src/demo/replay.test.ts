// Unit tests for the pure replay remap. Run with: npm test (compiles first —
// node's type stripping can't load extensionless CJS-style imports from src).
import { test } from "node:test";
import assert from "node:assert/strict";
import { remapReplayTimeline } from "./replay";

const frame = (tsMs: number) => ({ tsMs });

test("maps recording start, midpoint and end onto the replay window", () => {
  const mapped = remapReplayTimeline([frame(1_000), frame(1_500), frame(2_000)], 50_000, 180_000);
  assert.deepEqual(
    mapped.map((f) => f.playAtMs),
    [50_000, 140_000, 230_000] // start, halfway, start+duration
  );
});

test("preserves relative pacing for uneven gaps", () => {
  const mapped = remapReplayTimeline([frame(0), frame(100), frame(1_000)], 0, 10_000);
  assert.deepEqual(
    mapped.map((f) => f.playAtMs),
    [0, 1_000, 10_000]
  );
});

test("empty recording maps to nothing", () => {
  assert.deepEqual(remapReplayTimeline([], 50_000, 180_000), []);
});

test("single-event recording plays immediately at the window start", () => {
  const mapped = remapReplayTimeline([frame(1_234)], 50_000, 180_000);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].playAtMs, 50_000);
});

test("zero-length span (identical timestamps) plays at the window start", () => {
  const mapped = remapReplayTimeline([frame(1_000), frame(1_000)], 50_000, 180_000);
  assert.deepEqual(
    mapped.map((f) => f.playAtMs),
    [50_000, 50_000]
  );
});

test("keeps frame payload fields intact while adding playAtMs", () => {
  const mapped = remapReplayTimeline([{ tsMs: 7, seq: 42, home: 1 }], 100, 60_000);
  assert.deepEqual(mapped[0], { tsMs: 7, seq: 42, home: 1, playAtMs: 100 });
});
