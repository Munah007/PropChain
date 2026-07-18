"use client";

// Track record — every result this protocol ever produced, and the proof for
// each one.
//
// This surface only exists because settlement is provable. A protocol that
// resolves with an admin key can publish the same table, but the "proof"
// column would be an assertion. Here each row links the Merkle-proved stat and
// the TxLINE verifier program that checked it, on-chain, via CPI. The headline
// number is the one that matters: settled markets backed by a proof, over
// settled markets total. It should always read 100%.

import { useState } from "react";
import { api, type SettledRecord, type TrackRecord } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { money, pusdc, formatProofTime, explorerUrl, TXORACLE_PROGRAM_ID } from "@/lib/format";

function Tile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-raised p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">{label}</p>
      <p className={`tnum mt-1 font-mono text-xl font-bold ${accent ? "text-good" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}

/** Rebuild the market's wording without needing the full Bet — the ledger is
 *  public and renders before any wallet exists. */
function marketLine(r: SettledRecord): string {
  const stat = (k: number) =>
    ({ 1: "home goals", 2: "away goals", 3: "home yellows", 4: "away yellows", 5: "home reds", 6: "away reds", 7: "home corners", 8: "away corners" })[
      k
    ] ?? `stat ${k}`;
  const lhs =
    r.kind === "bothScore"
      ? `${stat(r.statKeyA)} and ${stat(r.statKeyB ?? 0)} both`
      : r.op === "add"
        ? `${stat(r.statKeyA)} + ${stat(r.statKeyB ?? 0)}`
        : r.op === "subtract"
          ? `${stat(r.statKeyA)} − ${stat(r.statKeyB ?? 0)}`
          : stat(r.statKeyA);
  return `${lhs} ${r.comparison === "greater" ? ">" : "<"} ${r.threshold}`;
}

function Row({ r, onOpen }: { r: SettledRecord; onOpen: (address: string) => void }) {
  const matchup = r.home && r.away ? `${r.home} v ${r.away}` : `Fixture ${r.fixtureId}`;
  const pool = pusdc(r.overTotal) + pusdc(r.underTotal);

  return (
    <div className="rounded-xl border border-hairline bg-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-ink-3">{matchup}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-2">{marketLine(r)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            r.result ? "bg-over/15 text-over" : "bg-under/15 text-under"
          }`}
        >
          {r.result ? "Over won" : "Under won"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-ink-3">
        <span className="tnum font-mono">{money(pool)} pUSDC</span>
        <span className="tnum font-mono">proved {formatProofTime(r.proofTs)}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          onClick={() => onOpen(r.betAddress)}
          className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition hover:text-ink"
        >
          See the proof
        </button>
        <a
          href={explorerUrl(r.betAddress)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition hover:text-ink"
        >
          Escrow on Explorer ↗
        </a>
      </div>
    </div>
  );
}

// Team names come from the endpoint itself, so the ledger renders standalone —
// no fixture list to thread through, and it works before the board has loaded.
export function TrackRecordPanel({ onOpen }: { onOpen: (address: string) => void }) {
  const { data } = usePoll<TrackRecord>(() => api.trackRecord(), 30000);
  const [limit, setLimit] = useState(10);

  const s = data?.summary;
  const rows = data?.settled ?? [];

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ink-3">
        Every result this protocol produced, each verified on-chain by{" "}
        <a
          href={explorerUrl(TXORACLE_PROGRAM_ID)}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-over hover:brightness-110"
        >
          validate_stat
        </a>
        . The proved count equals the settled count because there is no other way to settle.
      </p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile
          label="Settled by proof"
          value={s ? `${s.settledWithProof} / ${s.settled}` : "—"}
          hint="no other settlement path exists"
          accent
        />
        <Tile label="Markets" value={s ? String(s.marketsCreated) : "—"} hint="created all-time" />
        <Tile label="Staked" value={s ? money(s.totalStakedUsdc) : "—"} hint="pUSDC escrowed" />
        <Tile
          label="Open"
          value={s ? String(s.open) : "—"}
          hint={s ? `${s.voided} voided · refunded` : undefined}
        />
      </div>

      {!data ? (
        <p className="py-8 text-center text-sm text-ink-3">Reading the ledger…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">Nothing settled yet.</p>
      ) : (
        <>
          <div className="space-y-3">
            {rows.slice(0, limit).map((r) => (
              <Row key={r.betAddress} r={r} onOpen={onOpen} />
            ))}
          </div>
          {rows.length > limit && (
            <button
              onClick={() => setLimit(limit + 20)}
              className="w-full rounded-xl border border-dashed border-hairline py-2.5 text-sm font-semibold text-ink-3 transition hover:text-ink"
            >
              Show {Math.min(20, rows.length - limit)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
