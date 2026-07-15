"use client";

// Header identity: balance + avatar when signed in (both open the Account
// sheet — the single home for wallet/sign-out, shared with the Account tab),
// or a Sign in button when signed out.

import type { Session } from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "./ui";

export function SessionBar({
  session,
  onSignInClick,
  onAccount,
}: {
  session: Session | null;
  onSignInClick: () => void;
  onAccount: () => void;
}) {
  if (!session) {
    return (
      <Button variant="ghost" onClick={onSignInClick}>
        Sign in
      </Button>
    );
  }
  const displayName = session.name ?? session.email;
  const initial = displayName.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={onAccount}
        className="flex items-center gap-2.5 rounded-full border border-hairline bg-surface py-1.5 pl-4 pr-3 transition hover:bg-raised"
        aria-label="Account"
      >
        <span className="tnum font-mono text-sm font-semibold text-ink">
          {money(session.pusdc)} <span className="text-xs font-normal text-ink-3">pUSDC</span>
        </span>
      </button>
      <button
        onClick={onAccount}
        aria-label="Account"
        className="grid h-8 w-8 place-items-center rounded-full border border-hairline bg-surface text-sm font-bold text-ink transition hover:bg-raised"
      >
        {initial}
      </button>
    </div>
  );
}
