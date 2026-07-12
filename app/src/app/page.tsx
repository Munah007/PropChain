"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Bet } from "@/lib/api";
import { usePoll, useSession } from "@/lib/hooks";
import { SessionBar } from "@/components/SessionBar";
import { AuthSheet } from "@/components/AuthSheet";
import { MatchCard, matchPhase, type MatchGroup } from "@/components/MatchCard";
import { CreateBetSheet } from "@/components/CreateBetSheet";
import { BetDetailSheet } from "@/components/BetDetailSheet";
import { MyBets } from "@/components/MyBets";
import { Toast, type ToastData } from "@/components/ui";
import { positionSummary } from "@/lib/format";

const STATUS_ORDER: Record<Bet["status"], number> = {
  open: 0,
  settlementPending: 1,
  settled: 2,
  voided: 3,
};

const PHASE_ORDER = { live: 0, upcoming: 1, finished: 2 } as const;

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Pick a match & market",
    body: "Winner, GG/NG, totals, corners, cards — any World Cup fixture. Set the line or take a side on someone else's.",
  },
  {
    n: "02",
    title: "Stake either side",
    body: "In pUSDC. Funds sit in an on-chain escrow no one — including us — can touch.",
  },
  {
    n: "03",
    title: "Proof pays the winners",
    body: "At full time a cryptographic proof of the real stat settles every market on-chain. No bookmaker, no admin key.",
  },
];

