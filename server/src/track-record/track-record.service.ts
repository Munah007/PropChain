// Track record: the public ledger of every market this protocol ever settled,
// each one shown next to the proof that decided it.
//
// The claim PropChain makes is that no human decides an outcome — a settled
// market is settled because a TxLINE Merkle proof verified on-chain via CPI.
// A claim like that is only worth anything if it is countable, so this endpoint
// counts it: every settled market, and how many of them carry a proof. The
// interesting number is the one that would expose us — a settled market with no
// proof behind it would mean something settled by trust, and it would show up
// here as a gap in proofBackedPct. There is no admin path that could produce
// one, which is exactly why publishing the count costs us nothing.
//
// The `pending` record (result, proofTs, challengeDeadlineTs) is deliberately
// RETAINED on-chain after finalize rather than cleared, so a settled bet still
// carries the timestamp of the proof that decided it. That retention is what
// makes this ledger reconstructible from chain state alone.

import { Injectable, Logger } from "@nestjs/common";
import { FixturesService } from "../fixtures/fixtures.service";
import { TxsService } from "../solana/txs.service";

/** The on-chain bet fields this module reads — a structural subset of listBets(). */
export interface TrackRecordBet {
  address: string;
  fixtureId: string; // string on the bet, number on the fixture — see resolveTeams
  statKeyA: number;
  statKeyB: number | null;
  op: string | null;
  kind: string;
  comparison: string;
  threshold: number;
  status: string; // "open" | "settlementPending" | "settled" | "voided"
  pending: { result: boolean; proofTs: string; challengeDeadlineTs: number } | null;
  overTotal: string; // base units, 6 decimals — never a JS number, see below
  underTotal: string;
}

export interface TrackRecordSummary {
  marketsCreated: number;
  settled: number;
  voided: number;
  open: number; // includes settlementPending: money is still at stake, nothing is final
  /** Total ever staked, in pUSDC base units. String because the sum can exceed 2^53. */
  totalStakedBaseUnits: string;
  /** The same figure in whole pUSDC, for display only — do not settle math on it. */
  totalStakedUsdc: number;
  settledWithProof: number;
  /** The headline: share of settled markets decided by a verified proof. */
  proofBackedPct: number;
}

export interface SettledMarket {
  betAddress: string;
  fixtureId: string;
  home: string | null;
  away: string | null;
  statKeyA: number;
  statKeyB: number | null;
  op: string | null;
  kind: string;
  comparison: string;
  threshold: number;
  /** True when the over side won — the proven answer to the predicate. */
  result: boolean | null;
  proofTs: string | null; // ms epoch as a string; u64 on-chain
  challengeDeadlineTs: number | null;
  overTotal: string;
  underTotal: string;
  /** Winning side's pool, so the payout scale is readable without re-deriving it. */
  winningTotal: string;
}

const USDC_DECIMALS = 1_000_000;

/**
 * Aggregate counts over every bet the program has ever held.
 *
 * Totals are summed as BigInt, not Number: these are 6-decimal base units, and
 * a few hundred thousand pUSDC across a tournament is well inside 2^53 today
 * but the sum has no ceiling and silent float drift in a "provability" endpoint
 * would be self-defeating. Exported and pure so the arithmetic is testable
 * without an RPC.
 */
export function summarize(bets: TrackRecordBet[]): TrackRecordSummary {
  let settled = 0;
  let voided = 0;
  let open = 0;
  let settledWithProof = 0;
  let staked = 0n;

  for (const bet of bets) {
    // A malformed total must not zero out the whole ledger, so parse defensively.
    staked += toBaseUnits(bet.overTotal) + toBaseUnits(bet.underTotal);
    if (bet.status === "settled") {
      settled++;
      if (hasProof(bet)) settledWithProof++;
    } else if (bet.status === "voided") {
      voided++;
    } else {
      open++;
    }
  }

  return {
    marketsCreated: bets.length,
    settled,
    voided,
    open,
    totalStakedBaseUnits: staked.toString(),
    totalStakedUsdc: Number(staked) / USDC_DECIMALS,
    settledWithProof,
    // No settled markets yet is 100%, not 0% — nothing has gone unproven. The
    // metric measures unproven settlements, and there are none either way.
    proofBackedPct: settled === 0 ? 100 : round2((settledWithProof / settled) * 100),
  };
}

/** A proof exists only if it carries the timestamp it was verified at. */
function hasProof(bet: TrackRecordBet): boolean {
  return bet.pending != null && bet.pending.proofTs != null && bet.pending.proofTs !== "0";
}

function toBaseUnits(value: string | null | undefined): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Every settled market, newest proof first.
 *
 * proofTs is a u64 of milliseconds serialized as a string, so it is compared as
 * BigInt — Number() would be fine for present-day epochs but this is the one
 * field that orders the ledger, and an ordering bug here silently rewrites
 * history. Markets missing a proof sort last rather than being dropped: if one
 * ever exists it belongs on the ledger where it can be seen.
 */
export function settledMarkets(
  bets: TrackRecordBet[],
  teams: (fixtureId: string) => { home: string; away: string } | null
): SettledMarket[] {
  return bets
    .filter((bet) => bet.status === "settled")
    .map((bet): SettledMarket => {
      const fixture = teams(bet.fixtureId);
      const result = bet.pending?.result ?? null;
      return {
        betAddress: bet.address,
        fixtureId: bet.fixtureId,
        home: fixture?.home ?? null,
        away: fixture?.away ?? null,
        statKeyA: bet.statKeyA,
        statKeyB: bet.statKeyB,
        op: bet.op,
        kind: bet.kind,
        comparison: bet.comparison,
        threshold: bet.threshold,
        result,
        proofTs: bet.pending?.proofTs ?? null,
        challengeDeadlineTs: bet.pending?.challengeDeadlineTs ?? null,
        overTotal: bet.overTotal,
        underTotal: bet.underTotal,
        winningTotal: result === null ? "0" : result ? bet.overTotal : bet.underTotal,
      };
    })
    .sort((a, b) => compareProofTsDesc(a.proofTs, b.proofTs));
}

function compareProofTsDesc(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // unproven sorts last, never first
  if (b === null) return -1;
  const left = toBaseUnits(a);
  const right = toBaseUnits(b);
  return left === right ? 0 : left > right ? -1 : 1;
}

@Injectable()
export class TrackRecordService {
  private readonly log = new Logger(TrackRecordService.name);

  constructor(
    private readonly fixtures: FixturesService,
    private readonly txs: TxsService
  ) {}

  /**
   * The whole ledger in one read. Fixture names are cosmetic here — the proof
   * is what the endpoint is for — so a TxLINE outage degrades to null teams
   * rather than failing the request. Chain state is the only hard dependency.
   */
  async list(): Promise<{ summary: TrackRecordSummary; settled: SettledMarket[] }> {
    const bets = (await this.txs.listBets()) as TrackRecordBet[];

    // fixtures.list() is documented never to throw, but this endpoint is the
    // one place where degrading beats propagating, so don't rely on that.
    let byId = new Map<string, { home: string; away: string }>();
    try {
      const fixtures = await this.fixtures.list();
      // bet.fixtureId is a string (u64) and fixture.fixtureId is a number —
      // key on String() or every lookup silently misses.
      byId = new Map(fixtures.map((f) => [String(f.fixtureId), { home: f.home, away: f.away }]));
    } catch (err) {
      this.log.warn(`fixtures unavailable (${err}) — serving track record without team names`);
    }

    return {
      summary: summarize(bets),
      settled: settledMarkets(bets, (fixtureId) => byId.get(fixtureId) ?? null),
    };
  }
}
