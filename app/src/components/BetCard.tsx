"use client";

// A bet card is actionable for EVERYONE: stake buttons (with live payout
// multiples) sit right on the card — signing in happens inside the flow,
// only when the transaction actually needs a wallet.

import type { Bet, Fixture, Position } from "@/lib/api";
import { betTitle, kickoffLabel, matchup, money, payoutMultiple, pusdc } from "@/lib/format";
import { Countdown, OddsMeter, StatusPill } from "./ui";

export function BetCard({
  bet,
  fixtures,
  position,
  onOpen,
}: {
  bet: Bet;
  fixtures: Fixture[];
  position?: Position;
  onOpen: (side?: "over" | "under") => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const stakeable = bet.status === "open" && now < bet.kickoffTs;
  const inPlay = bet.status === "open" && now >= bet.kickoffTs;
  const overX = payoutMultiple(bet, "over");
  const underX = payoutMultiple(bet, "under");
  const settledOrPending = bet.status !== "open";

  return (
    <article className="group overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/20">
      <button onClick={() => onOpen()} className="block w-full p-4 pb-3 text-left sm:p-5 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              {matchup(bet, fixtures)}
              <span className="mx-1.5 text-ink-3/50">·</span>
              {kickoffLabel(bet.kickoffTs)}
            </p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-ink">{betTitle(bet)}</h3>
          </div>
          <StatusPill status={bet.status} live={inPlay} />
        </div>

        <div className="mt-3.5">
          <OddsMeter bet={bet} />
        </div>

        <p className="tnum mt-3 font-mono text-xs text-ink-3">
          {stakeable ? (
            <>
              Staking closes in <Countdown ts={bet.kickoffTs} /> · pool{" "}
              {money(pusdc(bet.overTotal) + pusdc(bet.underTotal))} pUSDC
            </>
          ) : bet.status === "settlementPending" && bet.pending ? (
            <>
              Proof verified — <span className={bet.pending.result ? "text-over" : "text-under"}>{bet.pending.result ? "Over" : "Under"}</span>{" "}
              pending · locks in <Countdown ts={bet.pending.challengeDeadlineTs} />
            </>
          ) : bet.status === "settled" ? (
            <>
              Final: <span className={`font-semibold ${bet.result ? "text-over" : "text-under"}`}>{bet.result ? "Over" : "Under"} won</span> ·
              pool {money(pusdc(bet.overTotal) + pusdc(bet.underTotal))} pUSDC paid by Merkle proof
            </>
          ) : bet.status === "voided" ? (
            <>Voided — every stake refundable</>
          ) : (
            <>In play — settles at the final whistle, by proof</>
          )}
          {position && (
            <span className={`ml-2 font-semibold ${position.side === "over" ? "text-over" : "text-under"}`}>
              · You: {money(pusdc(position.amount))} on {position.side === "over" ? "Over" : "Under"}
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
              Over {overX ? <span className="tnum font-mono font-semibold opacity-80">×{overX.toFixed(2)}</span> : ""}
            </button>
            <button
              onClick={() => onOpen("under")}
              className="flex-1 rounded-xl border border-under/40 bg-under/10 py-2.5 text-sm font-bold text-under transition hover:bg-under/20"
            >
              Under {underX ? <span className="tnum font-mono font-semibold opacity-80">×{underX.toFixed(2)}</span> : ""}
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