export default function Home() {
  const { session, loading, signIn, refresh, signOut } = useSession();
  const { data: bets, refetch: refetchBets } = usePoll(() => api.bets(), 8000);
  const { data: fixtures } = usePoll(() => api.fixtures(), 60000);
  const { data: positions, refetch: refetchPositions } = usePoll(
    () => (session ? api.positions(session.userKey) : Promise.resolve([])),
    15000,
    [session?.userKey]
  );

  const [creating, setCreating] = useState<{ open: boolean; fixtureId: number | null }>({
    open: false,
    fixtureId: null,
  });
  const [selected, setSelected] = useState<{ address: string; side?: "over" | "under" } | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ open: boolean; intent: string | null }>({ open: false, intent: null });
  const pendingAction = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function celebrate(message: string, signature?: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, signature });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  /** Sportsbook grouping: one entry per match — every known fixture plus any
   *  fixture that has markets — live first, then by kickoff. */
  const matches = useMemo<MatchGroup[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    const byFixture = new Map<string, Bet[]>();
    for (const bet of bets ?? []) {
      const list = byFixture.get(bet.fixtureId) ?? [];
      list.push(bet);
      byFixture.set(bet.fixtureId, list);
    }
    const groups: MatchGroup[] = [];
    for (const fixture of fixtures ?? []) {
      const key = String(fixture.fixtureId);
      groups.push({ key, fixture, bets: byFixture.get(key) ?? [] });
      byFixture.delete(key);
    }
    for (const [key, groupBets] of byFixture) {
      groups.push({ key, fixture: null, bets: groupBets }); // bets on fixtures the feed no longer lists
    }
    for (const group of groups) {
      group.bets.sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.kickoffTs - b.kickoffTs
      );
    }
    return groups.sort((a, b) => {
      const phaseDiff = PHASE_ORDER[matchPhase(a, now)] - PHASE_ORDER[matchPhase(b, now)];
      if (phaseDiff !== 0) return phaseDiff;
      const ka = a.fixture?.kickoffTs ?? a.bets[0]?.kickoffTs ?? 0;
      const kb = b.fixture?.kickoffTs ?? b.bets[0]?.kickoffTs ?? 0;
      return matchPhase(a, now) === "finished" ? kb - ka : ka - kb;
    });
  }, [bets, fixtures]);

  // default-expand the first match that has markets
  useEffect(() => {
    if (expandedMatch === null && matches.length) {
      const first = matches.find((m) => m.bets.length > 0) ?? matches[0];
      setExpandedMatch(first.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

  const positionByBet = useMemo(() => new Map((positions ?? []).map((p) => [p.bet, p])), [positions]);
  const allBets = useMemo(() => matches.flatMap((m) => m.bets), [matches]);
  const selectedBet = allBets.find((b) => b.address === selected?.address) ?? null;
  const openMarkets = allBets.filter(
    (b) => b.status === "open" && b.kickoffTs > Math.floor(Date.now() / 1000)
  ).length;

  function onChainChange(message?: string, signature?: string) {
    refetchBets();
    refetchPositions();
    if (session) refresh(session.userKey);
    if (message) celebrate(message, signature);
  }

  function requireAuth(intent: string, then?: () => void) {
    pendingAction.current = then ?? null;
    setAuth({ open: true, intent });
  }

  async function handleSignIn(userKey: string) {
    await signIn(userKey);
    setAuth({ open: false, intent: null });
    pendingAction.current?.();
    pendingAction.current = null;
  }

  function openCreate(fixtureId: number | null = null) {
    const doOpen = () => setCreating({ open: true, fixtureId });
    if (session) return doOpen();
    requireAuth("open a market", doOpen);
  }

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background: "radial-gradient(600px 320px at 25% 0%, rgba(57,135,229,0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-2xl px-4 pb-24">
        <header className="flex items-center justify-between py-5">
          <p className="text-lg font-extrabold tracking-tight text-ink">
            Prop<span className="text-over">Chain</span>
          </p>
          <SessionBar
            session={session}
            betCount={positions?.length ?? 0}
            claimable={claimableCount}
            onMyBets={() => setMyBetsOpen(true)}
            onSignInClick={() => requireAuth("get started")}
            onSignOut={signOut}
          />
        </header>

        <section className="pb-8 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-over">
            World Cup 2026 · on Solana devnet
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-4xl">
            Bet on match stats.
            <br />
            <span className="text-ink-2">Settled by proof, not promises.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
            Peer-to-peer prop bets on live World Cup data. Every result is decided by a
            cryptographic proof verified on-chain — never by a bookmaker.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openCreate()}
              className="rounded-xl bg-over px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(57,135,229,0.35)] transition hover:brightness-110"
            >
              + Open a market
            </button>
            <a
              href="#how"
              className="rounded-xl border border-hairline px-5 py-3 text-sm font-semibold text-ink-2 transition hover:bg-surface hover:text-ink"
            >
              How it works
            </a>
          </div>
        </section>

        <section id="how" className="mb-10 grid gap-2.5 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-hairline bg-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <p className="tnum text-[11px] font-bold text-over">{step.n}</p>
              <h3 className="mt-1.5 text-sm font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{step.body}</p>
            </div>
          ))}
        </section>

        <section aria-label="Matches">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-2">Matches</h2>
            <p className="text-xs text-ink-3">
              {matches.length} fixtures · {openMarkets} open market{openMarkets === 1 ? "" : "s"} · live
            </p>
          </div>

          <div className="space-y-2.5">
            {matches.length === 0 && (
              <div className="rounded-2xl border border-dashed border-hairline py-14 text-center">
                <p className="text-sm text-ink-2">
                  {fixtures === null ? "Loading fixtures…" : "No fixtures in the feed right now."}
                </p>
              </div>
            )}
            {matches.map((group) => (
              <MatchCard
                key={group.key}
                group={group}
                fixtures={fixtures ?? []}
                positions={positionByBet}
                expanded={expandedMatch === group.key}
                onToggle={() => setExpandedMatch(expandedMatch === group.key ? null : group.key)}
                onOpenBet={(address, side) => setSelected({ address, side })}
                onAddMarket={() => openCreate(group.fixture?.fixtureId ?? null)}
              />
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-hairline pt-6 text-center text-xs leading-relaxed text-ink-3">
          Built for the TxODDS World Cup Hackathon · powered by TxLINE data anchored on Solana ·{" "}
          <a
            className="text-ink-2 hover:text-ink"
            href="https://explorer.solana.com/address/3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU?cluster=devnet"
            target="_blank"
            rel="noreferrer"
          >
            inspect the program ↗
          </a>
        </footer>
      </div>

      {session && (
        <MyBets
          open={myBetsOpen}
          onClose={() => setMyBetsOpen(false)}
          bets={allBets}
          positions={positions ?? []}
          fixtures={fixtures ?? []}
          onOpenBet={(address) => setSelected({ address })}
        />
      )}
      <Toast toast={toast} />
      <AuthSheet
        open={auth.open}
        intent={auth.intent}
        loading={loading}
        onClose={() => setAuth({ open: false, intent: null })}
        onSignIn={handleSignIn}
      />
      {session && fixtures && (
        <CreateBetSheet
          open={creating.open}
          onClose={() => setCreating({ open: false, fixtureId: null })}
          session={session}
          fixtures={fixtures}
          initialFixtureId={creating.fixtureId}
          onCreated={onChainChange}
        />
      )}
      {selectedBet && (
        <BetDetailSheet
          bet={selectedBet}
          fixtures={fixtures ?? []}
          session={session}
          position={positionByBet.get(selectedBet.address)}
          initialSide={selected?.side}
          onClose={() => setSelected(null)}
          onChanged={onChainChange}
          onRequireAuth={(intent) => requireAuth(intent)}
        />
      )}
    </div>
  );
}
