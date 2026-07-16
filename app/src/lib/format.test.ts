// Phase wording. These labels are the only part of the board that reads a raw
// TxLINE StatusId, and the codes they key on are documented in
// server/src/fixtures/phases.ts (truth) and keeper/src/phases.ts (settlement).
// Live football exercises HT/ET/pens rarely and a compressed demo replay flies
// past them, so they are covered here rather than by driving the app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { finishedLabel, livePhaseLabel } from "./format.ts";

test("in-play phases carry the clock when the feed is running it", () => {
  assert.equal(livePhaseLabel(2, 23), "Live · 23'"); // H1
  assert.equal(livePhaseLabel(4, 63), "Live · 63'"); // H2
  assert.equal(livePhaseLabel(7, 97), "Extra time · 97'"); // ET1
  assert.equal(livePhaseLabel(9, 112), "Extra time · 112'"); // ET2
});

test("breaks in play read as breaks, not as a clockless 'Live'", () => {
  // The feed stops the clock at HT, so `minute` is null and the old card fell
  // back to a bare "Live" — indistinguishable from a match actually running.
  assert.equal(livePhaseLabel(3, null), "Half time");
  assert.equal(livePhaseLabel(8, null), "Extra time · half time");
  assert.equal(livePhaseLabel(6, null), "Extra time next");
  assert.equal(livePhaseLabel(11, null), "Penalties next");
  assert.equal(livePhaseLabel(12, null), "Penalties");
});

test("stoppages that may resume are named, not silently dropped", () => {
  assert.equal(livePhaseLabel(14, null), "Interrupted"); // I
  assert.equal(livePhaseLabel(18, null), "Coverage suspended"); // TXCS
});

test("unknown or absent status defers to the caller's default", () => {
  // A code we have never seen must degrade to "Live", never blank the strip.
  assert.equal(livePhaseLabel(99, 12), null);
  assert.equal(livePhaseLabel(null, 55), null);
  assert.equal(livePhaseLabel(undefined, null), null);
  // NS: the card is in its `upcoming` branch here, so it has no live wording.
  assert.equal(livePhaseLabel(1, null), null);
});

test("every ended phase reads Full time", () => {
  // 5 (F) is included deliberately: the board shows the whistle even though
  // the chain refuses to settle on it (state.rs excludes 5 from
  // FINAL_STAT_PERIODS, since the feed has been observed reverting F -> H2).
  for (const id of [5, 10, 13, 100, 0]) assert.equal(finishedLabel(id), "Full time");
});

test("abandoned fixtures never claim a full time that never happened", () => {
  assert.equal(finishedLabel(15), "Abandoned");
  assert.equal(finishedLabel(16), "Cancelled");
  assert.equal(finishedLabel(17), "Cancelled"); // TXCC — coverage cancelled
  assert.equal(finishedLabel(19), "Postponed");
  assert.equal(finishedLabel(null), "Full time"); // pre-statusId archives
});
