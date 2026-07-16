"use client";

// Account hub: who you are, your wallet + balance, and quick access to the
// 12th Man agent, how-it-works, and sign out.

import { useState } from "react";
import { api, type Session } from "@/lib/api";
import { money, shortAddress, explorerUrl } from "@/lib/format";
import { Sheet } from "./ui";

// Mirror of the server's TOP_UP_THRESHOLD (30 pUSDC): only offer a top-up when
// the tester is genuinely low. The server re-checks the on-chain balance, so
// this is just about when to show the button, never the source of truth.
const LOW_BALANCE = 30;

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

function TopUp({ session, onToppedUp }: { session: Session; onToppedUp: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "info" | "err"; text: string } | null>(null);

  if (session.pusdc >= LOW_BALANCE && !note) return null;

  async function handle() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.topUp();
      if (res.funded) {
        setNote({ tone: "ok", text: `+${money(res.amount)} pUSDC added — you're back in.` });
        onToppedUp(); // refresh the global session so every balance updates
      } else if (res.reason === "not_low") {
        setNote({ tone: "info", text: "You still have enough to bet with." });
        onToppedUp();
      } else if (res.reason === "cooldown") {
        const hrs = Math.ceil((res.retryAfterMs ?? 0) / 3_600_000);
        setNote({ tone: "info", text: `Already topped up recently — try again in ~${hrs}h, or use another email.` });
      } else {
        setNote({ tone: "info", text: "Faucet is busy right now — try again shortly, or sign in with another email." });
      }
    } catch {
      setNote({ tone: "err", text: "Top-up failed — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const toneClass =
    note?.tone === "ok" ? "text-positive" : note?.tone === "err" ? "text-negative" : "text-ink-3";

  return (
    <div className="mt-2 rounded-xl border border-hairline bg-raised p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Out of pUSDC?</p>
      <p className="mt-1 text-xs text-ink-2">
        Running low won&apos;t end your test — grab another {money(100)} pUSDC to keep betting.
      </p>
      <button
        onClick={handle}
        disabled={busy}
        className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Topping up…" : "Top up pUSDC"}
      </button>
      {note && <p className={`mt-2 text-xs ${toneClass}`}>{note.text}</p>}
    </div>
  );
}

export function AccountSheet({
  open,
  onClose,
  session,
  onAgent,
  onHowItWorks,
  onSignOut,
  onToppedUp,
}: {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  onAgent: () => void;
  onHowItWorks: () => void;
  onSignOut: () => void;
  onToppedUp: () => void;
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

      <TopUp session={session} onToppedUp={onToppedUp} />

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
