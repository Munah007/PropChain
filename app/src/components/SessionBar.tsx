"use client";

import type { Session } from "@/lib/api";
import { money, shortAddress, explorerUrl } from "@/lib/format";
import { Button } from "./ui";

export function SessionBar({
  session,
  betCount,
  claimable,
  onMyBets,
  onSignInClick,
  onSignOut,
}: {
  session: Session | null;
  betCount?: number;
  claimable?: number;
  onMyBets?: () => void;
  onSignInClick: () => void;
  onSignOut: () => void;
}) {
  if (!session) {
    return (
      <Button variant="ghost" onClick={onSignInClick}>
        Sign in
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      {betCount ? (
        <button
          onClick={onMyBets}
          className="relative rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-raised hover:text-ink"
        >
          My bets
          {claimable ? (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-good px-1 text-[10px] font-bold text-white">
              {claimable}
            </span>
          ) : null}
        </button>
      ) : null}
      <div className="flex items-center gap-2.5 rounded-full border border-hairline bg-surface py-1.5 pl-4 pr-3">
        <span className="tnum font-mono text-sm font-semibold text-ink">
          {money(session.pusdc)} <span className="text-xs font-normal text-ink-3">pUSDC</span>
        </span>
        <span className="h-3.5 w-px bg-hairline" aria-hidden />
        <a
          href={explorerUrl(session.address)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-3 transition hover:text-ink-2"
          title="Your wallet on Solana Explorer"
        >
          {shortAddress(session.address)} ↗
        </a>
      </div>
      <button
        onClick={onSignOut}
        className="rounded-full border border-hairline px-3 py-1.5 text-xs text-ink-3 transition hover:bg-raised hover:text-ink-2"
        title={session.userKey}
      >
        Sign out
      </button>
    </div>
  );
}
