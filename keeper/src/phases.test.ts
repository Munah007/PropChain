// Unit tests for the pure phase router. Run with: node --test src/
import { test } from "node:test";
import assert from "node:assert/strict";
import { routePhase, PHASES, type PhaseAction } from "./phases.ts";

// Expected action per numeric StatusId — mirrors the docs table plus the
// feed-observed 100 (game_finalised) and program-defined 0 (post-final).
const EXPECTED: Record<number, PhaseAction> = {
  1: "hold", // NS
  2: "hold", // H1
  3: "hold", // HT
  4: "hold", // H2
  5: "settle", // F
  6: "hold", // WET
  7: "hold", // ET1
  8: "hold", // HTET
  9: "hold", // ET2
  10: "settle", // FET
  11: "hold", // WPE
  12: "hold", // PE
  13: "settle", // FPE
  14: "hold", // I — interrupted, may resume
  15: "abandoned", // A
  16: "abandoned", // C
  17: "abandoned", // TXCC — coverage cancelled, no proof will ever arrive
  18: "hold", // TXCS — coverage suspended, may resume
  19: "abandoned", // P
  100: "settle", // game_finalised
  0: "settle", // post-final
};

test("every documented StatusId routes to its expected action", () => {
  for (const [id, action] of Object.entries(EXPECTED)) {
    const routed = routePhase({ statusId: Number(id) });
    assert.equal(routed.action, action, `StatusId ${id}`);
    assert.ok(routed.reason.includes(`StatusId ${id}`), `reason names StatusId ${id}: ${routed.reason}`);
  }
});

test("the table itself has no ids the expectations miss (and vice versa)", () => {
  assert.deepEqual(
    Object.keys(PHASES).map(Number).sort((a, b) => a - b),
    Object.keys(EXPECTED).map(Number).sort((a, b) => a - b)
  );
});

test("letter phase codes route identically to their numeric ids", () => {
  for (const [id, def] of Object.entries(PHASES)) {
    const byCode = routePhase({ phase: def.code });
    assert.equal(byCode.action, EXPECTED[Number(id)], `phase ${def.code}`);
  }
});

test("letter codes are trimmed and case-insensitive", () => {
  assert.equal(routePhase({ phase: " fet " }).action, "settle");
  assert.equal(routePhase({ phase: "a" }).action, "abandoned");
});

test("GameState alone: scheduled holds, abandoned family voids-in-waiting", () => {
  assert.equal(routePhase({ gameState: "scheduled" }).action, "hold");
  for (const state of ["abandoned", "postponed", "cancelled", "canceled", " Abandoned "]) {
    assert.equal(routePhase({ gameState: state }).action, "abandoned", state);
  }
});

test("abandoned signal from any field vetoes a live-looking one", () => {
  // Fixture record flipped before a status event arrived…
  assert.equal(routePhase({ statusId: 4, gameState: "abandoned" }).action, "abandoned");
  // …or even against a stale final-looking StatusId.
  assert.equal(routePhase({ statusId: 100, gameState: "postponed" }).action, "abandoned");
  // Abandoned letter code beats an in-play StatusId too.
  assert.equal(routePhase({ statusId: 2, phase: "C" }).action, "abandoned");
});

test("recognised StatusId outranks a conflicting non-abandoned phase code", () => {
  assert.equal(routePhase({ statusId: 2, phase: "F" }).action, "hold");
});

test("unknown codes route to unknown with a reason", () => {
  const badId = routePhase({ statusId: 42 });
  assert.equal(badId.action, "unknown");
  assert.ok(badId.reason.includes("42"), badId.reason);

  const badCode = routePhase({ phase: "XYZ" });
  assert.equal(badCode.action, "unknown");
  assert.ok(badCode.reason.includes("XYZ"), badCode.reason);

  const badState = routePhase({ gameState: "in_limbo" });
  assert.equal(badState.action, "unknown");
  assert.ok(badState.reason.includes("in_limbo"), badState.reason);
});

test("no signal at all routes to unknown", () => {
  assert.deepEqual(routePhase({}), { action: "unknown", reason: "no phase information" });
  assert.equal(routePhase({ statusId: null, phase: null, gameState: null }).action, "unknown");
  assert.equal(routePhase({ phase: "", gameState: "" }).action, "unknown");
});

test("observed feed ladders route sanely end to end", () => {
  // Regulation-only match (fixture 18218149): 1→2→3→4→5→(amend)4→100.
  const regulation = [1, 2, 3, 4, 5, 4, 100].map((id) => routePhase({ statusId: id }).action);
  assert.deepEqual(regulation, ["hold", "hold", "hold", "hold", "settle", "hold", "settle"]);
  // Extra-time match (fixture 18213979): 4→6→7→8→9→10→100.
  const extraTime = [6, 7, 8, 9, 10, 100].map((id) => routePhase({ statusId: id }).action);
  assert.deepEqual(extraTime, ["hold", "hold", "hold", "hold", "settle", "settle"]);
});
