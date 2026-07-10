"use client";

import { useMemo, useState } from "react";
import { api, type Bet } from "@/lib/api";
import { usePoll, useSession } from "@/lib/hooks";
import { SessionBar } from "@/components/SessionBar";
import { BetCard } from "@/components/BetCard";
import { CreateBetSheet } from "@/components/CreateBetSheet";
import { BetDetailSheet } from "@/components/BetDetailSheet";
import { Button } from "@/components/ui";

const STATUS_ORDER: Record<Bet["status"], number> = {
  open: 0,
  settlementPending: 1,
  settled: 2,
  voided: 3,
};

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
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...(bets ?? [])].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.kickoffTs - b.kickoffTs
      ),
    [bets]
  );
  const positionByBet = useMemo(
    () => new Map((positions ?? []).map((p) => [p.bet, p])),
    [positions]
  );
  const selectedBet = sorted.find((b) => b.address === selected) ?? null;

  function onChainChange() {
    refetchBets();
    refetchPositions();
    if (session) refresh(session.userKey);
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-24">
      <header className="flex items-center justify-between py-5">
        <h1 className="text-lg font-bold tracking-tight text-ink">
          Prop<span className="text-over">Chain</span>
        </h1>
        <SessionBar session={session} loading={loading} onSignIn={signIn} onSignOut={signOut} />
      </header>

      <section className="mb-6 rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-xl font-bold leading-snug text-ink">
          World Cup prop bets,
          <br />
          settled by cryptographic proof.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Pick a match stat, take a side, stake pUSDC. When the whistle blows, a Merkle proof from
          TxLINE&apos;s oracle — verified on-chain — pays the winners. No bookmaker. No admin key.
        </p>
        {session ? (
          <Button onClick={() => setCreating(true)} className="mt-4">
            + Create a bet
          </Button>
        ) : (
          <p className="mt-4 text-xs text-ink-3">
            Sign in with your email — a wallet is created and funded for you automatically. Nothing
            to install.
          </p>
        )}
      </section>

      <section aria-label="Bets" className="space-y-3">
        {sorted.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-3">
            {bets === null ? "Loading bets…" : "No bets yet — create the first one."}
          </p>
        )}
        {sorted.map((bet) => (
          <BetCard
            key={bet.address}
            bet={bet}
            fixtures={fixtures ?? []}
            position={positionByBet.get(bet.address)}
            onOpen={() => setSelected(bet.address)}
          />
        ))}
      </section>

      <footer className="mt-10 text-center text-xs leading-relaxed text-ink-3">
        Devnet demo · TxODDS World Cup Hackathon ·{" "}
        <a
          className="hover:text-ink-2"
          href="https://explorer.solana.com/address/3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU?cluster=devnet"
          target="_blank"
          rel="noreferrer"
        >
          program 3HwBz…7MJU ↗
        </a>
      </footer>

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
          onClose={() => setSelected(null)}
          onChanged={onChainChange}
        />
      )}
    </div>
  );
}
