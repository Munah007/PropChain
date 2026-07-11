// Typed client for the PropChain API. The server owns all wallets and
// signing — this file (and the whole frontend) never touches a key.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8899";

export interface Session {
  userKey: string;
  address: string;
  sol: number;
  pusdc: number;
  created: boolean;
  provider: "privy" | "local";
}

export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number;
  competition: string;
}

export interface PendingSettlement {
  result: boolean;
  proofTs: string;
  challengeDeadlineTs: number;
}

export interface Bet {
  address: string;
  creator: string;
  fixtureId: string;
  statKeyA: number;
  statKeyB: number | null;
  op: "add" | "subtract" | null;
  kind: "line" | "bothScore";
  comparison: "greater" | "less";
  threshold: number;
  kickoffTs: number;
  status: "open" | "settlementPending" | "settled" | "voided";
  pending: PendingSettlement | null;
  result: boolean | null;
  overTotal: string;
  underTotal: string;
}

export interface Position {
  address: string;
  bet: string;
  side: "over" | "under";
  amount: string;
  claimed: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `${res.status}`);
  return body as T;
}

export const api = {
  session: (userKey: string) =>
    request<Session>("/session", { method: "POST", body: JSON.stringify({ userKey }) }),

  fixtures: () => request<Fixture[]>("/fixtures"),

  bets: () => request<Bet[]>("/bets"),

  positions: (userKey: string) =>
    request<Position[]>(`/users/${encodeURIComponent(userKey)}/positions`),

  createBet: (body: {
    userKey: string;
    fixtureId: number;
    statKeyA: number;
    statKeyB: number | null;
    op: "add" | "subtract" | null;
    kind: "line" | "bothScore";
    comparison: "greater" | "less";
    threshold: number;
    kickoffTs: number;
    opening?: { side: "over" | "under"; amount: number };
  }) => request<{ bet: string; signature: string }>("/bets", { method: "POST", body: JSON.stringify(body) }),

  stake: (bet: string, body: { userKey: string; side: "over" | "under"; amount: number }) =>
    request<{ signature: string }>(`/bets/${bet}/stake`, { method: "POST", body: JSON.stringify(body) }),

  claim: (bet: string, userKey: string) =>
    request<{ signature: string }>(`/bets/${bet}/claim`, {
      method: "POST",
      body: JSON.stringify({ userKey }),
    }),
};
