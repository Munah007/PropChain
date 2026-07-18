"use client";

// Bet detail: stake actions, the settlement timeline, and the proof panel —
// the judge-facing "trustless resolution" story told on one screen.

import { useState } from "react";
import { api, type Bet, type Fixture, type Position, type Session } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import {
  betTitle,
  consensusForOver,
  friendlyError,
  formatProofTime,
  sideLabels,
  explorerUrl,
  kickoffLabel,
  matchup,
  money,
  payoutIfWins,
  poolImpliedOver,
  proofBadge,
  pusdc,
  shortAddress,
  TXORACLE_PROGRAM_ID,
} from "@/lib/format";
import { Button, Countdown, Sheet, StatusPill } from "./ui";
import { LiveScore } from "./LiveScore";

export function BetDetailSheet({
  bet,
  fixtures,
  session,
  position,
  initialSide,
  onClose,
  onChanged,
  onRequireAuth,
}: {
  bet: Bet | null;
  fixtures: Fixture[];
  session: Session | null;
  position?: Position;
  initialSide?: "over" | "under";
  onClose: () => void;
  onChanged: (message?: string, signature?: string) => void;
  onRequireAuth: (intent: string) => void;
}) {
  const [side, setSide] = useState<"over" | "under">(initialSide ?? "over");
  // an existing position locks you to its side (mirrors the on-chain rule)
  const lockedSide = position && !position.claimed ? position.side : null;
  const effectiveSide = lockedSide ?? side;
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const { data: odds } = usePoll(
    () => (bet ? api.odds(Number(bet.fixtureId)) : Promise.resolve(null)),
    60000,
    [bet?.fixtureId]
  );

  if (!bet) return null;
  const fixture = fixtures.find((f) => String(f.fixtureId) === bet.fixtureId);
  const labels = sideLabels(bet, fixtures);
  const labelOf = (s: "over" | "under") => (s === "over" ? labels.over : labels.under);
  const now = Math.floor(Date.now() / 1000);
  const matchStarted = now >= bet.kickoffTs;
  const finalized = bet.status === "settled" || bet.status === "voided";
  const stakeable = bet.status === "open" && now < bet.kickoffTs;
  const winningSide = bet.result === null ? null : bet.result ? "over" : "under";
  const claimable =
    session &&
    position &&
    !position.claimed &&
    (bet.status === "voided" || (bet.status === "settled" && position.side === winningSide));
  const payout =
    claimable && bet.status === "settled"
      ? (pusdc(position.amount) * (pusdc(bet.overTotal) + pusdc(bet.underTotal))) /
        pusdc(bet.result ? bet.overTotal : bet.underTotal)
      : claimable
        ? pusdc(position!.amount)
        : 0;

  async function run(label: string, message: string, fn: () => Promise<{ signature: string }>) {
    setBusy(label);
    setError(null);
    try {
      const { signature } = await fn();
      setLastSig(signature);
      onChanged(message, signature);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  // Only the step you're actually on gets a caption — a timeline where every
  // row explains itself reads as documentation, not status.
  const steps: { label: string; detail: string; done: boolean; live?: boolean }[] = [
    { label: "Created", detail: "Config locked on-chain", done: true },
    {
      label: "Kickoff",
      detail: kickoffLabel(bet.kickoffTs),
      done: now >= bet.kickoffTs,
    },
    {
      label: "Settlement proposed",
      detail: bet.pending
        ? `Merkle proof verified — “${bet.pending.result ? labels.over : labels.under}”`
        : bet.status === "settled" || bet.status === "voided"
          ? "Proof verified on-chain"
          : "Waiting for the final whistle",
      done: bet.pending !== null || bet.status === "settled" || bet.status === "voided",
      live: bet.status === "settlementPending",
    },
    {
      label: bet.status === "voided" ? "Voided" : "Settled",
      detail:
        bet.status === "settled"
          ? `“${bet.result ? labels.over : labels.under}” won`
          : bet.status === "voided"
            ? "All bets refundable"
            : bet.pending
              ? "Locks when the window lapses"
              : "—",
      done: bet.status === "settled" || bet.status === "voided",
    },
  ];

  // The live step if there is one, otherwise the furthest step reached.
  const activeStep = steps.findIndex((s) => s.live);
  const currentStep = activeStep >= 0 ? activeStep : steps.map((s) => s.done).lastIndexOf(true);

  return (
    <Sheet open onClose={onClose} title={betTitle(bet, fixtures)}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-2">{matchup(bet, fixtures)}</p>
          <StatusPill status={bet.status} />
        </div>

        {matchStarted && fixture && (
          <LiveScore
            fixtureId={fixture.fixtureId}
            home={fixture.home}
            away={fixture.away}
            variant="card"
            live={!finalized}
          />
        )}

        {stakeable && (
          <div className="rounded-xl border border-hairline bg-raised p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
              Your bet · closes at kickoff, in <Countdown ts={bet.kickoffTs} />
            </p>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-hairline">
                <button
                  onClick={() => setSide("over")}
                  disabled={lockedSide === "under"}
                  title={lockedSide === "under" ? `You're on “${labels.under}” — one side per bet` : undefined}
                  className={`flex-1 truncate px-2 py-2 text-sm font-semibold transition ${effectiveSide === "over" ? "bg-over text-white" : "text-ink-3 hover:text-ink"} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-3`}
                >
                  {labels.over}
                </button>
                <button
                  onClick={() => setSide("under")}
                  disabled={lockedSide === "over"}
                  title={lockedSide === "over" ? `You're on “${labels.over}” — one side per bet` : undefined}
                  className={`flex-1 truncate px-2 py-2 text-sm font-semibold transition ${effectiveSide === "under" ? "bg-under text-white" : "text-ink-3 hover:text-ink"} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-3`}
                >
                  {labels.under}
                </button>
              </div>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="tnum w-24 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-over"
                aria-label="Bet amount in pUSDC"
              />
              <Button
                onClick={() =>
                  session
                    ? run("stake", `Bet ${amount} pUSDC on “${labelOf(effectiveSide)}”`, () => api.stake(bet.address, { userKey: session.userKey, side: effectiveSide, amount }))
                    : onRequireAuth(`bet ${amount} pUSDC on “${labelOf(effectiveSide)}”`)
                }
                disabled={busy !== null || amount <= 0}
              >
                {busy === "stake" ? "Placing…" : session ? "Place bet" : "Sign in & bet"}
              </Button>
            </div>
            {amount > 0 && (
              <p className="tnum mt-2.5 font-mono text-xs text-ink-2">
                Bet {money(amount)} → get{" "}
                <span className={`font-semibold ${effectiveSide === "over" ? "text-over" : "text-under"}`}>
                  {money(payoutIfWins(bet, effectiveSide, amount))} pUSDC
                </span>{" "}
                if “{labelOf(effectiveSide)}” lands (×
                {(payoutIfWins(bet, effectiveSide, amount) / amount).toFixed(2)})
                {pusdc(effectiveSide === "over" ? bet.underTotal : bet.overTotal) === 0 && (
                  <span className="text-ink-3"> — grows as “{labelOf(effectiveSide === "over" ? "under" : "over")}” fills</span>
                )}
              </p>
            )}
            {(() => {
              const consensus = consensusForOver(bet, odds ?? null);
              if (consensus == null) return null;
              const implied = poolImpliedOver(bet);
              const overProb = effectiveSide === "over" ? consensus : 1 - consensus;
              return (
                <p className="tnum mt-1.5 font-mono text-xs text-ink-3">
                  TxLINE consensus puts “{labelOf(effectiveSide)}” at{" "}
                  <span className="font-semibold text-ink-2">{Math.round(overProb * 100)}%</span>
                  {implied != null && (
                    <>
                      {" "}— this pool pays as if it were{" "}
                      {Math.round((effectiveSide === "over" ? implied : 1 - implied) * 100)}%
                    </>
                  )}
                  .
                </p>
              );
            })()}
            {position && (
              <p className="mt-1.5 text-xs text-ink-3">
                Your position: {money(pusdc(position.amount))} pUSDC on “{labelOf(position.side)}” — the other side is locked (one side per bet).
              </p>
            )}
          </div>
        )}

        {claimable && (
          <div className="flex items-center justify-between rounded-xl border border-good/40 bg-good/10 p-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {bet.status === "voided" ? "Refund available" : "You won"}
              </p>
              <p className="tnum text-xs text-ink-2">{money(payout)} pUSDC</p>
            </div>
            <Button onClick={() => run("claim", `Claimed ${money(payout)} pUSDC`, () => api.claim(bet.address, session!.userKey))} disabled={busy !== null}>
              {busy === "claim" ? "Claiming…" : "Claim"}
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Settlement timeline</p>
          <ol className="space-y-0">
            {steps.map((step, i) => (
              <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && (
                  <span className="absolute left-[5px] top-4 h-full w-px bg-hairline" aria-hidden />
                )}
                <span
                  className={`relative mt-1 size-[11px] shrink-0 rounded-full border-2 ${
                    step.live
                      ? "border-warning bg-warning/30"
                      : step.done
                        ? "border-good bg-good"
                        : "border-hairline bg-surface"
                  }`}
                  aria-hidden
                />
                <div>
                  <p className={`text-sm font-medium ${step.done || step.live ? "text-ink" : "text-ink-3"}`}>
                    {step.label}
                    {step.live && bet.pending && (
                      <span className="tnum ml-2 text-xs font-normal text-warning">
                        {bet.pending.challengeDeadlineTs > Math.floor(Date.now() / 1000) ? (
                          <>challenge window · <Countdown ts={bet.pending.challengeDeadlineTs} /></>
                        ) : (
                          "window closed · finalizing…"
                        )}
                      </span>
                    )}
                  </p>
                  {i === currentStep && step.detail !== "—" && (
                    <p className="text-xs leading-relaxed text-ink-3">{step.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-hairline bg-raised p-3 text-xs leading-relaxed">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-medium uppercase tracking-wide text-ink-3">Verify it yourself</p>
            {proofBadge(bet) && (
              <span
                title={proofBadge(bet)!.title}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  proofBadge(bet)!.provisional
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-good/40 bg-good/10 text-good"
                }`}
              >
                {proofBadge(bet)!.provisional ? "◷" : "✓"} {proofBadge(bet)!.label}
              </span>
            )}
          </div>
          <p className="text-ink-3">Decided by a Merkle proof, not an admin key. Check it:</p>
          <div className="mt-2 flex flex-col gap-1">
            <a className="text-over hover:underline" href={explorerUrl(bet.address)} target="_blank" rel="noreferrer">
              Bet account {shortAddress(bet.address)} ↗
            </a>
            <a className="text-over hover:underline" href={explorerUrl(TXORACLE_PROGRAM_ID)} target="_blank" rel="noreferrer">
              TxLINE verifier program {shortAddress(TXORACLE_PROGRAM_ID)} ↗
            </a>
            {bet.pending && (
              <span className="tnum text-ink-2">
                Proof anchored at {formatProofTime(bet.pending.proofTs)}
              </span>
            )}
          </div>
          {lastSig && (
            <p className="mt-2">
              <a
                className="text-over hover:underline"
                href={`https://explorer.solana.com/tx/${lastSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                Your last transaction ↗
              </a>
            </p>
          )}
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>
    </Sheet>
  );
}
