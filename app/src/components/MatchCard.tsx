"use client";

// The board is organised like a sportsbook: one row per MATCH. Expanding a
// match reveals every market on it (each an on-chain bet), plus an action to
// open a new market on that fixture.

import type { Bet, Fixture, Position } from "@/lib/api";
import { kickoffLabel, money, pusdc } from "@/lib/format";
import { BetCard } from "./BetCard";
import { Countdown } from "./ui";

export interface MatchGroup {
  key: string; // fixtureId as string
  fixture: Fixture | null; // null → unknown fixture (bets exist, feed doesn't know it)
  bets: Bet[];
}

const MATCH_LENGTH_S = 2.5 * 3600; // rough "probably finished" horizon

export function matchPhase(group: MatchGroup, now: number): "live" | "upcoming" | "finished" {
  const kickoff = group.fixture?.kickoffTs ?? group.bets[0]?.kickoffTs ?? 0;
  const anyBetLive = group.bets.some((b) => b.status === "open" && now >= b.kickoffTs);
  if (anyBetLive || (now >= kickoff && now < kickoff + MATCH_LENGTH_S)) return now >= kickoff ? "live" : "upcoming";
  return now < kickoff ? "upcoming" : "finished";
}

export function MatchCard({
  group,
  fixtures,
  positions,
  expanded,
  onToggle,
  onOpenBet,
  onAddMarket,
}: {
  group: MatchGroup;
  fixtures: Fixture[];
  positions: Map<string, Position>;
  expanded: boolean;
  onToggle: () => void;
  onOpenBet: (address: string, side?: "over" | "under") => void;
  onAddMarket: () => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const phase = matchPhase(group, now);
  const kickoff = group.fixture?.kickoffTs ?? group.bets[0]?.kickoffTs ?? 0;
  const title = group.fixture
    ? `${group.fixture.home} vs ${group.fixture.away}`
    : `Fixture ${group.key}`;
  const pool = group.bets.reduce((sum, b) => sum + pusdc(b.overTotal) + pusdc(b.underTotal), 0);
  const openCount = group.bets.filter((b) => b.status === "open" && now < b.kickoffTs).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-raised/60 sm:px-5"
      >
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold tracking-tight text-ink">{title}</h3>
          <p className="tnum mt-0.5 font-mono text-xs text-ink-3">
            {phase === "live" ? (
              <span className="font-semibold text-critical">LIVE</span>
            ) : phase === "upcoming" ? (
              <>
                {kickoffLabel(kickoff)} · <Countdown ts={kickoff} />
              </>
            ) : (
              "Full time"
            )}
            {group.bets.length > 0 && (
              <span className="text-ink-3">
                {" "}· {group.bets.length} market{group.bets.length === 1 ? "" : "s"} ·{" "}
                {money(pool)} pUSDC pooled
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {phase === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink-2">
              <span className="live-dot size-1.5 rounded-full bg-critical" aria-hidden />
              Live
            </span>
          )}
          {phase === "upcoming" && openCount > 0 && (
            <span className="rounded-full border border-hairline bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink-2">
              {openCount} open
            </span>
          )}
          <span
            aria-hidden
            className={`grid size-7 place-items-center rounded-full border border-hairline text-xs text-ink-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-hairline bg-page/40 p-3 sm:p-4">
          {group.bets.length === 0 && (
            <p className="py-3 text-center text-sm text-ink-3">
              No markets on this match yet — open the first one.
            </p>
          )}
          {group.bets.map((bet) => (
            <BetCard
              key={bet.address}
              bet={bet}
              fixtures={fixtures}
              position={positions.get(bet.address)}
              onOpen={(side) => onOpenBet(bet.address, side)}
              hideMatchup
            />
          ))}
          {phase === "upcoming" && (
            <button
              onClick={onAddMarket}
              className="w-full rounded-xl border border-dashed border-hairline py-2.5 text-sm font-semibold text-ink-3 transition hover:border-over/50 hover:text-over"
            >
              + Open a market on this match
            </button>
          )}
        </div>
      )}
    </section>
  );
}
