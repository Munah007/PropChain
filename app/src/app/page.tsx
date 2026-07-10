"use client";

import { useMemo, useRef, useState } from "react";
import { api, type Bet } from "@/lib/api";
import { usePoll, useSession } from "@/lib/hooks";
import { SessionBar } from "@/components/SessionBar";
import { AuthSheet } from "@/components/AuthSheet";
import { BetCard } from "@/components/BetCard";
import { CreateBetSheet } from "@/components/CreateBetSheet";
import { BetDetailSheet } from "@/components/BetDetailSheet";

const STATUS_ORDER: Record<Bet["status"], number> = {
  open: 0,
  settlementPending: 1,
  settled: 2,
  voided: 3,
};

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Pick a prop",
    body: "Any stat, any World Cup match — total corners, home goals, cards. Set the line or take a side on someone else's.",
  },
  {
    n: "02",
    title: "Stake either side",
    body: "Over or Under, in pUSDC. Funds sit in an on-chain escrow no one — including us — can touch.",
  },
  {
    n: "03",
    title: "Proof pays the winners",
    body: "At full time a cryptographic proof of the real stat settles the bet on-chain. No bookmaker, no admin key.",
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

  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<{ address: string; side?: "over" | "under" } | null>(null);
  const [auth, setAuth] = useState<{ open: boolean; intent: string | null }>({ open: false, intent: null });
  const pendingAction = useRef<(() => void) | null>(null);

  const sorted = useMemo(
    () =>
      [...(bets ?? [])].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.kickoffTs - b.kickoffTs
      ),
    [bets]
  );
  const positionByBet = useMemo(() => new Map((positions ?? []).map((p) => [p.bet, p])), [positions]);
  const selectedBet = sorted.find((b) => b.address === selected?.address) ?? null;

  function onChainChange() {
    refetchBets();
    refetchPositions();
    if (session) refresh(session.userKey);
  }

  /** Gate an action behind auth only at the moment it needs a wallet. */
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

  function openCreate() {
    if (session) return setCreating(true);
    requireAuth("create a bet", () => setCreating(true));
  }

  return (
    <div className="relative min-h-screen">
      {/* depth: a single restrained glow behind the hero, nothing else */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(560px 300px at 30% 0%, rgba(57,135,229,0.14), transparent 70%), radial-gradient(480px 260px at 80% 0%, rgba(25,158,112,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-2xl px-4 pb-24">
        <header className="flex items-center justify-between py-5">
          <p className="text-lg font-extrabold tracking-tight text-ink">
            Prop<span className="text-over">Chain</span>
          </p>
          <SessionBar
            session={session}
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
              onClick={openCreate}
              className="rounded-xl bg-over px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(57,135,229,0.35)] transition hover:brightness-110"
            >
              + Create a bet
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

        <section aria-label="Bets">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-2">The board</h2>
            <p className="text-xs text-ink-3">
              {sorted.filter((b) => b.status === "open").length} open · updates live
            </p>
          </div>

          <div className="space-y-3">
            {sorted.length === 0 && (
              <div className="rounded-2xl border border-dashed border-hairline py-14 text-center">
                <p className="text-sm text-ink-2">
                  {bets === null ? "Loading the board…" : "No bets on the board yet."}
                </p>
                {bets !== null && (
                  <button onClick={openCreate} className="mt-2 text-sm font-semibold text-over hover:underline">
                    Create the first one →
                  </button>
                )}
              </div>
            )}
            {sorted.map((bet) => (
              <BetCard
                key={bet.address}
                bet={bet}
                fixtures={fixtures ?? []}
                position={positionByBet.get(bet.address)}
                onOpen={(side) => setSelected({ address: bet.address, side })}
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

      <AuthSheet
        open={auth.open}
        intent={auth.intent}
        loading={loading}
        onClose={() => setAuth({ open: false, intent: null })}
        onSignIn={handleSignIn}
      />
      {session && fixtures && (
        <CreateBetSheet
          open={creating}
          onClose={() => setCreating(false)}
          session={session}
          fixtures={fixtures}
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
