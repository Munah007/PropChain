"use client";

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
  onOpen: () => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const preKickoff = bet.status === "open" && now < bet.kickoffTs;
  const overX = payoutMultiple(bet, "over");
  const underX = payoutMultiple(bet, "under");

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-xl border border-hairline bg-surface p-4 text-left transition hover:border-white/20 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-over"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{matchup(bet, fixtures)}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{betTitle(bet)}</h3>
        </div>
        <StatusPill status={bet.status} />
      </div>

      <div className="mt-3">
        <OddsMeter bet={bet} />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
        <span className="tnum">
          {preKickoff ? (
            <>
              Staking closes {kickoffLabel(bet.kickoffTs)} · <Countdown ts={bet.kickoffTs} />
            </>
          ) : bet.status === "settlementPending" && bet.pending ? (
            <>
              Result <span className={bet.pending.result ? "text-over" : "text-under"}>{bet.pending.result ? "Over" : "Under"}</span> pending ·
              finalizes in <Countdown ts={bet.pending.challengeDeadlineTs} />
            </>
          ) : bet.status === "settled" ? (
            <>
              Final: <span className={bet.result ? "text-over" : "text-under"}>{bet.result ? "Over" : "Under"}</span> won ·
              pool {money(pusdc(bet.overTotal) + pusdc(bet.underTotal))} pUSDC
            </>
          ) : bet.status === "voided" ? (
            <>Voided — stakes refundable</>
          ) : (
            <>In play — awaiting final whistle</>
          )}
        </span>
        {preKickoff && (
          <span className="tnum text-ink-2">
            {overX && `Over ×${overX.toFixed(2)}`}
            {overX && underX && " · "}
            {underX && `Under ×${underX.toFixed(2)}`}
          </span>
        )}
        {position && (
          <span className={`font-medium ${position.side === "over" ? "text-over" : "text-under"}`}>
            You: {money(pusdc(position.amount))} on {position.side === "over" ? "Over" : "Under"}
          </span>
        )}
      </div>
    </button>
  );
}
