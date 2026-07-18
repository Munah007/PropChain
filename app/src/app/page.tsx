"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Bet } from "@/lib/api";
import { useNow, usePoll, useSession } from "@/lib/hooks";
import { SessionBar } from "@/components/SessionBar";
import { AuthSheet } from "@/components/AuthSheet";
import { MatchCard, matchPhase, type MatchGroup } from "@/components/MatchCard";
import { CreateBetSheet } from "@/components/CreateBetSheet";
import { DemoBanner } from "@/components/DemoBanner";
import { BetDetailSheet } from "@/components/BetDetailSheet";
import { SettlementReveal } from "@/components/SettlementReveal";
import { MyBetsPanel } from "@/components/MyBets";
import { HowItWorksSheet } from "@/components/HowItWorksSheet";
import { AgentSheet } from "@/components/AgentSheet";
import { AccountSheet } from "@/components/AccountSheet";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { SignalsPanel } from "@/components/SignalsPanel";
import { TrackRecordPanel } from "@/components/TrackRecordPanel";
import { Toast, type ToastData } from "@/components/ui";
import { flag } from "@/lib/flags";
import { positionSummary } from "@/lib/format";

const STATUS_ORDER: Record<Bet["status"], number> = {
  open: 0,
  settlementPending: 1,
  settled: 2,
  voided: 3,
};

const PHASE_ORDER = { live: 0, upcoming: 1, finished: 2 } as const;

