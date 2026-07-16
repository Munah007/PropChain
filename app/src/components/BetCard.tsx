"use client";

// A bet card is actionable for EVERYONE: stake buttons (with live payout
// multiples) sit right on the card — signing in happens inside the flow,
// only when the transaction actually needs a wallet.

import { useEffect, useRef, useState } from "react";
import type { Bet, Fixture, FixtureOdds, Position } from "@/lib/api";
import {
  betTitle,
  consensusForOver,
  kickoffLabel,
  matchOver,
  matchup,
  money,
  payoutMultiple,
  poolImpliedOver,
  pusdc,
  sideLabels,
} from "@/lib/format";
import { Countdown, OddsMeter, StatusPill } from "./ui";

/** One-shot true for ~1.6s when the bet transitions into `settled` on a poll. */
function useJustSettled(status: Bet["status"]): boolean {
  const prev = useRef(status);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (was !== "settled" && status === "settled") {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [status]);
  return flash;
}

export function BetCard({
  bet,
  fixtures,
  odds = null,
  position,
  onOpen,
  hideMatchup = false,
}: {
  bet: Bet;
  fixtures: Fixture[];
  /** TxLINE consensus odds for this bet's fixture, when the caller has them */
  odds?: FixtureOdds | null;
  position?: Position;
  onOpen: (side?: "over" | "under") => void;
  /** true when rendered inside a MatchCard — the match header already says it */
  hideMatchup?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  const stakeable = bet.status === "open" && now < bet.kickoffTs;
  const started = bet.status === "open" && now >= bet.kickoffTs;
  const over = matchOver(bet, fixtures);
  const inPlay = started && !over;
  const awaitingProof = started && over;
  const labels = sideLabels(bet, fixtures);
  const overX = payoutMultiple(bet, "over");
  const underX = payoutMultiple(bet, "under");
  const settledOrPending = bet.status !== "open";
  const justSettled = useJustSettled(bet.status);

  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/20 ${justSettled ? "settle-flash" : ""}`}
    >
      <button onClick={() => onOpen()} className="block w-full p-4 pb-3 text-left sm:p-5 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            {!hideMatchup && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                {matchup(bet, fixtures)}
                <span className="mx-1.5 text-ink-3/50">·</span>
                {kickoffLabel(bet.kickoffTs)}
              </p>
            )}
            <h3 className={`text-lg font-bold tracking-tight text-ink ${hideMatchup ? "" : "mt-1"}`}>{betTitle(bet, fixtures)}</h3>
          </div>
          <StatusPill status={bet.status} live={inPlay} awaitingProof={awaitingProof} />
        </div>

        <div className="mt-3.5">
          <OddsMeter bet={bet} labels={labels} />
        </div>

        {stakeable &&
          (() => {
            // The edge-finder line: TxLINE's demargined consensus vs what this
            // pool currently implies. A gap either way is a reason to stake.
            const consensus = consensusForOver(bet, odds);
            if (consensus == null) return null;
            const implied = poolImpliedOver(bet);
            return (
              <p className="tnum mt-2 font-mono text-xs text-ink-3">
                TxLINE consensus:{" "}
                <span className="font-semibold text-ink-2">
                  {Math.round(consensus * 100)}% “{labels.over}”
                </span>
                {implied != null && (
                  <> · pool implies {Math.round(implied * 100)}%</>
                )}
              </p>
            );
          })()}

        <p className="tnum mt-3 font-mono text-xs text-ink-3">
          {stakeable ? (
            <>
              Betting closes in <Countdown ts={bet.kickoffTs} /> · pool{" "}
              {money(pusdc(bet.overTotal) + pusdc(bet.underTotal))} pUSDC
            </>
          ) : bet.status === "settlementPending" && bet.pending ? (
            <>
              Proof verified — <span className={bet.pending.result ? "text-over" : "text-under"}>{bet.pending.result ? labels.over : labels.under}</span>{" "}
              pending ·{" "}
              {bet.pending.challengeDeadlineTs > Math.floor(Date.now() / 1000) ? (
                <>locks in <Countdown ts={bet.pending.challengeDeadlineTs} /></>
              ) : (
                "finalizing…"
              )}
            </>
          ) : bet.status === "settled" ? (
            <>
              Final: <span className={`font-semibold ${bet.result ? "text-over" : "text-under"}`}>“{bet.result ? labels.over : labels.under}” won</span> ·
              pool {money(pusdc(bet.overTotal) + pusdc(bet.underTotal))} pUSDC paid by Merkle proof
            </>
          ) : bet.status === "voided" ? (
            <>Voided — every bet refundable</>
          ) : awaitingProof ? (
            <>Full time — awaiting the settlement proof</>
          ) : (
            <>In play — settles at the final whistle, by proof</>
          )}
          {position && (
            <span className={`ml-2 font-semibold ${position.side === "over" ? "text-over" : "text-under"}`}>
              · You: {money(pusdc(position.amount))} on “{position.side === "over" ? labels.over : labels.under}”
            </span>
          )}
        </p>
      </button>

      <div className="flex gap-2 px-4 pb-4 sm:px-5">
        {stakeable ? (
          <>
            <button
              onClick={() => onOpen("over")}
              className="flex-1 rounded-xl border border-over/40 bg-over/10 py-2.5 text-sm font-bold text-over transition hover:bg-over/20"
            >
              <span className="truncate">{labels.over}</span> {overX ? <span className="tnum font-mono font-semibold opacity-80">×{overX.toFixed(2)}</span> : ""}
            </button>
            <button
              onClick={() => onOpen("under")}
              className="flex-1 rounded-xl border border-under/40 bg-under/10 py-2.5 text-sm font-bold text-under transition hover:bg-under/20"
            >
              <span className="truncate">{labels.under}</span> {underX ? <span className="tnum font-mono font-semibold opacity-80">×{underX.toFixed(2)}</span> : ""}
            </button>
          </>
        ) : (
          <button
            onClick={() => onOpen()}
            className="flex-1 rounded-xl border border-hairline bg-raised py-2.5 text-sm font-semibold text-ink-2 transition hover:text-ink"
          >
            {settledOrPending ? "View settlement & proof →" : "View details →"}
          </button>
        )}
      </div>
    </article>
  );
}
