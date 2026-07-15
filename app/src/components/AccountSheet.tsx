"use client";

// Account hub: who you are, your wallet + balance, and quick access to the
// 12th Man agent, how-it-works, and sign out.

import type { Session } from "@/lib/api";
import { money, shortAddress, explorerUrl } from "@/lib/format";
import { Sheet } from "./ui";

function Row({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-raised px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-surface"
    >
      <span className="text-lg" aria-hidden>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-ink-3">›</span>
    </button>
  );
}

export function AccountSheet({
  open,
  onClose,
  session,
  onAgent,
  onHowItWorks,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  onAgent: () => void;
  onHowItWorks: () => void;
  onSignOut: () => void;
}) {
  if (!session) return null;
  const displayName = session.name ?? session.email;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Sheet open={open} onClose={onClose} title="Account">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-raised text-lg font-bold text-ink">
          {initial}
        </span>
        <div className="min-w-0">
          {session.name && <p className="truncate text-sm font-bold text-ink">{session.name}</p>}
          <p className="truncate text-xs text-ink-3">{session.email}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-hairline bg-raised p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Balance</p>
          <p className="tnum mt-1 font-mono text-lg font-bold text-ink">
            {money(session.pusdc)} <span className="text-xs font-normal text-ink-3">pUSDC</span>
          </p>
        </div>
        <a
          href={explorerUrl(session.address)}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-hairline bg-raised p-3 transition hover:bg-surface"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Wallet ↗</p>
          <p className="tnum mt-1 font-mono text-sm font-bold text-ink">{shortAddress(session.address)}</p>
        </a>
      </div>

      <div className="mt-4 space-y-2">
        <Row label="12th Man — loyalty agent" icon="🛡️" onClick={onAgent} />
        <Row label="How PropChain works" icon="ⓘ" onClick={onHowItWorks} />
      </div>

      <button
        onClick={onSignOut}
        className="mt-4 w-full rounded-xl border border-hairline px-4 py-2.5 text-sm font-semibold text-ink-3 transition hover:bg-raised hover:text-ink-2"
      >
        Sign out
      </button>
    </Sheet>
  );
}
