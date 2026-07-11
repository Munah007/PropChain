import type { Bet, Fixture } from "./api";

// Market templates. TxLINE base stat keys: odd = home, even = away.
// Line markets with hasLine show sportsbook half-lines: displayed line =
// on-chain integer threshold + 0.5 (strict Greater ≡ over the half-line).
export interface MarketTemplate {
  id: string;
  group: string;
  label: string;
  kind: "line" | "bothScore";
  a: number;
  b: number | null;
  op: "add" | "subtract" | null;
  hasLine: boolean;
  defaultThreshold: number;
  /** [over-side label, under-side label]; {home}/{away} resolve to team names */
  sides: [string, string];
}

export const MARKETS: MarketTemplate[] = [
  { id: "total-goals", group: "Goals", label: "Total goals", kind: "line", a: 1, b: 2, op: "add", hasLine: true, defaultThreshold: 2, sides: ["Over", "Under"] },
  { id: "btts", group: "Goals", label: "Both teams to score", kind: "bothScore", a: 1, b: 2, op: null, hasLine: false, defaultThreshold: 0, sides: ["GG · yes", "NG · no"] },
  { id: "home-win", group: "Goals", label: "{home} to win", kind: "line", a: 1, b: 2, op: "subtract", hasLine: false, defaultThreshold: 0, sides: ["{home} wins", "Draw / {away}"] },
  { id: "away-win", group: "Goals", label: "{away} to win", kind: "line", a: 2, b: 1, op: "subtract", hasLine: false, defaultThreshold: 0, sides: ["{away} wins", "Draw / {home}"] },
  { id: "home-margin", group: "Goals", label: "{home} wins by 2+", kind: "line", a: 1, b: 2, op: "subtract", hasLine: false, defaultThreshold: 1, sides: ["By 2+", "No"] },
  { id: "home-goals", group: "Goals", label: "{home} goals", kind: "line", a: 1, b: null, op: null, hasLine: true, defaultThreshold: 1, sides: ["Over", "Under"] },
  { id: "away-goals", group: "Goals", label: "{away} goals", kind: "line", a: 2, b: null, op: null, hasLine: true, defaultThreshold: 1, sides: ["Over", "Under"] },
  { id: "total-corners", group: "Corners", label: "Total corners", kind: "line", a: 7, b: 8, op: "add", hasLine: true, defaultThreshold: 9, sides: ["Over", "Under"] },
  { id: "home-corners", group: "Corners", label: "{home} corners", kind: "line", a: 7, b: null, op: null, hasLine: true, defaultThreshold: 4, sides: ["Over", "Under"] },
  { id: "away-corners", group: "Corners", label: "{away} corners", kind: "line", a: 8, b: null, op: null, hasLine: true, defaultThreshold: 4, sides: ["Over", "Under"] },
  { id: "total-yellows", group: "Cards", label: "Total yellow cards", kind: "line", a: 3, b: 4, op: "add", hasLine: true, defaultThreshold: 3, sides: ["Over", "Under"] },
  { id: "total-reds", group: "Cards", label: "Red card shown", kind: "line", a: 5, b: 6, op: "add", hasLine: false, defaultThreshold: 0, sides: ["Yes", "No"] },
];

export function findMarket(bet: Pick<Bet, "kind" | "statKeyA" | "statKeyB" | "op" | "threshold">): MarketTemplate | undefined {
  return MARKETS.find(
    (m) =>
      m.kind === bet.kind &&
      m.a === bet.statKeyA &&
      m.b === bet.statKeyB &&
      m.op === (bet.op ?? null) &&
      (m.hasLine || m.defaultThreshold === bet.threshold || m.id.includes("margin"))
  );
}

function teamNames(bet: Bet, fixtures: Fixture[]): { home: string; away: string } {
  const f = fixtures.find((f) => String(f.fixtureId) === bet.fixtureId);
  return { home: f?.home ?? "Home", away: f?.away ?? "Away" };
}

const fill = (s: string, t: { home: string; away: string }) =>
  s.replace("{home}", t.home).replace("{away}", t.away);

/** Sportsbook line display: integer threshold 9 + strict Greater ≡ "9.5". */
export const lineOf = (threshold: number) => `${threshold}.5`;

export function betTitle(bet: Bet, fixtures: Fixture[] = []): string {
  const t = teamNames(bet, fixtures);
  const m = findMarket(bet);
  if (m && !m.hasLine) return fill(m.label, t);
  const base = m ? fill(m.label, t) : `stat ${bet.statKeyA}${bet.statKeyB != null ? `${bet.op === "subtract" ? "−" : "+"}${bet.statKeyB}` : ""}`;
  const cmp = bet.comparison === "greater" ? "over" : "under";
  return `${base} ${cmp} ${lineOf(bet.threshold)}`;
}

/** Side labels for buttons/toggles/results ("GG · yes" / "France wins" / "Over"). */
export function sideLabels(bet: Bet, fixtures: Fixture[] = []): { over: string; under: string } {
  const t = teamNames(bet, fixtures);
  const m = findMarket(bet);
  if (m) return { over: fill(m.sides[0], t), under: fill(m.sides[1], t) };
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
  [/StakingClosed|0x1773/, "Staking closed at kickoff for this bet."],
  [/BetNotOpen|0x1772/, "This bet is no longer open."],
  [/AmountZero|0x1774/, "Enter an amount greater than zero."],
  [/AlreadyClaimed|0x1781/, "You've already claimed this one."],
  [/NotAWinner|0x1780/, "This position is on the losing side — nothing to claim."],
  [/insufficient funds|insufficient lamports|custom program error: 0x1$/i, "Not enough pUSDC in your wallet for this stake."],
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
