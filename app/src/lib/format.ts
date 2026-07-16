import type { Bet, Fixture, FixtureOdds, Position } from "./api";

// ---------- match phase wording ----------
//
// Cosmetic only. The server decides whether a match is over (`finished`, from
// the TxLINE phase table in server/src/fixtures/phases.ts); these two just word
// what the card says. An unrecognised StatusId falls back to the caller's
// default, so a code we've never seen degrades to "Live" rather than blanking —
// a wrong label here is cosmetic and never reaches settlement.

const clocked = (label: string, minute: number | null) =>
  minute != null ? `${label} · ${minute}'` : label;

/** Wording for a match the feed still considers in progress. */
export function livePhaseLabel(statusId: number | null | undefined, minute: number | null): string | null {
  switch (statusId) {
    case 2: // H1
    case 4: // H2
      return clocked("Live", minute);
    case 3: // HT — the feed stops the clock, so `minute` is null here
      return "Half time";
    case 6: // WET
      return "Extra time next";
    case 7: // ET1
    case 9: // ET2
      return clocked("Extra time", minute);
    case 8: // HTET
      return "Extra time · half time";
    case 11: // WPE
      return "Penalties next";
    case 12: // PE
      return "Penalties";
    case 14: // I — may resume
      return "Interrupted";
    case 18: // TXCS — may resume
      return "Coverage suspended";
    default:
      return null;
  }
}

/** Wording for a match the feed has stopped for good (`finished` is true). */
export function finishedLabel(statusId: number | null | undefined): string {
  switch (statusId) {
    case 15:
      return "Abandoned";
    case 16:
    case 17:
      return "Cancelled";
    case 19:
      return "Postponed";
    default:
      return "Full time";
  }
}

// Market templates. TxLINE base stat keys: odd = home, even = away.
// lineKind "half" markets show sportsbook half-lines: displayed line =
// on-chain integer threshold + 0.5 (strict Greater ≡ over the half-line).
export interface MarketTemplate {
  id: string;
  group: string;
  /** {home}/{away} resolve to team names; {n} resolves to threshold+1 (margins) */
  label: string;
  kind: "line" | "bothScore";
  a: number;
  b: number | null;
  op: "add" | "subtract" | null;
  comparison: "greater" | "less";
  /** half → "N.5" totals line · plus → "N+" margin line · none → binary */
  lineKind: "half" | "plus" | "none";
  defaultThreshold: number;
  sides: [string, string];
}

const M = (
  id: string, group: string, label: string, kind: MarketTemplate["kind"],
  a: number, b: number | null, op: MarketTemplate["op"], comparison: MarketTemplate["comparison"],
  lineKind: MarketTemplate["lineKind"], defaultThreshold: number, sides: [string, string]
): MarketTemplate => ({ id, group, label, kind, a, b, op, comparison, lineKind, defaultThreshold, sides });

