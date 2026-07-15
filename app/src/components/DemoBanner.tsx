"use client";

// Post-tournament lifeline: with no live matches, a judge can replay a real
// finished fixture and watch the keeper settle a real on-chain bet with a
// real TxLINE Merkle proof, minutes from now. The bet, the proof and the CPI
// are all genuine — only the clock is shifted.

import { useState } from "react";
import { api } from "@/lib/api";

export function DemoBanner({
  onLaunched,
}: {
  onLaunched: (fixtureKey: string, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const demo = await api.demoLaunch();
      onLaunched(
        String(demo.fixtureId),
        `Replay armed: ${demo.home} vs ${demo.away} — kickoff in ~2 min, proof settles it live`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-over/30 bg-over/5 p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">No match on right now?</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
          Replay a real World Cup match and watch a TxLINE Merkle proof settle a real
          on-chain market — live, in about two minutes.
        </p>
        {error && <p className="mt-1 text-xs text-critical">{error}</p>}
      </div>
      <button
        onClick={launch}
        disabled={busy}
        className="shrink-0 rounded-xl border border-over/50 px-4 py-2.5 text-sm font-bold text-over transition hover:bg-over hover:text-white disabled:opacity-50"
      >
        {busy ? "Arming replay…" : "▶ Watch a live settlement"}
      </button>
    </div>
  );
}
