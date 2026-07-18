// Unit tests for the predicate mirror and the recorded-finals pricer.
// Run with: npm test (compiles first — node's type stripping can't load these
// extensionless imports straight from src).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketPredicate, evaluatePredicate } from "./predicate";
import { fairValue, poolImplied, HistoricalFinal } from "./base-rates";

const goals = (home: number, away: number) => (k: number) => (k === 1 ? home : k === 2 ? away : null);

const totalGoals = (threshold: number): MarketPredicate => ({
  statKeyA: 1, statKeyB: 2, op: "add", kind: "line", comparison: "greater", threshold,
});
const homeWin: MarketPredicate = {
  statKeyA: 1, statKeyB: 2, op: "subtract", kind: "line", comparison: "greater", threshold: 0,
};
const btts: MarketPredicate = {
  statKeyA: 1, statKeyB: 2, op: null, kind: "bothScore", comparison: "greater", threshold: 0,
};
const totalCorners: MarketPredicate = {
  statKeyA: 7, statKeyB: 8, op: "add", kind: "line", comparison: "greater", threshold: 9,
};

// ---------- predicate mirror ----------

test("total goals: strict greater, so exactly-threshold goes under (the push rule)", () => {
  assert.equal(evaluatePredicate(totalGoals(2), goals(2, 1)), true); // 3 > 2
  assert.equal(evaluatePredicate(totalGoals(2), goals(1, 1)), false); // 2 is not > 2
});

test("winner market subtracts away from home", () => {
  assert.equal(evaluatePredicate(homeWin, goals(2, 1)), true);
  assert.equal(evaluatePredicate(homeWin, goals(1, 1)), false); // a draw is not a home win
  assert.equal(evaluatePredicate(homeWin, goals(0, 3)), false);
});

test("bothScore ANDs the two sides — one blank sheet kills it", () => {
  assert.equal(evaluatePredicate(btts, goals(1, 1)), true);
  assert.equal(evaluatePredicate(btts, goals(3, 0)), false);
  assert.equal(evaluatePredicate(btts, goals(0, 0)), false);
});

test("clean sheet is a Less comparison on the opponent's goals", () => {
  const homeCleanSheet: MarketPredicate = {
    statKeyA: 2, statKeyB: null, op: null, kind: "line", comparison: "less", threshold: 1,
  };
  assert.equal(evaluatePredicate(homeCleanSheet, goals(2, 0)), true);
  assert.equal(evaluatePredicate(homeCleanSheet, goals(2, 1)), false);
});

test("an unknown stat is null, never a guess", () => {
  assert.equal(evaluatePredicate(totalCorners, goals(2, 1)), null);
});

// ---------- recorded-finals pricer ----------

const FINALS: HistoricalFinal[] = [
  { fixtureId: 1, home: 2, away: 1 }, // 3 goals, home win, btts
  { fixtureId: 2, home: 0, away: 0 }, // 0 goals, draw, no btts
  { fixtureId: 3, home: 1, away: 1 }, // 2 goals, draw, btts
  { fixtureId: 4, home: 3, away: 0 }, // 3 goals, home win, no btts
];

test("fair value is the share of recorded finals the over side won", () => {
  const fv = fairValue(totalGoals(2), FINALS); // over 2.5: fixtures 1 and 4
  assert.equal(fv.source, "recorded");
  assert.equal(fv.n, 4);
  assert.equal(fv.prob, 0.5);
});

test("home win prices at its empirical rate", () => {
  assert.equal(fairValue(homeWin, FINALS).prob, 0.5);
});

test("btts prices at its empirical rate", () => {
  assert.equal(fairValue(btts, FINALS).prob, 0.5);
});

test("corners and cards are unpriced, with a reason — we never fabricate a number", () => {
  const fv = fairValue(totalCorners, FINALS);
  assert.equal(fv.source, "unpriced");
  assert.equal(fv.prob, null);
  assert.match(fv.reason ?? "", /not enough/i);
});

test("no recorded finals means unpriced, not divide-by-zero", () => {
  const fv = fairValue(totalGoals(2), []);
  assert.equal(fv.source, "unpriced");
  assert.equal(fv.prob, null);
});

// ---------- pool-implied ----------

test("pool-implied is the over side's share of the pot", () => {
  assert.equal(poolImplied(30n, 10n), 0.75);
  assert.equal(poolImplied(10n, 10n), 0.5);
});

test("a one-sided pool implies nothing", () => {
  assert.equal(poolImplied(10n, 0n), null);
  assert.equal(poolImplied(0n, 10n), null);
  assert.equal(poolImplied(0n, 0n), null);
});
