// Typed client for the PropChain API. The server owns all wallets and
// signing — this file (and the whole frontend) never touches a key.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8899";

// Bearer token for mutating calls, issued by POST /session. Kept module-level
// (and mirrored to localStorage by useSession) so every api.* call sends it.
let sessionToken: string | null = null;
export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export interface Session {
  userKey: string;
  email: string;
  name: string | null;
  address: string;
  sol: number;
  pusdc: number;
  created: boolean;
  provider: "privy" | "local";
  sessionToken?: string;
}

export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number;
  competition: string;
}

export interface LiveScore {
  fixtureId: number;
  hasScore: boolean;
  home: number;
  away: number;
  minute: number | null;
  gameState: string | null;
  asOf: number;
  seq: number;
}

export interface FixtureOdds {
  fixtureId: number;
  available: boolean;
  asOf: number;
  result: { home: number; draw: number; away: number } | null;
  totals: { line: number; over: number; under: number }[];
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

export interface AgentConfig {
  enabled: boolean;
  teams: string[];
  mode: "react" | "seed";
  minStake: number;
  maxStake: number;
  maxBetsPerDay: number;
}

export interface AgentActivity {
  ts: number;
  betAddress: string;
  fixtureId: string;
  side: "over" | "under";
  amount: number;
  team: string;
  reason: string;
  signature?: string;
}

export interface AgentInfo {
  config: AgentConfig;
  today: { count: number; max: number };
  recent: AgentActivity[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `${res.status}`);
  return body as T;
}

export const api = {
  accountExists: (email: string) =>
    request<{ exists: boolean }>(`/session/exists?email=${encodeURIComponent(email.toLowerCase())}`),

  session: (userKey: string, name?: string) =>
    request<Session>("/session", {
      method: "POST",
      body: JSON.stringify({ userKey: userKey.toLowerCase(), name }),
    }),

  fixtures: () => request<Fixture[]>("/fixtures"),

  score: (fixtureId: number) => request<LiveScore>(`/fixtures/${fixtureId}/score`),

  odds: (fixtureId: number) => request<FixtureOdds>(`/odds/${fixtureId}`),

  demoLaunch: () =>
    request<{ fixtureId: number; home: string; away: string; bet: string; kickoffTs: number; replayEndsTs: number }>(
      "/demo/launch",
      { method: "POST", body: JSON.stringify({}) }
    ),

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

  agent: () => request<AgentInfo>("/agent"),

  setAgent: (config: AgentConfig) =>
    request<AgentInfo>("/agent", { method: "POST", body: JSON.stringify(config) }),

  runAgent: () => request<{ placed: AgentActivity[] }>("/agent/run", { method: "POST", body: "{}" }),
};