// Everything the deployed protocol can express over TxLINE's eight provable
// stats (per-team goals 1/2, yellows 3/4, reds 5/6, corners 7/8).
export const MARKETS: MarketTemplate[] = [
  // ----- Match result
  M("home-win", "Match result", "{home} to win", "line", 1, 2, "subtract", "greater", "none", 0, ["{home} wins", "Draw / {away}"]),
  M("away-win", "Match result", "{away} to win", "line", 2, 1, "subtract", "greater", "none", 0, ["{away} wins", "Draw / {home}"]),
  M("home-margin", "Match result", "{home} to win by {n}+", "line", 1, 2, "subtract", "greater", "plus", 1, ["By {n}+", "Fewer"]),
  M("away-margin", "Match result", "{away} to win by {n}+", "line", 2, 1, "subtract", "greater", "plus", 1, ["By {n}+", "Fewer"]),
  // ----- Goals
  M("total-goals", "Goals", "Total goals", "line", 1, 2, "add", "greater", "half", 2, ["Over", "Under"]),
  M("btts", "Goals", "Both teams to score", "bothScore", 1, 2, null, "greater", "none", 0, ["GG · yes", "NG · no"]),
  M("home-scores", "Goals", "{home} to score", "line", 1, null, null, "greater", "none", 0, ["{home} scores", "No goal"]),
  M("away-scores", "Goals", "{away} to score", "line", 2, null, null, "greater", "none", 0, ["{away} scores", "No goal"]),
  M("home-goals", "Goals", "{home} goals", "line", 1, null, null, "greater", "half", 1, ["Over", "Under"]),
  M("away-goals", "Goals", "{away} goals", "line", 2, null, null, "greater", "half", 1, ["Over", "Under"]),
  M("home-cleansheet", "Goals", "{home} clean sheet", "line", 2, null, null, "less", "none", 1, ["Clean sheet", "Concedes"]),
  M("away-cleansheet", "Goals", "{away} clean sheet", "line", 1, null, null, "less", "none", 1, ["Clean sheet", "Concedes"]),
  // ----- Corners
  M("total-corners", "Corners", "Total corners", "line", 7, 8, "add", "greater", "half", 9, ["Over", "Under"]),
  M("most-corners", "Corners", "Most corners", "line", 7, 8, "subtract", "greater", "none", 0, ["{home} most", "{away} / tie"]),
  M("corner-handicap", "Corners", "{home} corners winning margin", "line", 7, 8, "subtract", "greater", "plus", 1, ["By {n}+", "Fewer"]),
  M("home-corners", "Corners", "{home} corners", "line", 7, null, null, "greater", "half", 4, ["Over", "Under"]),
  M("away-corners", "Corners", "{away} corners", "line", 8, null, null, "greater", "half", 4, ["Over", "Under"]),
  // ----- Cards
  M("total-yellows", "Cards", "Total yellow cards", "line", 3, 4, "add", "greater", "half", 3, ["Over", "Under"]),
  M("home-yellows", "Cards", "{home} yellow cards", "line", 3, null, null, "greater", "half", 1, ["Over", "Under"]),
  M("away-yellows", "Cards", "{away} yellow cards", "line", 4, null, null, "greater", "half", 1, ["Over", "Under"]),
  M("both-booked", "Cards", "Both teams booked", "bothScore", 3, 4, null, "greater", "none", 0, ["Both booked", "No"]),
  M("most-cards", "Cards", "Most yellow cards", "line", 3, 4, "subtract", "greater", "none", 0, ["{home} most", "{away} / tie"]),
  M("red-shown", "Cards", "Red card in match", "line", 5, 6, "add", "greater", "none", 0, ["Yes", "No"]),
];

export function findMarket(
  bet: Pick<Bet, "kind" | "statKeyA" | "statKeyB" | "op" | "comparison" | "threshold">
): MarketTemplate | undefined {
  const candidates = MARKETS.filter(
    (m) =>
      m.kind === bet.kind &&
      m.a === bet.statKeyA &&
      m.b === bet.statKeyB &&
      m.op === (bet.op ?? null) &&
      m.comparison === bet.comparison
  );
  return (
    candidates.find((m) => m.lineKind === "none" && m.defaultThreshold === bet.threshold) ??
    candidates.find((m) => m.lineKind !== "none") ??
    candidates[0]
  );
}

function teamNames(bet: Bet, fixtures: Fixture[]): { home: string; away: string } {
  const f = fixtures.find((f) => String(f.fixtureId) === bet.fixtureId);
  return { home: f?.home ?? "Home", away: f?.away ?? "Away" };
}

export const fillLabel = (s: string, t: { home: string; away: string }, threshold = 0) =>
  s.replace("{home}", t.home).replace("{away}", t.away).replace("{n}", String(threshold + 1));

/** Sportsbook line display: integer threshold N + strict Greater ≡ "N.5". */
export const lineOf = (threshold: number) => `${threshold}.5`;

export function betTitle(bet: Bet, fixtures: Fixture[] = []): string {
  const t = teamNames(bet, fixtures);
  const m = findMarket(bet);
  if (!m) {
    const combo = bet.statKeyB != null ? `${bet.op === "subtract" ? "−" : "+"}${bet.statKeyB}` : "";
    return `stat ${bet.statKeyA}${combo} ${bet.comparison === "greater" ? "over" : "under"} ${bet.threshold}`;
  }
  const base = fillLabel(m.label, t, bet.threshold);
  if (m.lineKind === "half") {
    return `${base} ${bet.comparison === "greater" ? "over" : "under"} ${lineOf(bet.threshold)}`;
  }
  return base;
}

/** Side labels for buttons/toggles/results ("GG · yes" / "France wins" / "Over"). */
export function sideLabels(bet: Bet, fixtures: Fixture[] = []): { over: string; under: string } {
  const t = teamNames(bet, fixtures);
  const m = findMarket(bet);
  if (m) return { over: fillLabel(m.sides[0], t, bet.threshold), under: fillLabel(m.sides[1], t, bet.threshold) };
  return { over: "Over", under: "Under" };
}

