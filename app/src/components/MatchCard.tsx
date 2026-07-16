"use client";

// The board reads like a football app: one card per MATCH, flags + scoreline
// up top so it's scannable at a glance, markets nested inside on expand.

import { api, type Bet, type Fixture, type Position } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { finishedLabel, kickoffLabel, livePhaseLabel, money, pusdc } from "@/lib/format";
import { flag } from "@/lib/flags";
import { BetCard } from "./BetCard";
import { Countdown } from "./ui";
import { useEffect, useRef, useState } from "react";

export interface MatchGroup {
  key: string; // fixtureId as string
  fixture: Fixture | null; // null → unknown fixture (bets exist, feed doesn't know it)
  bets: Bet[];
}

const MATCH_LENGTH_S = 3.5 * 3600; // "probably finished" horizon, covers ET + pens

/**
 * Live/finished comes from the feed's StatusId (surfaced as fixture.finished),
 * with the clock horizon kept only as a backstop — an unknown fixture, a feed
 * that never reported a phase, or a bet stuck Open must still stop reading LIVE
 * eventually, and a keeper outage is exactly when the feed is least trustworthy.
 */
export function matchPhase(group: MatchGroup, now: number): "live" | "upcoming" | "finished" {
  const kickoff = group.fixture?.kickoffTs ?? group.bets[0]?.kickoffTs ?? 0;
  if (now < kickoff) return "upcoming";
  if (group.fixture?.finished) return "finished"; // final whistle, per the feed
  return now < kickoff + MATCH_LENGTH_S ? "live" : "finished";
}

/** Score digits that pop when they change (goal!). */
function Goals({ value, pop }: { value: number; pop: boolean }) {
  return (
    <span className={`tnum font-mono text-xl font-bold text-ink ${pop ? "score-pop" : ""}`}>
      {value}
    </span>
  );
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
  const boardPhase = matchPhase(group, now);
  const kickoff = group.fixture?.kickoffTs ?? group.bets[0]?.kickoffTs ?? 0;
  const home = group.fixture?.home ?? null;
  const away = group.fixture?.away ?? null;
  const pool = group.bets.reduce((sum, b) => sum + pusdc(b.overTotal) + pusdc(b.underTotal), 0);
  const openCount = group.bets.filter((b) => b.status === "open" && now < b.kickoffTs).length;

  // Fetch the scoreline for live/finished matches we know the fixture of.
  const showScore = (boardPhase === "live" || boardPhase === "finished") && group.fixture != null;
  const { data: score } = usePoll(
    () => (showScore ? api.score(group.fixture!.fixtureId) : Promise.resolve(null)),
    boardPhase === "live" ? 12000 : 60000,
    [showScore, group.fixture?.fixtureId, boardPhase]
  );
  // This poll (12s) sees the final whistle before the board's fixtures poll
  // (60s) does, so let it retire the LIVE badge early. Only ever tightens
  // live→finished; the board catches up on its next tick.
  const phase = boardPhase === "live" && score?.finished ? "finished" : boardPhase;
  // TxLINE consensus odds for the expanded match — one fetch feeds every card.
  const { data: odds } = usePoll(
    () => (expanded && group.bets.length ? api.odds(Number(group.key)) : Promise.resolve(null)),
    60000,
    [expanded, group.key, group.bets.length > 0]
  );

  // Pop the digits on a goal (not first paint).
  const prevGoals = useRef<string | null>(null);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (!score?.hasScore) return;
    const g = `${score.home}-${score.away}`;
    const was = prevGoals.current;
    prevGoals.current = g;
    if (was !== null && was !== g) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 550);
      return () => clearTimeout(t);
    }
  }, [score]);

  const hasGoals = score?.hasScore ?? false;

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
        phase === "live" ? "border-critical/40" : "border-hairline"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="block w-full p-4 text-left transition hover:bg-raised/50 sm:px-5"
      >
        {/* status strip */}
        <div className="mb-2.5 flex items-center justify-between">
          {phase === "live" ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-critical">
              <span className="live-dot size-1.5 rounded-full bg-critical" aria-hidden />
              {livePhaseLabel(score?.statusId, score?.minute ?? null) ??
                `Live${score?.minute != null ? ` · ${score.minute}'` : ""}`}
            </span>
          ) : phase === "upcoming" ? (
            <span className="tnum font-mono text-[11px] text-ink-3">
              {kickoffLabel(kickoff)} · <Countdown ts={kickoff} />
            </span>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {finishedLabel(score?.statusId ?? group.fixture?.statusId)}
            </span>
          )}
          {openCount > 0 && (
            <span className="rounded-full border border-over/30 bg-over/10 px-2 py-0.5 text-[10px] font-bold text-over">
              {openCount} open
            </span>
          )}
        </div>

        {/* teams + scoreline */}
        {home && away ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-xl leading-none" aria-hidden>{flag(home)}</span>
                <span className="truncate text-[15px] font-semibold text-ink">{home}</span>
              </div>
              {hasGoals && <Goals value={score!.home} pop={pop} />}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-xl leading-none" aria-hidden>{flag(away)}</span>
                <span className="truncate text-[15px] font-semibold text-ink">{away}</span>
              </div>
              {hasGoals && <Goals value={score!.away} pop={pop} />}
            </div>
          </div>
        ) : (
          <h3 className="text-[15px] font-semibold text-ink">Match #{group.key}</h3>
        )}

        {/* meta */}
        <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5">
          <p className="text-xs text-ink-3">
            {group.bets.length > 0 ? (
              <>
                {group.bets.length} market{group.bets.length === 1 ? "" : "s"} ·{" "}
                <span className="tnum font-mono">{money(pool)}</span> pUSDC pooled
              </>
            ) : (
              "No markets yet — be first"
            )}
          </p>
          <span
            aria-hidden
            className={`grid size-6 place-items-center rounded-full border border-hairline text-[10px] text-ink-3 transition-transform ${expanded ? "rotate-180" : ""}`}
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
              odds={odds}
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
