"use client";

// Bet detail: stake actions, the settlement timeline, and the proof panel —
// the judge-facing "trustless resolution" story told on one screen.

import { useState } from "react";
import { api, type Bet, type Fixture, type Position, type Session } from "@/lib/api";
import {
  betTitle,
  explorerUrl,
  kickoffLabel,
  matchup,
  money,
  payoutIfWins,
  pusdc,
  shortAddress,
} from "@/lib/format";
import { Button, Countdown, Sheet, StatusPill } from "./ui";

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
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  if (!bet) return null;
  const now = Math.floor(Date.now() / 1000);
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
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const steps: { label: string; detail: string; done: boolean; live?: boolean }[] = [
    { label: "Created", detail: "Bet config immutable on-chain", done: true },
    {
      label: "Kickoff",
      detail: kickoffLabel(bet.kickoffTs),
      done: now >= bet.kickoffTs,
    },
    {
      label: "Settlement proposed",
      detail: bet.pending
        ? `Keeper submitted a TxLINE Merkle proof — verdict ${bet.pending.result ? "Over" : "Under"}`
        : bet.status === "settled" || bet.status === "voided"
          ? "Proof verified via CPI into TxLINE's validate_stat"
          : "Waiting for the final whistle — proofs from live match phases are rejected on-chain",
      done: bet.pending !== null || bet.status === "settled" || bet.status === "voided",
      live: bet.status === "settlementPending",
    },
    {
      label: bet.status === "voided" ? "Voided" : "Settled",
      detail:
        bet.status === "settled"
          ? `${bet.result ? "Over" : "Under"} won — winners claim from the pool`
          : bet.status === "voided"
            ? "All stakes refundable"
            : bet.pending
              ? "Locks when the challenge window lapses — any later proof can overturn until then"
              : "—",
      done: bet.status === "settled" || bet.status === "voided",
    },
  ];

  return (
    <Sheet open onClose={onClose} title={betTitle(bet)}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-2">{matchup(bet, fixtures)}</p>
          <StatusPill status={bet.status} />
        </div>

        {stakeable && (
          <div className="rounded-xl border border-hairline bg-raised p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
              Stake · closes <Countdown ts={bet.kickoffTs} /> before kickoff
            </p>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-hairline">
                <button
                  onClick={() => setSide("over")}
                  className={`flex-1 py-2 text-sm font-semibold ${side === "over" ? "bg-over text-white" : "text-ink-3 hover:text-ink"}`}
                >
                  Over
                </button>
                <button
                  onClick={() => setSide("under")}
                  className={`flex-1 py-2 text-sm font-semibold ${side === "under" ? "bg-under text-white" : "text-ink-3 hover:text-ink"}`}
                >
                  Under
                </button>
              </div>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="tnum w-24 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-over"
                aria-label="Stake amount in pUSDC"
              />
              <Button
                onClick={() =>
                  session
                    ? run("stake", `Staked ${amount} pUSDC on ${side === "over" ? "Over" : "Under"}`, () => api.stake(bet.address, { userKey: session.userKey, side, amount }))
                    : onRequireAuth(`stake ${amount} pUSDC on ${side === "over" ? "Over" : "Under"}`)
                }
                disabled={busy !== null || amount <= 0}
              >
                {busy === "stake" ? "Staking…" : session ? "Stake" : "Sign in & stake"}
              </Button>
            </div>
            {amount > 0 && (
              <p className="tnum mt-2.5 font-mono text-xs text-ink-2">
                Stake {money(amount)} → get{" "}
                <span className={`font-semibold ${side === "over" ? "text-over" : "text-under"}`}>
                  {money(payoutIfWins(bet, side, amount))} pUSDC
                </span>{" "}
                if {side === "over" ? "Over" : "Under"} lands (×
                {(payoutIfWins(bet, side, amount) / amount).toFixed(2)})
                {pusdc(side === "over" ? bet.underTotal : bet.overTotal) === 0 && (
                  <span className="text-ink-3"> — grows as {side === "over" ? "Under" : "Over"} fills</span>
                )}
              </p>
            )}
            {position && (
              <p className="mt-1.5 text-xs text-ink-3">
                Your position: {money(pusdc(position.amount))} pUSDC on {position.side} — top-ups must stay on the same side.
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
                        challenge window · <Countdown ts={bet.pending.challengeDeadlineTs} />
                      </span>
                    )}
                  </p>
                  <p className="text-xs leading-relaxed text-ink-3">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-hairline bg-raised p-3 text-xs leading-relaxed">
          <p className="mb-1 font-medium uppercase tracking-wide text-ink-3">Verify it yourself</p>
          <p className="text-ink-3">
            No admin key can decide this bet. Settlement requires a Merkle proof from TxLINE&apos;s
            oracle, verified by CPI into their on-chain program — inspect every transaction:
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <a className="text-over hover:underline" href={explorerUrl(bet.address)} target="_blank" rel="noreferrer">
              Bet account {shortAddress(bet.address)} ↗
            </a>
            {bet.pending && (
              <span className="tnum text-ink-2">proof event ts {bet.pending.proofTs}</span>
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
