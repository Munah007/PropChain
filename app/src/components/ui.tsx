"use client";

// Small shared primitives: status pill (icon + label, never color alone),
// the Over/Under odds meter (thin two-segment bar, 2px surface gap, rounded
// data ends, direct labels in ink), and a ticking countdown.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Bet } from "@/lib/api";
import { impliedOdds, money, timeUntil } from "@/lib/format";

/** rAF tween toward a target value — odds roll instead of jumping. */
export function useTweened(target: number, ms = 350): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - (1 - t) ** 3;
      const v = from + (target - from) * eased;
      setValue(v);
      fromRef.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export const STATUS_META: Record<Bet["status"], { label: string; dot: string }> = {
  open: { label: "Open", dot: "bg-good" },
  settlementPending: { label: "Settling", dot: "bg-warning" },
  settled: { label: "Settled", dot: "bg-ink-3" },
  voided: { label: "Voided", dot: "bg-serious" },
};

export function StatusPill({
  status,
  live,
  awaitingProof,
}: {
  status: Bet["status"];
  live?: boolean;
  /** Open, but the match is over — the keeper hasn't proposed a proof yet. */
  awaitingProof?: boolean;
}) {
  const meta = live
    ? { label: "Live", dot: "bg-critical live-dot" }
    : awaitingProof
      ? { label: "Awaiting proof", dot: "bg-warning" }
      : STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink-2">
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Implied-odds split meter. Over = blue (left), Under = aqua (right). */
export function OddsMeter({ bet, labels }: { bet: Bet; labels?: { over: string; under: string } }) {
  const overLabel = labels?.over ?? "Over";
  const underLabel = labels?.under ?? "Under";
  const odds = impliedOdds(bet);
  const overTweened = useTweened(odds.over * 100);
  const overPct = Math.round(overTweened);
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            <span className="mr-1.5 inline-block size-2 rounded-[2px] bg-over align-baseline" aria-hidden />
            {overLabel}
          </p>
          <p className="font-mono text-sm font-semibold text-ink">
            {overPct}%
            <span className="ml-1.5 text-xs font-normal text-ink-3">{money(odds.total * odds.over)} pUSDC</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            {underLabel}
            <span className="ml-1.5 inline-block size-2 rounded-[2px] bg-under align-baseline" aria-hidden />
          </p>
          <p className="font-mono text-sm font-semibold text-ink">
            <span className="mr-1.5 text-xs font-normal text-ink-3">{money(odds.total * odds.under)} pUSDC</span>
            {100 - overPct}%
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full gap-[2px]" role="img" aria-label={`${overLabel} ${overPct}%, ${underLabel} ${100 - overPct}%`}>
        <div className="rounded-l-[4px] bg-over" style={{ width: `${Math.max(overTweened, 2)}%` }} />
        <div className="rounded-r-[4px] bg-under" style={{ width: `${Math.max(100 - overTweened, 2)}%` }} />
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
    <span className="tnum font-mono">
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

export interface PickerOption {
  value: string;
  label: string;
  group?: string; // consecutive options sharing a group render under one heading
}

/**
 * An in-app replacement for `<select>`.
 *
 * A native select hands rendering to the OS, so on Android the market list
 * arrives as a system radio dialog — full-bleed, its own type and colours,
 * nothing to do with the board it was opened from. This keeps the picker inside
 * the app's own surface. Sits at z-[70]: above Sheet (z-50), which is always
 * what opens it, and above the toast (z-[60]).
 */
export function Picker({
  id,
  value,
  options,
  onChange,
  title,
  className,
}: {
  id?: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  title: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-raised px-3 py-2.5 text-left text-sm text-ink outline-none transition hover:border-white/20 focus:border-over ${className ?? ""}`}
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <span className="shrink-0 text-xs text-ink-3" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-hairline bg-surface sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-3.5">
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-ink-3 hover:bg-raised hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain py-1" role="listbox" aria-label={title}>
              {options.map((o, i) => {
                const isSelected = o.value === value;
                const startsGroup = o.group && o.group !== options[i - 1]?.group;
                return (
                  <div key={o.value}>
                    {startsGroup && (
                      <p className="sticky top-0 bg-surface px-5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                        {o.group}
                      </p>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition ${
                        isSelected ? "bg-raised font-semibold text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && (
                        <span className="shrink-0 text-xs text-ink" aria-hidden>
                          ✓
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export interface ToastData {
  message: string;
  signature?: string;
}

/** Trade confirmation moment: checkmark, message, tx link; slides in from below. */
export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <div className="toast-in flex items-center gap-3 rounded-2xl border border-good/40 bg-raised px-5 py-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <span className="grid size-6 place-items-center rounded-full bg-good/20 text-sm text-good" aria-hidden>
          ✓
        </span>
        <p className="text-sm font-semibold text-ink">{toast.message}</p>
        {toast.signature && (
          <a
            className="font-mono text-xs text-over hover:underline"
            href={`https://explorer.solana.com/tx/${toast.signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            view tx ↗
          </a>
        )}
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
