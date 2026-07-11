import type { Bet, Fixture } from "./api";

// TxLINE base stat keys: odd = home, even = away.
export const STAT_TEMPLATES: { label: string; a: number; b: number | null }[] = [
  { label: "Total corners", a: 7, b: 8 },
  { label: "Total goals", a: 1, b: 2 },
  { label: "Total yellow cards", a: 3, b: 4 },
  { label: "Total red cards", a: 5, b: 6 },
  { label: "Home goals", a: 1, b: null },
  { label: "Away goals", a: 2, b: null },
  { label: "Home corners", a: 7, b: null },
  { label: "Away corners", a: 8, b: null },
];

export function statLabel(bet: Pick<Bet, "statKeyA" | "statKeyB">): string {
  const match = STAT_TEMPLATES.find((t) => t.a === bet.statKeyA && t.b === bet.statKeyB);
  if (match) return match.label;
  return `stat ${bet.statKeyA}${bet.statKeyB ? `+${bet.statKeyB}` : ""}`;
}

/** "Total corners · Over/Under 9" phrasing for a bet. */
export function betTitle(bet: Bet): string {
  const cmp = bet.comparison === "greater" ? "over" : "under";
  return `${statLabel(bet)} ${cmp} ${bet.threshold}`;
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

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function explorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
