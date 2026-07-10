"use client";

// Small shared primitives: status pill (icon + label, never color alone),
// the Over/Under odds meter (thin two-segment bar, 2px surface gap, rounded
// data ends, direct labels in ink), and a ticking countdown.

import { useEffect, useState, type ReactNode } from "react";
import type { Bet } from "@/lib/api";
import { impliedOdds, money, timeUntil } from "@/lib/format";

export const STATUS_META: Record<Bet["status"], { label: string; dot: string }> = {
  open: { label: "Open", dot: "bg-good" },
  settlementPending: { label: "Settling", dot: "bg-warning" },
  settled: { label: "Settled", dot: "bg-ink-3" },
  voided: { label: "Voided", dot: "bg-serious" },
};

export function StatusPill({ status }: { status: Bet["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-2.5 py-0.5 text-xs font-medium text-ink-2">
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Implied-odds split meter. Over = blue (left), Under = aqua (right). */
export function OddsMeter({ bet }: { bet: Bet }) {
  const odds = impliedOdds(bet);
  const overPct = Math.round(odds.over * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-2">
          <span className="mr-1.5 inline-block size-2 rounded-[2px] bg-over align-baseline" aria-hidden />
          Over {overPct}% · {money(odds.over === 0.5 && odds.total === 0 ? 0 : (odds.total * odds.over))} pUSDC
        </span>
        <span className="text-ink-2">
          {money(odds.total * odds.under)} pUSDC · {100 - overPct}% Under
          <span className="ml-1.5 inline-block size-2 rounded-[2px] bg-under align-baseline" aria-hidden />
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full gap-[2px]" role="img" aria-label={`Over ${overPct}%, Under ${100 - overPct}%`}>
        <div className="rounded-l-[4px] bg-over" style={{ width: `${Math.max(odds.over * 100, 2)}%` }} />
        <div className="rounded-r-[4px] bg-under" style={{ width: `${Math.max(odds.under * 100, 2)}%` }} />
      </div>
    </div>
  );
}

export function Countdown({ ts, prefix }: { ts: number; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tnum">
      {prefix}
      {timeUntil(ts)}
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "over" | "under";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-over text-white hover:brightness-110",
    ghost: "border border-hairline bg-transparent text-ink-2 hover:bg-raised hover:text-ink",
    over: "bg-over/15 text-over border border-over/40 hover:bg-over/25",
    under: "bg-under/15 text-under border border-under/40 hover:bg-under/25",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