/** "Today" / "Tomorrow" / "Sat 18 Jul" for a kickoff, relative to now. */
function dayLabel(ts: number, now: number): string {
  const startOf = (ms: number) => {
    const x = new Date(ms);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  };
  const diff = Math.round((startOf(ts * 1000) - startOf(now * 1000)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <h2
      className={`mb-2 mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] first:mt-0 ${
        accent ? "text-critical" : "text-ink-3"
      }`}
    >
      {children}
    </h2>
  );
}

export default function Home() {
  const now = useNow();
  const { session, loading, signIn, refresh, signOut } = useSession();
  const { data: bets, refetch: refetchBets } = usePoll(() => api.bets(), 8000);
  const { data: fixtures } = usePoll(() => api.fixtures(), 60000);
  const { data: signals } = usePoll(() => api.signals(), 20000);
  const { data: positions, refetch: refetchPositions } = usePoll(
    () => (session ? api.positions(session.userKey) : Promise.resolve([])),
    15000,
    [session?.userKey]
  );

  const { data: agentInfo, refetch: refetchAgent } = usePoll(
    () => (session ? api.agent() : Promise.resolve(null)),
    20000,
    [session?.userKey]
  );
  const agentActive = agentInfo?.config.enabled ?? false;
  const agentTeams = agentInfo?.config.teams ?? [];
  const agentBets = useMemo(
    () => new Set((agentInfo?.recent ?? []).map((a) => a.betAddress)),
    [agentInfo]
  );

  const [tab, setTab] = useState<Tab>("matches");
  // Three browse surfaces share the Matches tab rather than taking bottom-nav
  // slots — the nav is balanced 2+2 around the centred create button, and a
  // fifth item would push it off centre.
  const [boardView, setBoardView] = useState<"board" | "signals" | "record">("board");
  const [agentOpen, setAgentOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [creating, setCreating] = useState<{ open: boolean; fixtureId: number | null }>({
    open: false,
    fixtureId: null,
  });
  const [selected, setSelected] = useState<{ address: string; side?: "over" | "under" } | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [showAllFinished, setShowAllFinished] = useState(false);
  const [auth, setAuth] = useState<{ open: boolean; intent: string | null }>({ open: false, intent: null });
  const pendingAction = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reveal, setReveal] = useState<{ address: string } | null>(null);
  // Bet statuses as of the previous poll. Seeded on the first tick and never
  // read from it, so signing in with already-settled bets can't replay a reveal
  // for something the user settled days ago.
  const seenStatus = useRef<Map<string, Bet["status"]> | null>(null);

  function celebrate(message: string, signature?: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, signature });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  /** One entry per match — every known fixture plus any fixture that has
   *  markets — live first, then upcoming by kickoff, then finished. */
  const matches = useMemo<MatchGroup[]>(() => {
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
      groups.push({ key, fixture: null, bets: groupBets });
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
  }, [bets, fixtures, now]);

  const positionByBet = useMemo(() => new Map((positions ?? []).map((p) => [p.bet, p])), [positions]);
  const allBets = useMemo(() => matches.flatMap((m) => m.bets), [matches]);
  const betByAddress = useMemo(() => new Map(allBets.map((b) => [b.address, b])), [allBets]);
  const claimableCount = useMemo(
    () =>
      (positions ?? []).filter((pos) => {
        const bet = betByAddress.get(pos.bet);
        return bet ? positionSummary(bet, pos, fixtures ?? [], now).claimable : false;
      }).length,
    [positions, betByAddress, fixtures, now]
  );
  const selectedBet = allBets.find((b) => b.address === selected?.address) ?? null;

  // Board sections: live pinned, upcoming grouped by day, recent results, and
  // a collapsed tail of finished fixtures nobody made a market on.
  const board = useMemo(() => {
    const withMarketsOrActive: MatchGroup[] = [];
    const emptyFinished: MatchGroup[] = [];
    for (const m of matches) {
      (m.bets.length > 0 || matchPhase(m, now) !== "finished" ? withMarketsOrActive : emptyFinished).push(m);
    }
    const live = withMarketsOrActive.filter((m) => matchPhase(m, now) === "live");
    const upcoming = withMarketsOrActive.filter((m) => matchPhase(m, now) === "upcoming");
    const finished = withMarketsOrActive.filter((m) => matchPhase(m, now) === "finished");

    // group upcoming by day, preserving ascending-kickoff order
    const days: { label: string; matches: MatchGroup[] }[] = [];
    for (const m of upcoming) {
      const ts = m.fixture?.kickoffTs ?? m.bets[0]?.kickoffTs ?? now;
      const label = dayLabel(ts, now);
      const last = days[days.length - 1];
      if (last && last.label === label) last.matches.push(m);
      else days.push({ label, matches: [m] });
    }
    return { live, days, finished, emptyFinished };
  }, [matches, now]);

  // The settlement moment: a bet the user actually holds has just been proved.
  // Only fires on a transition we watched happen, and only for a position they
  // hold — a stranger's market settling is not their moment.
  useEffect(() => {
    if (!bets) return;
    const now = new Map(bets.map((b) => [b.address, b.status]));
    const before = seenStatus.current;
    seenStatus.current = now;
    if (!before) return; // first poll: baseline only
    for (const bet of bets) {
      const was = before.get(bet.address);
      if (was && was !== "settled" && bet.status === "settled" && positionByBet.has(bet.address)) {
        setReveal({ address: bet.address });
        break; // one at a time; the rest stay on the board
      }
    }
  }, [bets, positionByBet]);

  const revealBet = reveal ? betByAddress.get(reveal.address) ?? null : null;
  const revealPosition = reveal ? positionByBet.get(reveal.address) ?? null : null;

  // default-expand the first match that has markets
  useEffect(() => {
    if (expandedMatch === null && matches.length) {
      const first = matches.find((m) => m.bets.length > 0) ?? matches[0];
      setExpandedMatch(first.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

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

  async function handleSignIn(userKey: string, name?: string) {
    await signIn(userKey, name);
    setAuth({ open: false, intent: null });
    pendingAction.current?.();
    pendingAction.current = null;
  }

  function openCreate(fixtureId: number | null = null) {
    const doOpen = () => setCreating({ open: true, fixtureId });
    if (session) return doOpen();
    requireAuth("open a market", doOpen);
  }

  function goBets() {
    if (session) return setTab("bets");
    requireAuth("see your bets", () => setTab("bets"));
  }

  function goClaim() {
    if (session) return setTab("claim");
    requireAuth("claim your winnings", () => setTab("claim"));
  }

  function openAccount() {
    if (session) return setAccountOpen(true);
    requireAuth("open your account", () => setAccountOpen(true));
  }

  function openAgent() {
    if (session) return setAgentOpen(true);
    requireAuth("set up your 12th Man", () => setAgentOpen(true));
  }

  // One row, not a pitch. When the agent is off this is a quiet entry point;
  // when it's on it becomes a status line worth glancing at. The explanation
  // lives inside the sheet, where someone has asked for it.
  const agentBanner = (
    <button
      onClick={openAgent}
      className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-over/25 bg-over/5 px-3.5 py-2.5 text-left text-sm transition hover:bg-over/10"
    >
      <span className="leading-none" aria-hidden>🛡️</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-ink">
        {agentActive && agentTeams.length
          ? `12th Man is defending ${agentTeams.map((t) => `${flag(t)} ${t}`).join(", ")}`
          : "Activate your 12th Man"}
      </span>
      <span className={`shrink-0 ${agentActive ? "text-good" : "text-over"}`}>
        {agentActive ? "●" : "→"}
      </span>
    </button>
  );

  const matchCardProps = (group: MatchGroup) => ({
    group,
    fixtures: fixtures ?? [],
    positions: positionByBet,
    expanded: expandedMatch === group.key,
    onToggle: () => setExpandedMatch(expandedMatch === group.key ? null : group.key),
    onOpenBet: (address: string, side?: "over" | "under") => setSelected({ address, side }),
    onAddMarket: () => openCreate(group.fixture?.fixtureId ?? null),
  });

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{ background: "radial-gradient(600px 280px at 30% 0%, rgba(57,135,229,0.10), transparent 70%)" }}
      />

      <div className="relative mx-auto w-full max-w-2xl px-4 pb-28">
        <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between border-b border-hairline bg-page/80 px-4 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="PropChain logo" className="size-7 rounded-md" />
            <p className="text-lg font-extrabold tracking-tight text-ink">
              Prop<span className="text-over">Chain</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHowOpen(true)}
              className="grid size-8 place-items-center rounded-full border border-hairline text-ink-3 transition hover:bg-raised hover:text-ink"
              aria-label="How it works"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M12 11v5" />
                <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
              </svg>
            </button>
            <SessionBar
              session={session}
              onSignInClick={() => requireAuth("get started")}
              onAccount={openAccount}
            />
          </div>
        </header>

        {tab === "matches" ? (
          <>
            <section className="pb-4 pt-5">
              <h1 className="text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-2xl">
                Prop bets, settled by proof.
              </h1>
              <button
                onClick={() => setHowOpen(true)}
                className="mt-1 text-sm font-semibold text-over transition hover:brightness-110"
              >
                How it works →
              </button>
            </section>

            <nav className="mb-1 flex gap-1 rounded-xl border border-hairline bg-surface p-1" aria-label="Board view">
              {(
                [
                  ["board", "Board"],
                  ["signals", "Signals"],
                  ["record", "Track record"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setBoardView(id)}
                  aria-current={boardView === id}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    boardView === id ? "bg-raised text-ink" : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {boardView === "signals" ? (
              <div className="py-4">
                <SignalsPanel
                  data={signals}
                  bets={bets ?? []}
                  fixtures={fixtures ?? []}
                  onTake={(bet, side) =>
                    requireAuth("back this side", () => setSelected({ address: bet.address, side }))
                  }
                />
              </div>
            ) : boardView === "record" ? (
              <div className="py-4">
                <TrackRecordPanel onOpen={(address) => setSelected({ address })} />
              </div>
            ) : (
              <>
            {agentBanner}

            {board.live.length === 0 && (
              <DemoBanner
                onLaunched={(fixtureKey, message) => {
                  refetchBets();
                  setExpandedMatch(fixtureKey);
                  celebrate(message);
                }}
              />
            )}

            {matches.length === 0 && (
              <div className="rounded-2xl border border-dashed border-hairline py-16 text-center">
                <p className="text-sm text-ink-2">
                  {fixtures === null && bets === null
                    ? "Loading fixtures…"
                    : "No fixtures right now — check back soon."}
                </p>
              </div>
            )}

            {board.live.length > 0 && (
              <>
                <SectionLabel accent>
                  <span className="live-dot size-1.5 rounded-full bg-critical" aria-hidden />
                  Live now
                </SectionLabel>
                <div className="space-y-2.5">
                  {board.live.map((g) => (
                    <MatchCard key={g.key} {...matchCardProps(g)} />
                  ))}
                </div>
              </>
            )}

            {board.days.map((day) => (
              <div key={day.label}>
                <SectionLabel>{day.label}</SectionLabel>
                <div className="space-y-2.5">
                  {day.matches.map((g) => (
                    <MatchCard key={g.key} {...matchCardProps(g)} />
                  ))}
                </div>
              </div>
            ))}

            {board.finished.length > 0 && (
              <>
                <SectionLabel>Recent results</SectionLabel>
                <div className="space-y-2.5">
                  {board.finished.map((g) => (
                    <MatchCard key={g.key} {...matchCardProps(g)} />
                  ))}
                </div>
              </>
            )}

            {board.emptyFinished.length > 0 && (
              <>
                {showAllFinished && (
                  <>
                    <SectionLabel>All finished fixtures</SectionLabel>
                    <div className="space-y-2.5">
                      {board.emptyFinished.map((g) => (
                        <MatchCard key={g.key} {...matchCardProps(g)} />
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowAllFinished(!showAllFinished)}
                  className="mt-4 w-full rounded-xl border border-dashed border-hairline py-2.5 text-sm font-semibold text-ink-3 transition hover:text-ink"
                >
                  {showAllFinished
                    ? "Hide finished matches without markets"
                    : `Browse ${board.emptyFinished.length} more finished fixtures`}
                </button>
              </>
            )}
              </>
            )}
          </>
        ) : (
          <section className="py-6">
            <h1 className="mb-1 text-xl font-extrabold tracking-tight text-ink">
              {tab === "claim" ? "Claim" : "My bets"}
            </h1>
            <p className="mb-4 text-sm text-ink-3">
              {tab === "claim"
                ? "Winnings and refunds ready to collect."
                : "Every position you hold and how it's doing."}
            </p>
            {session ? (
              <>
                {tab === "bets" && agentBanner}
                <MyBetsPanel
                  bets={allBets}
                  positions={positions ?? []}
                  fixtures={fixtures ?? []}
                  agentBets={agentBets}
                  claimableOnly={tab === "claim"}
                  onOpenBet={(address) => setSelected({ address })}
                />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-hairline py-16 text-center">
                <p className="text-sm text-ink-2">
                  {tab === "claim" ? "Sign in to claim your winnings." : "Sign in to see your bets."}
                </p>
                <button
                  onClick={() => requireAuth(tab === "claim" ? "claim your winnings" : "see your bets")}
                  className="mt-3 rounded-xl bg-over px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                >
                  Sign in
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <BottomNav
        tab={tab}
        onTab={(t) =>
          t === "bets"
            ? goBets()
            : t === "claim"
              ? goClaim()
              : t === "account"
                ? openAccount()
                : setTab(t)
        }
        onCreate={() => openCreate()}
        claimable={claimableCount}
      />

      <Toast toast={toast} />
      <HowItWorksSheet open={howOpen} onClose={() => setHowOpen(false)} />
      <AgentSheet
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        onChanged={() => {
          refetchAgent();
          onChainChange();
        }}
      />
      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        session={session}
        onAgent={() => {
          setAccountOpen(false);
          openAgent();
        }}
        onHowItWorks={() => {
          setAccountOpen(false);
          setHowOpen(true);
        }}
        onSignOut={() => {
          setAccountOpen(false);
          signOut();
        }}
        onToppedUp={() => {
          if (session) refresh(session.email);
        }}
      />
      {session && (
        <CreateBetSheet
          open={creating.open}
          onClose={() => setCreating({ open: false, fixtureId: null })}
          session={session}
          fixtures={fixtures ?? []}
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
      {revealBet && revealPosition && (
        <SettlementReveal
          bet={revealBet}
          position={revealPosition}
          fixtures={fixtures ?? []}
          onClose={() => setReveal(null)}
          onClaim={() => {
            setReveal(null);
            setTab("claim");
          }}
        />
      )}
      {/* Rendered last on purpose: the auth sheet can be summoned from INSIDE
          the bet-detail sheet ("Sign in & bet"), and every overlay shares
          z-50 — DOM order is what puts this one on top. */}
      <AuthSheet
        open={auth.open}
        intent={auth.intent}
        loading={loading}
        onClose={() => setAuth({ open: false, intent: null })}
        onSignIn={handleSignIn}
      />
    </div>
  );
}
