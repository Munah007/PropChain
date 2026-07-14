// Unit tests for proTeamSide — the market-direction core. Run with: npm test
// (compiles first; node's type stripping can't load these extensionless imports
// straight from src). Stat keys: 1/2 goals, 3/4 yellow cards (odd=home).
import { test } from "node:test";
import assert from "node:assert/strict";
import { proTeamSide, DirectionalBet } from "./direction";

const FIXTURE = { home: "France", away: "Brazil" };

// Winner/margin market = Subtract(home, away). "greater" → over favors home.
const winner = (comparison: "greater" | "less"): DirectionalBet => ({
  statKeyA: 1,
  statKeyB: 2,
  op: "subtract",
  kind: "line",
  comparison,
});
// Single-team stat (op null, statKeyB null): the key picks the team.
const singleStat = (statKeyA: number, comparison: "greater" | "less" = "greater"): DirectionalBet => ({
  statKeyA,
  statKeyB: null,
  op: null,
  kind: "line",
  comparison,
});

test("winner market: home team roots over", () => {
  assert.equal(proTeamSide(winner("greater"), FIXTURE, "France"), "over");
});

test("winner market: away team roots under", () => {
  assert.equal(proTeamSide(winner("greater"), FIXTURE, "Brazil"), "under");
});

test("winner market with 'less' comparison flips the home team to under", () => {
  // home − away LESS than N favors the away side, so home now roots under.
  assert.equal(proTeamSide(winner("less"), FIXTURE, "France"), "under");
});

test("single-team goals: the team's own goals over roots over", () => {
  // stat key 1 = home (France) goals; more goals is good for France.
  assert.equal(proTeamSide(singleStat(1), FIXTURE, "France"), "over");
});

test("single-team goals: the opponent's goals over roots under for the team", () => {
  // stat key 2 = away (Brazil) goals; Brazil scoring is bad for France.
  assert.equal(proTeamSide(singleStat(2), FIXTURE, "France"), "under");
});

test("card stat: the team's own yellow cards over roots UNDER (cards are bad)", () => {
  // stat key 3 = home (France) yellow cards; fewer is better, so France wants under.
  assert.equal(proTeamSide(singleStat(3), FIXTURE, "France"), "under");
});

test("bothScore market is neutral (null)", () => {
  assert.equal(proTeamSide({ ...winner("greater"), kind: "bothScore" }, FIXTURE, "France"), null);
});

test("combined two-team total (Add) is neutral (null)", () => {
  const total: DirectionalBet = { statKeyA: 7, statKeyB: 8, op: "add", kind: "line", comparison: "greater" };
  assert.equal(proTeamSide(total, FIXTURE, "France"), null);
});

test("team not in the fixture is neutral (null)", () => {
  assert.equal(proTeamSide(winner("greater"), FIXTURE, "Spain"), null);
});
