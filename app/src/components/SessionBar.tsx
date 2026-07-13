"use client";

import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

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
      </div>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account"
          aria-expanded={menuOpen}
          className="grid h-8 w-8 place-items-center rounded-full border border-hairline bg-surface text-sm font-bold text-ink transition hover:bg-raised"
        >
          {initial}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-10 z-30 w-64 rounded-2xl border border-hairline bg-surface p-4 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised text-base font-bold text-ink">
                {initial}
              </span>
              <div className="min-w-0">
                {session.name && (
                  <p className="truncate text-sm font-semibold text-ink">{session.name}</p>
                )}
                <p className="truncate text-xs text-ink-3" title={session.email}>
                  {session.email}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-hairline pt-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Wallet</span>
                <a
                  href={explorerUrl(session.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-2 transition hover:text-ink"
                  title="Your wallet on Solana Explorer"
                >
                  {shortAddress(session.address)} ↗
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Balance</span>
                <span className="tnum font-mono text-ink-2">{money(session.pusdc)} pUSDC</span>
              </div>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              className="mt-3 w-full rounded-full border border-hairline px-3 py-1.5 text-xs text-ink-3 transition hover:bg-raised hover:text-ink-2"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
