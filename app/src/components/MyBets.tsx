"use client";

// "My bets" — the user's full history: every position they hold, with its
// outcome (open / in-play / awaiting result / won / lost / refundable) and a
// one-tap claim on anything payable. Tapping a row opens the bet detail.

import { useMemo } from "react";
import type { Bet, Fixture, Position } from "@/lib/api";
import { betTitle, matchup, money, positionSummary, pusdc, sideLabels } from "@/lib/format";
import { Sheet } from "./ui";

const TONE: Record<string, string> = {
  good: "text-good",
  bad: "text-ink-3",
  pending: "text-warning",
  neutral: "text-ink-2",
};

export function MyBets({
  open,
  onClose,
  bets,
  positions,
  fixtures,
  onOpenBet,
}: {
  open: boolean;
  onClose: () => void;
  bets: Bet[];
  positions: Position[];
  fixtures: Fixture[];
  onOpenBet: (address: string) => void;
}) {
  const betByAddress = useMemo(() => new Map(bets.map((b) => [b.address, b])), [bets]);

  const rows = useMemo(() => {
    const items = positions
      .map((pos) => {
        const bet = betByAddress.get(pos.bet);
        return bet ? { bet, pos, summary: positionSummary(bet, pos) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // claimable first, then live/pending, then decided
    const rank: Record<string, number> = {
      won: 0, refundable: 0, awaiting: 1, "in-play": 1, open: 2, claimed: 3, lost: 4,
    };
    return items.sort((a, b) => rank[a.summary.outcome] - rank[b.summary.outcome]);
  }, [positions, betByAddress]);

  const staked = rows.reduce((s, r) => s + pusdc(r.pos.amount), 0);
  const claimable = rows.reduce((s, r) => s + r.summary.payout, 0);
  const record = {
    won: rows.filter((r) => r.summary.outcome === "won" || r.summary.outcome === "claimed").length,
    lost: rows.filter((r) => r.summary.outcome === "lost").length,
  };

  return (
    <Sheet open={open} onClose={onClose} title="My bets">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">
          No bets yet — pick a match and take a side.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Staked", `${money(staked)}`, "pUSDC"],
              ["Record", `${record.won}W · ${record.lost}L`, "settled"],
              ["To claim", `${money(claimable)}`, "pUSDC"],
            ].map(([label, value, sub]) => (
              <div key={label} className="rounded-xl border border-hairline bg-raised p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">{label}</p>
                <p className={`tnum mt-1 font-mono text-sm font-bold ${label === "To claim" && claimable > 0 ? "text-good" : "text-ink"}`}>
                  {value}
                </p>
                <p className="text-[10px] text-ink-3">{sub}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {rows.map(({ bet, pos, summary }) => {
              const labels = sideLabels(bet, fixtures);
              return (
                <button
                  key={pos.address}
                  onClick={() => {
                    onClose();
                    onOpenBet(bet.address);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3 text-left transition hover:border-white/20"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{betTitle(bet, fixtures)}</p>
                    <p className="tnum mt-0.5 truncate font-mono text-xs text-ink-3">
                      {matchup(bet, fixtures)} · {money(pusdc(pos.amount))} on{" "}
                      <span className={pos.side === "over" ? "text-over" : "text-under"}>
                        {pos.side === "over" ? labels.over : labels.under}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${TONE[summary.tone]}`}>{summary.label}</p>
                    {summary.claimable && (
                      <p className="text-[11px] font-semibold text-good">Tap to claim →</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
