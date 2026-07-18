"use client";

// Signals — where the tournament we recorded disagrees with the money.
//
// Two numbers per market: how often this exact bet came in across 78 recorded
// World Cup finals, and what the pool is currently pricing it at. The gap is
// the signal. We don't claim to know which number is wrong, and we say so.
//
// Markets we can't price honestly (corners, cards — we hold full stat frames
// for only four matches) are shown as unpriced rather than hidden, so the
// board reflects everything that's actually open.

import type { Bet, Fixture, Signal } from "@/lib/api";
import { betTitle, sideLabels, money, pusdc } from "@/lib/format";
import { Countdown } from "./ui";

function pct(p: number | null): string {
  return p == null ? "—" : `${(p * 100).toFixed(0)}%`;
}

/**
 * Side-by-side bars: what the record says vs what the pool is paying. Both
 * measure the same thing (the over side's chance), so they're separated by
 * source, not hue — the recorded line is a muted reference, the live pool
 * carries the brand blue.
 */
function Compare({ fair, implied }: { fair: number | null; implied: number | null }) {
  const rows: { label: string; value: number | null; tone: string }[] = [
    { label: "Recorded", value: fair, tone: "bg-ink-3" },
    { label: "Pool", value: implied, tone: "bg-over" },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-ink-3">{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${r.tone} transition-[width] duration-500`}
              style={{ width: `${Math.round((r.value ?? 0) * 100)}%` }}
            />
          </div>
          <span className="tnum w-10 shrink-0 text-right font-mono text-xs text-ink-2">{pct(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SignalRow({
  signal,
  bet,
  fixtures,
  onTake,
}: {
  signal: Signal;
  bet: Bet | undefined;
  fixtures: Fixture[];
  onTake: (bet: Bet, side: "over" | "under") => void;
}) {
  const title = bet ? betTitle(bet, fixtures) : `Market ${signal.betAddress.slice(0, 6)}`;
  const labels = bet ? sideLabels(bet, fixtures) : { over: "Over", under: "Under" };
  const matchup = signal.home && signal.away ? `${signal.home} v ${signal.away}` : signal.fixtureId;
  const pool = pusdc(signal.overTotal) + pusdc(signal.underTotal);

  const hasEdge = signal.side != null && signal.edgePp != null;
  const sideLabel = signal.side === "over" ? labels.over : labels.under;
  // The value side keeps the app's own colour language: over is blue, under is
  // green, everywhere. A signal is a shortcut into a stake, so it should look
  // like the stake it leads to. Class names are written out in full — Tailwind
  // scans source statically, so an interpolated `bg-${side}` compiles to nothing.
  const isUnder = signal.side === "under";
  const tone = isUnder
    ? { card: "border-under/40 bg-under/[0.06]", chip: "bg-under/15 text-under", button: "border-under/40 bg-under/10 text-under hover:bg-under/20" }
    : { card: "border-over/40 bg-over/[0.06]", chip: "bg-over/15 text-over", button: "border-over/40 bg-over/10 text-over hover:bg-over/20" };

  return (
    <div className={`rounded-xl border p-4 ${hasEdge ? tone.card : "border-white/10 bg-raised"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-ink-3">{matchup}</p>
          <p className="mt-0.5 truncate font-medium text-ink">{title}</p>
        </div>
        {hasEdge && (
          <span className={`tnum shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${tone.chip}`}>
            +{signal.edgePp!.toFixed(1)}pp
          </span>
        )}
      </div>

      {signal.source === "recorded" ? (
        <>
          <Compare fair={signal.fairProb} implied={signal.impliedProb} />
          {/* With an edge the bars, the chip and the button already say it —
              a sentence repeating them is noise. Only the empty states need words. */}
          {!hasEdge && (
            <p className="mt-2.5 text-xs leading-relaxed text-ink-3">
              {signal.impliedProb == null ? "Nobody has taken the other side yet." : "Pool and record agree — no edge."}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-3">
          Unpriced — {signal.reason ?? "we have no recorded base rate for this stat"}.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className="tnum font-mono text-[11px] text-ink-3">
          {money(pool)} pUSDC pooled
          {signal.source === "recorded" && ` · n=${signal.n}`}
        </span>
        {hasEdge && bet ? (
          <button
            onClick={() => onTake(bet, signal.side!)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${tone.button}`}
          >
            Take {sideLabel}
          </button>
        ) : (
          <Countdown ts={signal.kickoffTs} prefix="closes in&nbsp;" />
        )}
      </div>
    </div>
  );
}

export function SignalsPanel({
  data,
  bets,
  fixtures,
  onTake,
}: {
  data: { signals: Signal[]; finals: number; minEdgePp: number } | null;
  bets: Bet[];
  fixtures: Fixture[];
  onTake: (bet: Bet, side: "over" | "under") => void;
}) {
  const byAddress = new Map(bets.map((b) => [b.address, b]));
  const signals = data?.signals ?? [];
  const withEdge = signals.filter((s) => s.side != null).length;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ink-3">
        Every open market priced against <strong className="text-ink-2">{data?.finals ?? 0}</strong> World Cup finals we
        recorded, next to what the pool is paying.
      </p>

      {!data ? (
        <p className="py-8 text-center text-sm text-ink-3">Reading the board…</p>
      ) : signals.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">
          No open markets right now. Signals appear as soon as someone opens one.
        </p>
      ) : (
        <>
          {withEdge === 0 && (
            <p className="text-xs text-ink-3">
              Nothing above the {data.minEdgePp}pp threshold at the moment — every open market is priced close to its
              recorded rate.
            </p>
          )}
          <div className="space-y-3">
            {signals.map((s) => (
              <SignalRow
                key={s.betAddress}
                signal={s}
                bet={byAddress.get(s.betAddress)}
                fixtures={fixtures}
                onTake={onTake}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
