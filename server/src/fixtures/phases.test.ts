// The board's live/finished decision. Every StatusId asserted here was
// observed in recordings/scores-*.jsonl; the table itself is documented in
// keeper/src/phases.ts, which this file must not drift from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isMatchEnded, isMatchOver } from "./phases";

test("ended phases: play stopped with a result that stands", () => {
  assert.equal(isMatchEnded(5), true); // F   — ended after regulation
  assert.equal(isMatchEnded(10), true); // FET — ended after extra time
  assert.equal(isMatchEnded(13), true); // FPE — ended after penalties
  assert.equal(isMatchEnded(100), true); // GF  — game finalised
  assert.equal(isMatchEnded(0), true); // PF  — post-final
});

test("a match in progress is never ended or over", () => {
  // 2/4 dominate the recordings; 7/9 are the extra-time halves. A regression
  // here would settle a live match — the failure this whole table exists to
  // prevent.
  for (const id of [1, 2, 3, 4, 6, 7, 8, 9, 11, 12]) {
    assert.equal(isMatchEnded(id), false, `StatusId ${id} must not read as ended`);
    assert.equal(isMatchOver(id), false, `StatusId ${id} must not read as over`);
  }
});

test("abandoned family is over, but never 'ended' — no result was produced", () => {
  for (const id of [15, 16, 17, 19]) {
    assert.equal(isMatchOver(id), true, `StatusId ${id} must read as over`);
    assert.equal(isMatchEnded(id), false, `StatusId ${id} must not claim a result`);
  }
});

test("stoppages that may resume stay live", () => {
  // 14 (I, interrupted) and 18 (TXCS, coverage suspended) can both resume, so
  // retiring the card at either would strand a match that comes back.
  assert.equal(isMatchOver(14), false);
  assert.equal(isMatchOver(18), false);
});

test("unknown status falls back to the caller's clock heuristic", () => {
  // Archives written before statusId existed read back null. They must not
  // assert a match is over on no evidence.
  assert.equal(isMatchOver(null), false);
  assert.equal(isMatchOver(undefined), false);
  assert.equal(isMatchOver(42), false);
  assert.equal(isMatchEnded(null), false);
});
