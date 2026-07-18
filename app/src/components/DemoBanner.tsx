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
        `Replay armed: ${demo.home} vs ${demo.away} — kickoff in ~2 min, proof lands ~3 min later`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    // The button says what it does. Anyone who wants the mechanism can read it
    // in How it works — it doesn't need to sit on the board.
    <div className="mb-3">
      <button
        onClick={launch}
        disabled={busy}
        className="w-full rounded-xl border border-over/40 bg-over/5 px-4 py-2.5 text-sm font-bold text-over transition hover:bg-over hover:text-white disabled:opacity-50"
      >
        {busy ? "Arming replay…" : "▶ Watch a live settlement"}
      </button>
      {error && <p className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  );
}
