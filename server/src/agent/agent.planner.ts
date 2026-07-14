// The 12th Man's decision core, kept PURE so it can be unit-tested without a
// chain: given the current world (config, open bets, fixtures, the user's own
// positions, which pools we've already entered, and today's placement count)
// it returns the exact list of stakes the agent WOULD place this tick. The
// service's executor is a thin wrapper that actually signs+sends these.

import { proTeamSide, DirectionalBet, DirectionalFixture } from "./direction";
import { AgentConfig } from "./agent.dto";

const BASE_UNITS = 1_000_000; // pUSDC has 6 decimals (overTotal/underTotal are base units)

// Only the fields the planner reads — structurally satisfied by BetsService.list().
// Market-shape fields are typed as `string` (not the DirectionalBet unions) so
// the widened listBets() return assigns without a cast; they're narrowed once,
// below, before proTeamSide sees them.
export interface PlannerBet {
  address: string;
  fixtureId: string; // string form, matched against String(fixture.fixtureId)
  kickoffTs: number; // unix seconds
  status: string; // "open" | "settlementPending" | "settled" | "voided"
  overTotal: string; // base units
  underTotal: string; // base units
  statKeyA: number;
  statKeyB: number | null;
  op: string | null;
  kind: string;
  comparison: string;
}

// Narrow a PlannerBet's market fields to the DirectionalBet contract. The
// runtime values are always valid — this just satisfies the type system.
const asDirectional = (bet: PlannerBet): DirectionalBet => ({
  statKeyA: bet.statKeyA,
  statKeyB: bet.statKeyB,
  op: bet.op as DirectionalBet["op"],
  kind: bet.kind as DirectionalBet["kind"],
  comparison: bet.comparison as DirectionalBet["comparison"],
});

export interface PlannerFixture extends DirectionalFixture {
  fixtureId: number;
}

// The user's existing on-chain positions — we only need which pool each is in.
export interface PlannerPosition {
  bet: string; // bet PDA the position belongs to
}

export interface PlannedStake {
  betAddress: string;
  side: "over" | "under";
  amount: number; // whole pUSDC
  fixtureId: string;
  team: string;
  reason: string; // human-readable "why" for the activity log
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/**
 * Decide every stake the agent should place for one user this tick. Skips, in
 * order: non-open / past-kickoff bets, bets with no known fixture, pools not
 * directional for any configured team, pools already entered by the agent,
 * pools the user already holds a position in (avoids the on-chain one-side-per-
 * bet SideMismatch and respects their manual choice). React mode only fires
 * once the AGAINST-team side carries stake; seed mode fires on every qualifying
 * open pool. Stops once maxBetsPerDay (todayCount + placed this tick) is hit.
 */
export function planStakes(
  config: AgentConfig,
  bets: PlannerBet[],
  fixtures: PlannerFixture[],
  userPositions: PlannerPosition[],
  alreadyEntered: ReadonlySet<string>,
  todayCount: number,
  nowSec: number
): PlannedStake[] {
  if (!config.enabled || config.teams.length === 0) return [];

  const fixtureById = new Map(fixtures.map((f) => [String(f.fixtureId), f]));
  const heldPools = new Set(userPositions.map((p) => p.bet));
  const plan: PlannedStake[] = [];
  let budget = config.maxBetsPerDay - todayCount; // remaining bets allowed today

  for (const bet of bets) {
    if (budget <= 0) break; // daily cap reached — nothing more this tick
    if (bet.status !== "open") continue; // only live pools
    if (bet.kickoffTs <= nowSec) continue; // kickoff must still be in the future
    if (alreadyEntered.has(bet.address)) continue; // one agent entry per pool ever
    if (heldPools.has(bet.address)) continue; // user already picked a side here

    const fixture = fixtureById.get(bet.fixtureId);
    if (!fixture) continue; // no home/away known → can't know the team's side

    // First configured team that this market actually roots for wins the pool;
    // a fixture only ever holds one of them (home or away).
    let side: "over" | "under" | null = null;
    let team = "";
    const directional = asDirectional(bet);
    for (const t of config.teams) {
      const s = proTeamSide(directional, fixture, t);
      if (s) {
        side = s;
        team = t;
        break;
      }
    }
    if (!side) continue; // not directional for any of the user's teams

    // The AGAINST-team side is the one opposite the pro-team side.
    const opposingBaseUnits = Number(side === "over" ? bet.underTotal : bet.overTotal);
    const opposingTotal = opposingBaseUnits / BASE_UNITS;

    let amount: number;
    let reason: string;
    if (config.mode === "seed") {
      // Proactively plant the flag even with no doubter yet — minimum stake.
      amount = config.minStake;
      reason = "seed: pro-team entry on open market";
    } else {
      // react: only answer once someone has staked against the team.
      if (opposingTotal <= 0) continue;
      amount = clamp(opposingTotal, config.minStake, config.maxStake);
      reason = `react: matched ${opposingTotal} pUSDC against ${team}`;
    }

    plan.push({ betAddress: bet.address, side, amount, fixtureId: bet.fixtureId, team, reason });
    budget--;
  }

  return plan;
}
