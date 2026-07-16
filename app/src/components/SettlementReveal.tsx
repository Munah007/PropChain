"use client";

// The settlement moment. Everything else in PropChain is a dark, scannable
// board; this is the one screen that inverts to light — the payoff beat lands
// because nothing else looks like it.
//
// Deliberately NOT a scratch-card/loot-box reveal. This is a betting product
// whose whole claim is "settled by proof, not a bookmaker"; dressing an outcome
// up as a slot machine would argue against the thing we want judges to believe.
// So the ceremony is staged on the PROOF: verify → outcome → payout, in that
// order. The drama is that nobody decided this.

import { useEffect, useState } from "react";
import type { Bet, Fixture, Position } from "@/lib/api";
import { betTitle, explorerUrl, matchup, money, positionSummary, pusdc, sideLabels, TXORACLE_PROGRAM_ID } from "@/lib/format";

type Step = "verifying" | "outcome" | "payout";

export function SettlementReveal({
  bet,
  position,
  fixtures,
  onClose,
  onClaim,
}: {
  bet: Bet;
  position: Position;
  fixtures: Fixture[];
  onClose: () => void;
  onClaim: () => void;
}) {
  const [step, setStep] = useState<Step>("verifying");
  const labels = sideLabels(bet, fixtures);
  const summary = positionSummary(bet, position, fixtures, Math.floor(Date.now() / 1000));
  const won = summary.outcome === "won" || summary.outcome === "claimed";
  const winningLabel = bet.result ? labels.over : labels.under;

  // Staged, not scrubbable: the proof line holds long enough to be read, then
  // the outcome, then the number. Cleared on unmount so a fast close can't
  // fire a setState into a dead component.
  useEffect(() => {
    const a = setTimeout(() => setStep("outcome"), 1100);
    const b = setTimeout(() => setStep("payout"), 2200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bet settled"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[#f6f7fb] px-6 py-10 text-center"
    >
      {/* Rays: the only ornament, and it sits behind everything at low opacity
          so the numerals stay the loudest thing on the screen. */}
      <div className="reveal-rays pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5b6478]">
          {matchup(bet, fixtures)}
        </p>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#0b1220]">{betTitle(bet, fixtures)}</h2>

        {/* 1. the proof — the claim the whole product rests on */}
        <div className="mt-7 flex items-center gap-2 rounded-full border border-[#199e70]/30 bg-[#199e70]/10 px-3 py-1.5">
          <span
            className={`size-1.5 rounded-full bg-[#199e70] ${step === "verifying" ? "live-dot" : ""}`}
            aria-hidden
          />
          <span className="text-xs font-bold text-[#0f7a55]">
            {step === "verifying" ? "Verifying Merkle proof…" : "Proof verified on-chain"}
          </span>
        </div>

        {/* 2. the outcome */}
        <div
          className={`mt-7 transition-all duration-500 ${
            step === "verifying" ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <p className="text-sm text-[#5b6478]">
            “<span className="font-bold text-[#0b1220]">{winningLabel}</span>” won
          </p>
        </div>

        {/* 3. the number */}
        <div
          className={`mt-5 transition-all duration-500 ${
            step === "payout" ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          {won ? (
            <>
              {/* Not tabular-mono: tnum gives the decimal point a full digit
                  slot, which reads as "+11 . 26" at this size. Nothing here
                  ticks, so proportional figures are simply better set. */}
              <p className="text-6xl font-extrabold tracking-tight text-[#0f7a55]">
                +{money(summary.payout)}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#5b6478]">pUSDC — yours to claim</p>
            </>
          ) : (
            <>
              <p className="text-6xl font-extrabold tracking-tight text-[#0b1220]">
                {money(pusdc(position.amount))}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#5b6478]">
                pUSDC on “{position.side === "over" ? labels.over : labels.under}” — didn’t land
              </p>
            </>
          )}
        </div>

        <p className="mt-7 max-w-xs text-xs leading-relaxed text-[#5b6478]">
          No bookmaker settled this. A TxLINE Merkle proof was verified on-chain by CPI into{" "}
          <a
            className="font-semibold text-[#3987e5] hover:underline"
            href={explorerUrl(TXORACLE_PROGRAM_ID)}
            target="_blank"
            rel="noreferrer"
          >
            txoracle
          </a>
          .
        </p>

        <div className="mt-7 flex w-full flex-col gap-2">
          {won && summary.claimable ? (
            <button
              onClick={onClaim}
              className="w-full rounded-xl bg-[#0f7a55] py-3 text-sm font-bold text-white transition hover:brightness-110"
            >
              Claim {money(summary.payout)} pUSDC
            </button>
          ) : null}
          <a
            className="text-xs font-semibold text-[#5b6478] hover:text-[#0b1220]"
            href={explorerUrl(bet.address)}
            target="_blank"
            rel="noreferrer"
          >
            View settlement on Explorer →
          </a>
          <button onClick={onClose} className="mt-1 text-xs font-semibold text-[#5b6478] hover:text-[#0b1220]">
            Back to matches
          </button>
        </div>
      </div>
    </div>
  );
}
