// The market predicate, evaluated off-chain.
//
// This is a faithful mirror of what `propose_settlement` asks TxLINE's
// `validate_stat` to decide on-chain: the same stat keys, the same operator,
// the same comparison, the same strict inequality. We re-implement it here so
// we can replay a market against *historical* finals — the program itself only
// ever runs against a Merkle-proved live stat.
//
// Keeping the two in lockstep matters: if this drifts from the Rust predicate,
// our fair value is pricing a different bet than the one that settles. The
// bankrun suite pins the on-chain side; the tests next door pin this one.
//
// TxLINE base stat keys: 1/2 goals, 3/4 yellows, 5/6 reds, 7/8 corners
// (odd = home, even = away).

export interface MarketPredicate {
  statKeyA: number;
  statKeyB: number | null;
  op: "add" | "subtract" | null;
  kind: "line" | "bothScore";
  comparison: "greater" | "less";
  threshold: number;
}

/** Final value of a stat key, or null when we have no record of it. */
export type StatLookup = (statKey: number) => number | null;

/** Every stat key a predicate needs to be decidable. */
export function statKeysOf(p: MarketPredicate): number[] {
  return p.statKeyB == null ? [p.statKeyA] : [p.statKeyA, p.statKeyB];
}

/**
 * Does the "over" / first side win, given these final stats?
 *
 * Returns null when any required stat is unknown — never a guess. Callers
 * treat null as "cannot price", which is the honest answer for a market whose
 * stats we never recorded.
 */
export function evaluatePredicate(p: MarketPredicate, stats: StatLookup): boolean | null {
  const a = stats(p.statKeyA);
  if (a == null) return null;

  // BothScore ANDs two single-stat comparisons — the same two CPIs the program
  // makes. Used by both-teams-to-score and both-teams-booked.
  if (p.kind === "bothScore") {
    if (p.statKeyB == null) return null;
    const b = stats(p.statKeyB);
    if (b == null) return null;
    return compare(a, p) && compare(b, p);
  }

  if (p.op == null) return compare(a, p); // single-stat line
  const b = stats(p.statKeyB ?? -1);
  if (b == null) return null;
  return compare(p.op === "add" ? a + b : a - b, p);
}

/**
 * Strict comparison, matching the program. The push rule lives here: a value
 * exactly equal to the threshold fails `greater`, so the under side takes it —
 * which is why the UI renders integer thresholds as half-lines ("N.5").
 */
function compare(value: number, p: MarketPredicate): boolean {
  return p.comparison === "greater" ? value > p.threshold : value < p.threshold;
}