export function pusdc(lamports: string | number): number {
  return Number(lamports) / 1_000_000;
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function matchup(bet: Bet, fixtures: Fixture[]): string {
  const f = fixtures.find((f) => String(f.fixtureId) === bet.fixtureId);
  return f ? `${f.home} vs ${f.away}` : `Fixture ${bet.fixtureId}`;
}

export function impliedOdds(bet: Bet): { over: number; under: number; total: number } {
  const over = pusdc(bet.overTotal);
  const under = pusdc(bet.underTotal);
  const total = over + under;
  return {
    over: total > 0 ? over / total : 0.5,
    under: total > 0 ? under / total : 0.5,
    total,
  };
}

/**
 * Concrete payout if `side` wins after you add `amount`:
 * your share = amount / (side_total + amount) × (pool + amount).
 */
export function payoutIfWins(bet: Bet, side: "over" | "under", amount: number): number {
  if (amount <= 0) return 0;
  const over = pusdc(bet.overTotal);
  const under = pusdc(bet.underTotal);
  const sideTotal = (side === "over" ? over : under) + amount;
  return (amount / sideTotal) * (over + under + amount);
}

/** Winner payout multiple for a side, given current pools ("x1.8"). */
export function payoutMultiple(bet: Bet, side: "over" | "under"): number | null {
  const over = pusdc(bet.overTotal);
  const under = pusdc(bet.underTotal);
  const mine = side === "over" ? over : under;
  if (mine <= 0) return null;
  return (over + under) / mine;
}

export function timeUntil(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function kickoffLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

/** Translate raw program/RPC errors into human feedback. */
const PROGRAM_ERRORS: [RegExp, string][] = [
  [/SideMismatch|0x1775/, "You already have a position on the other side — top-ups must stay on your original side."],
  [/StakingClosed|0x1773/, "Betting closed at kickoff for this bet."],
  [/BetNotOpen|0x1772/, "This bet is no longer open."],
  [/AmountZero|0x1774/, "Enter an amount greater than zero."],
  [/AlreadyClaimed|0x1781/, "You've already claimed this one."],
  [/NotAWinner|0x1780/, "This position is on the losing side — nothing to claim."],
  [/insufficient funds|insufficient lamports|custom program error: 0x1$/i, "Not enough pUSDC in your wallet for this bet."],
];

export function friendlyError(message: string): string {
  for (const [pattern, friendly] of PROGRAM_ERRORS) {
    if (pattern.test(message)) return friendly;
  }
  return message.length > 160 ? "Transaction failed — check the details and try again." : message;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function explorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

// TxLINE's on-chain txoracle program (devnet). Every settlement is verified by
// a CPI into this program's validate_stat — no PropChain admin key can decide a
// bet. Judges can open it on Explorer straight from the proof panel.
export const TXORACLE_PROGRAM_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

/**
 * Format an on-chain proof timestamp (i64) as a readable UTC instant. TxLINE
 * event timestamps come through as either seconds or milliseconds depending on
 * the stat; detect by magnitude so a demo never shows a date off by 1000×.
 */
export function formatProofTime(raw: string | number): string {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return "—";
  const ms = n >= 1e12 ? n : n * 1000;
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

/**
 * TxLINE consensus probability for this bet's OVER side, where the StablePrice
 * feed prices the equivalent market. Only two shapes map cleanly:
 *  - total goals (1+2, Add, Greater N) → over/under line N.5
 *  - team to win (1-2 or 2-1, Subtract, Greater 0) → 1X2 (under side = draw
 *    or other team, so under = 1 - P(win))
 * Everything else (corners, cards, GG, margins) has no consensus feed on the
 * devnet World Cup tier — we show nothing rather than invent a number.
 */
export function consensusForOver(bet: Bet, odds: FixtureOdds | null): number | null {
  if (!odds?.available || bet.kind !== "line" || bet.comparison !== "greater") return null;
  const keys = [bet.statKeyA, bet.statKeyB];
  if (bet.op === "add" && keys[0] === 1 && keys[1] === 2 && odds.totals.length) {
    const line = bet.threshold + 0.5;
    return odds.totals.find((t) => Math.abs(t.line - line) < 1e-9)?.over ?? null;
  }
  if (bet.op === "subtract" && bet.threshold === 0 && odds.result) {
    if (keys[0] === 1 && keys[1] === 2) return odds.result.home;
    if (keys[0] === 2 && keys[1] === 1) return odds.result.away;
  }
  return null;
}

/**
 * Pool-implied probability of the over side (its share of total stakes).
 * Null until BOTH sides have stake — a one-sided pool "implies 100%", which
 * is technically true and practically meaningless.
 */
export function poolImpliedOver(bet: Bet): number | null {
  const over = pusdc(bet.overTotal);
  const under = pusdc(bet.underTotal);
  if (over <= 0 || under <= 0) return null;
  return over / (over + under);
}

export interface ProofBadge {
  label: string;
  title: string;
  /** provisional = settled by proof but still inside the challenge window */
  provisional: boolean;
}

/**
 * The trustless-settlement signal for a bet, if it has one. Drives the
 * "provably settled" chips in the history list and on the detail screen.
 */
export function proofBadge(bet: Bet): ProofBadge | null {
  if (bet.status === "settled") {
    return {
      label: "Provably settled",
      title: "Settled by a TxLINE Merkle proof, verified on-chain by CPI — no operator decided this.",
      provisional: false,
    };
  }
  if (bet.status === "settlementPending" && bet.pending) {
    return {
      label: "Provisional — open to challenge",
      title: "A Merkle proof was accepted on-chain; any strictly-later proof can still overturn it until the window lapses.",
      provisional: true,
    };
  }
  if (bet.status === "voided") {
    return {
      label: "Voided on-chain",
      title: "No final proof arrived in time — every bet is refundable.",
      provisional: false,
    };
  }
  return null;
}

export type BetOutcome =
  | "open"
  | "in-play"
  | "awaiting"
  | "won"
  | "lost"
  | "refundable"
  | "claimed";

export interface PositionSummary {
  outcome: BetOutcome;
  label: string;
  tone: "neutral" | "good" | "bad" | "pending";
  claimable: boolean;
  payout: number; // pUSDC receivable now (won unclaimed / refundable)
}

/**
 * True when the feed says this bet's match has stopped for good. A bet stays
 * Open until the keeper proposes a proof, so "past kickoff" on its own never
 * means in play. Unknown fixture → false, falling back to the clock.
 */
export function matchOver(bet: Bet, fixtures: Fixture[]): boolean {
  return fixtures.find((f) => String(f.fixtureId) === bet.fixtureId)?.finished ?? false;
}

/**
 * How a user's position on a bet stands right now. `now` (unix seconds) is
 * passed in rather than read from the clock so callers drive it from a ticking
 * source — a summary computed inside a data-keyed memo would otherwise freeze
 * at whatever second the last poll landed on.
 */
export function positionSummary(
  bet: Bet,
  position: Position,
  fixtures: Fixture[],
  now: number
): PositionSummary {
  const stake = pusdc(position.amount);

  if (bet.status === "voided") {
    return position.claimed
      ? { outcome: "claimed", label: "Refunded", tone: "neutral", claimable: false, payout: 0 }
      : { outcome: "refundable", label: "Refundable", tone: "neutral", claimable: true, payout: stake };
  }

  if (bet.status === "settled") {
    const won = bet.result === (position.side === "over");
    if (!won) return { outcome: "lost", label: "Lost", tone: "bad", claimable: false, payout: 0 };
    const winningTotal = pusdc(bet.result ? bet.overTotal : bet.underTotal);
    const pool = pusdc(bet.overTotal) + pusdc(bet.underTotal);
    const payout = winningTotal > 0 ? (stake / winningTotal) * pool : stake;
    return position.claimed
      ? { outcome: "claimed", label: `Won ${money(payout)}`, tone: "good", claimable: false, payout: 0 }
      : { outcome: "won", label: `Won ${money(payout)}`, tone: "good", claimable: true, payout };
  }

  if (bet.status === "settlementPending") {
    const winning = bet.pending?.result === (position.side === "over");
    return {
      outcome: "awaiting",
      label: winning ? "Winning (pending)" : "Losing (pending)",
      tone: "pending",
      claimable: false,
      payout: 0,
    };
  }

  // open
  if (now < bet.kickoffTs) {
    return { outcome: "open", label: "Open", tone: "neutral", claimable: false, payout: 0 };
  }
  // Past kickoff, but the final whistle has blown and the keeper hasn't
  // proposed yet — the same "waiting on a result" state as settlementPending,
  // never in play.
  if (matchOver(bet, fixtures)) {
    return { outcome: "awaiting", label: "Awaiting proof", tone: "pending", claimable: false, payout: 0 };
  }
  return { outcome: "in-play", label: "In play", tone: "pending", claimable: false, payout: 0 };
}
