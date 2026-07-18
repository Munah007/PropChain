// Signals: where the recorded tournament disagrees with the pool.
//
// Every open market has two probabilities attached to it. One comes from the
// World Cup our keeper recorded — how often this exact predicate actually came
// in over 78 finals. The other comes from the money — the over side's share of
// the pot, which is the break-even probability the pool is currently offering.
//
// When those diverge, one of them is wrong, and the gap is the signal. We take
// no view on which is wrong; we surface the disagreement and let the user
// decide. Markets we cannot price honestly (corners, cards) are listed as
// unpriced rather than quietly dropped — a judge should be able to see the
// edges of what we know.

import { Injectable } from "@nestjs/common";
import { FixturesService } from "../fixtures/fixtures.service";
import { TxsService } from "../solana/txs.service";
import { fairValue, poolImplied, PriceSource } from "../pricing/base-rates";
import { MarketPredicate } from "../pricing/predicate";

/** Below this, the disagreement is noise rather than an edge. */
const MIN_EDGE_PP = 5;

export interface Signal {
  betAddress: string;
  fixtureId: string;
  home: string | null;
  away: string | null;
  kickoffTs: number;
  market: MarketPredicate;
  /** Side the edge points at: backing this is the value bet. */
  side: "over" | "under" | null;
  /** Empirical probability the over side wins, from recorded finals. */
  fairProb: number | null;
  /** Break-even probability the pool currently offers the over side. */
  impliedProb: number | null;
  /** Signed percentage points of disagreement on the recommended side. */
  edgePp: number | null;
  source: PriceSource;
  n: number;
  reason?: string;
  overTotal: string;
  underTotal: string;
}

@Injectable()
export class SignalsService {
  constructor(
    private readonly fixtures: FixturesService,
    private readonly txs: TxsService
  ) {}

  /**
   * Open markets, ranked by how far the pool has drifted from the recorded
   * base rate. Unpriced markets sort last — they carry no edge, but they are
   * still shown so the board reflects everything that is actually open.
   */
  async list(): Promise<{ signals: Signal[]; finals: number; minEdgePp: number }> {
    const [bets, fixtures] = await Promise.all([this.txs.listBets(), this.fixtures.list()]);
    const finals = this.fixtures.recordedFinals();
    const byId = new Map(fixtures.map((f) => [String(f.fixtureId), f]));

    const signals = bets
      .filter((b: any) => b.status === "open")
      .map((b: any) => this.signalFor(b, byId.get(b.fixtureId), finals))
      .filter((s): s is Signal => s !== null)
      .sort((a, b) => (b.edgePp ?? -1) - (a.edgePp ?? -1));

    return { signals, finals: finals.length, minEdgePp: MIN_EDGE_PP };
  }

  private signalFor(bet: any, fixture: any, finals: ReturnType<FixturesService["recordedFinals"]>): Signal | null {
    const market: MarketPredicate = {
      statKeyA: bet.statKeyA,
      statKeyB: bet.statKeyB,
      op: bet.op,
      kind: bet.kind,
      comparison: bet.comparison,
      threshold: bet.threshold,
    };

    const fv = fairValue(market, finals);
    const implied = poolImplied(BigInt(bet.overTotal), BigInt(bet.underTotal));

    const base: Signal = {
      betAddress: bet.address,
      fixtureId: bet.fixtureId,
      home: fixture?.home ?? null,
      away: fixture?.away ?? null,
      kickoffTs: bet.kickoffTs,
      market,
      side: null,
      fairProb: fv.prob,
      impliedProb: implied,
      edgePp: null,
      source: fv.source,
      n: fv.n,
      reason: fv.reason,
      overTotal: bet.overTotal,
      underTotal: bet.underTotal,
    };

    // No edge without both numbers. A one-sided pool implies nothing yet, and
    // an unpriced market has nothing to compare against — both are honest
    // states, not failures, so they're returned with side/edge left null.
    if (fv.prob == null || implied == null) {
      return { ...base, reason: base.reason ?? (implied == null ? "nobody has taken the other side yet" : undefined) };
    }

    // Positive gap → the pool underrates the over side; negative → it underrates
    // the under side. The edge we report is always on the side we'd back.
    const gapPp = (fv.prob - implied) * 100;
    if (Math.abs(gapPp) < MIN_EDGE_PP) return { ...base, side: null, edgePp: Math.abs(gapPp) };

    return {
      ...base,
      side: gapPp > 0 ? "over" : "under",
      edgePp: Math.abs(gapPp),
    };
  }
}
