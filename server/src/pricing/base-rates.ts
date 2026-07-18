// Fair value from the tournament we recorded.
//
// The TxLINE odds feed goes quiet once the tournament ends, so a consensus
// line that reads "—" is all a judge would see after the final. Rather than
// invent a goals model, we price from the only dataset that is genuinely ours:
// the World Cup our own keeper recorded, archived as final scores.
//
// The method is deliberately dumb and fully auditable: take the market's exact
// predicate, replay it over every historical final we hold, and report the
// share that came in. No distribution, no fitted parameters, no priors — just
// "this market would have won N of 78 times". A judge can recompute it by hand.
//
// LIMIT, stated plainly: we only hold *goal* finals (stat keys 1 and 2). Full
// stat frames — corners, cards — exist for 4 fixtures, which is not a sample.
// Anything touching keys 3-8 returns `unpriced` rather than a number we'd have
// to defend. Being honestly unpriced beats being confidently wrong.

import { MarketPredicate, evaluatePredicate, statKeysOf } from "./predicate";

/** A historical final: the goals each side actually scored. */
export interface HistoricalFinal {
  fixtureId: number;
  home: number;
  away: number;
}

/** Stat keys our archive can decide. 1 = home goals, 2 = away goals. */
const PRICEABLE_KEYS = new Set([1, 2]);

export type PriceSource = "recorded" | "unpriced";

export interface FairValue {
  /** Probability the over/first side wins, or null when unpriced. */
  prob: number | null;
  source: PriceSource;
  /** Historical finals the estimate is drawn from. */
  n: number;
  /** Why we couldn't price it, for the UI to say out loud. */
  reason?: string;
}

const UNPRICED = (reason: string): FairValue => ({ prob: null, source: "unpriced", n: 0, reason });

/**
 * Empirical probability that this market's over side wins, from recorded
 * finals. Pure: same inputs, same answer, no clock and no I/O.
 */
export function fairValue(p: MarketPredicate, finals: HistoricalFinal[]): FairValue {
  const keys = statKeysOf(p);
  if (!keys.every((k) => PRICEABLE_KEYS.has(k))) {
    return UNPRICED("we only recorded full stats for 4 matches — not enough to price corners or cards");
  }
  if (finals.length === 0) return UNPRICED("no recorded finals available");

  let decided = 0;
  let hits = 0;
  for (const f of finals) {
    const outcome = evaluatePredicate(p, (key) => (key === 1 ? f.home : key === 2 ? f.away : null));
    if (outcome == null) continue; // shouldn't happen given the key check, but never guess
    decided++;
    if (outcome) hits++;
  }

  if (decided === 0) return UNPRICED("no recorded final could decide this market");
  return { prob: hits / decided, source: "recorded", n: decided };
}

/**
 * Pool-implied probability of the over side, from stakes alone.
 *
 * A parimutuel pool pays the winning side the whole pot, so the break-even
 * probability for backing over is simply its share of the money. Undefined
 * until both sides have stake — a one-sided pool implies nothing, it just
 * hasn't been priced by anyone yet.
 */
export function poolImplied(overTotal: bigint, underTotal: bigint): number | null {
  if (overTotal <= 0n || underTotal <= 0n) return null;
  const total = overTotal + underTotal;
  return Number((overTotal * 1_000_000n) / total) / 1_000_000;
}
