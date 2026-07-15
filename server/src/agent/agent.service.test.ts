// Unit tests for the pure planner planStakes() — the agent's decision logic,
// exercised with no chain. Run with: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planStakes, PlannerBet, PlannerFixture } from "./agent.planner";
import { AgentConfig } from "./agent.dto";

const NOW = 1_000; // fixed "now" (unix seconds)
const FIXTURE: PlannerFixture = { fixtureId: 100, home: "France", away: "Brazil" };
const pusdc = (n: number) => String(n * 1_000_000); // whole pUSDC → base-unit string

// A pro-France (home) winner market: over favors France, under is "against".
const franceBet = (overrides: Partial<PlannerBet> = {}): PlannerBet => ({
  address: "BET1",
  fixtureId: "100",
  statKeyA: 1,
  statKeyB: 2,
  op: "subtract",
  kind: "line",
  comparison: "greater",
  kickoffTs: 5_000, // future
  status: "open",
  overTotal: pusdc(0),
  underTotal: pusdc(0),
  ...overrides,
});

const config = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  enabled: true,
  teams: ["France"],
  mode: "react",
  minStake: 1,
  maxStake: 10,
  maxBetsPerDay: 5,
  ...overrides,
});

const plan = (
  cfg: AgentConfig,
  bets: PlannerBet[],
  positions: { bet: string }[] = [],
  entered = new Set<string>(),
  todayCount = 0
) => planStakes(cfg, bets, [FIXTURE], positions, entered, todayCount, NOW);

test("react: fires on the pro-team side once the against side carries stake", () => {
  const result = plan(config(), [franceBet({ underTotal: pusdc(5) })]);
  assert.deepEqual(result.map((p) => ({ betAddress: p.betAddress, side: p.side, amount: p.amount })), [
    { betAddress: "BET1", side: "over", amount: 5 },
  ]);
});

test("react: does NOT fire while the against side is empty", () => {
  assert.deepEqual(plan(config(), [franceBet({ underTotal: pusdc(0) })]), []);
});

test("seed: fires with no opponent, staking exactly minStake", () => {
  const result = plan(config({ mode: "seed", minStake: 2 }), [franceBet()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].side, "over");
  assert.equal(result[0].amount, 2);
});

test("skips a pool the user already holds a position in", () => {
  const result = plan(config(), [franceBet({ underTotal: pusdc(5) })], [{ bet: "BET1" }]);
  assert.deepEqual(result, []);
});

test("skips non-directional pools (combined Add total)", () => {
  const total = franceBet({ op: "add", statKeyA: 7, statKeyB: 8, underTotal: pusdc(5) });
  assert.deepEqual(plan(config(), [total]), []);
});

test("respects maxBetsPerDay across the remaining budget", () => {
  const a = franceBet({ address: "A", underTotal: pusdc(5) });
  const b = franceBet({ address: "B", underTotal: pusdc(5) });
  // cap 1, already placed 0 → exactly one bet planned.
  assert.equal(plan(config({ maxBetsPerDay: 1 }), [a, b]).length, 1);
  // cap 1, already placed 1 today → nothing left.
  assert.equal(plan(config({ maxBetsPerDay: 1 }), [a, b], [], new Set(), 1).length, 0);
});

test("clamps the react amount into [minStake, maxStake]", () => {
  // Opposing 50 pUSDC clamps down to maxStake 10.
  assert.equal(plan(config({ maxStake: 10 }), [franceBet({ underTotal: pusdc(50) })])[0].amount, 10);
  // Opposing 0.5 pUSDC (still > 0) clamps up to minStake 1.
  assert.equal(plan(config({ minStake: 1 }), [franceBet({ underTotal: pusdc(0.5) })])[0].amount, 1);
});

test("skips pools the agent has already entered", () => {
  const result = plan(config(), [franceBet({ underTotal: pusdc(5) })], [], new Set(["BET1"]));
  assert.deepEqual(result, []);
});

test("skips settled and past-kickoff bets", () => {
  const settled = franceBet({ address: "S", status: "settled", underTotal: pusdc(5) });
  const past = franceBet({ address: "P", kickoffTs: NOW - 1, underTotal: pusdc(5) });
  assert.deepEqual(plan(config(), [settled, past]), []);
});

test("disabled or team-less config plans nothing", () => {
  assert.deepEqual(plan(config({ enabled: false }), [franceBet({ underTotal: pusdc(5) })]), []);
  assert.deepEqual(plan(config({ teams: [] }), [franceBet({ underTotal: pusdc(5) })]), []);
});
