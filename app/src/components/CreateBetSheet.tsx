"use client";

import { useMemo, useState } from "react";
import { api, type Fixture, type Session } from "@/lib/api";
import { STAT_TEMPLATES, kickoffLabel } from "@/lib/format";
import { Button, Sheet } from "./ui";

export function CreateBetSheet({
  open,
  onClose,
  session,
  fixtures,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  fixtures: Fixture[];
  onCreated: () => void;
}) {
  const upcoming = useMemo(
    () => fixtures.filter((f) => f.kickoffTs > Math.floor(Date.now() / 1000) + 60),
    [fixtures]
  );
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  const [template, setTemplate] = useState(0);
  const [threshold, setThreshold] = useState(9);
  const [side, setSide] = useState<"over" | "under">("over");
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fixture = upcoming.find((f) => f.fixtureId === fixtureId) ?? upcoming[0];
  const stat = STAT_TEMPLATES[template];

  async function submit() {
    if (!fixture) return;
    setBusy(true);
    setError(null);
    try {
      await api.createBet({
        userKey: session.userKey,
        fixtureId: fixture.fixtureId,
        statKeyA: stat.a,
        statKeyB: stat.b,
        comparison: "greater",
        threshold,
        kickoffTs: fixture.kickoffTs,
        opening: amount > 0 ? { side, amount } : undefined,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-xs font-medium uppercase tracking-wide text-ink-3 mb-1.5";
  const field =
    "w-full rounded-lg border border-hairline bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-over";

  return (
    <Sheet open={open} onClose={onClose} title="Create a prop bet">
      {upcoming.length === 0 ? (
        <p className="text-sm text-ink-2">No upcoming fixtures — check back before the next match.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="match">Match</label>
            <select id="match" className={field} value={fixture?.fixtureId} onChange={(e) => setFixtureId(Number(e.target.value))}>
              {upcoming.map((f) => (
                <option key={f.fixtureId} value={f.fixtureId}>
                  {f.home} vs {f.away} — {kickoffLabel(f.kickoffTs)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="stat">Stat</label>
              <select id="stat" className={field} value={template} onChange={(e) => setTemplate(Number(e.target.value))}>
                {STAT_TEMPLATES.map((t, i) => (
                  <option key={t.label} value={i}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="threshold">Line (over/under)</label>
              <input
                id="threshold"
                type="number"
                min={0}
                className={`${field} tnum`}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, Math.floor(Number(e.target.value))))}
              />
            </div>
          </div>

          <p className="rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-ink-3">
            Strict line: <span className="text-ink-2">Over needs {threshold + 1}+</span> — exactly {threshold} counts as Under.
            Settlement is trustless: a TxLINE Merkle proof verified on-chain decides the result.
          </p>

          <div>
            <span className={label}>Your opening stake</span>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-hairline">
                <button
                  type="button"
                  onClick={() => setSide("over")}
                  className={`flex-1 py-2.5 text-sm font-semibold transition ${side === "over" ? "bg-over text-white" : "bg-raised text-ink-3 hover:text-ink"}`}
                >
                  Over
                </button>
                <button
                  type="button"
                  onClick={() => setSide("under")}
                  className={`flex-1 py-2.5 text-sm font-semibold transition ${side === "under" ? "bg-under text-white" : "bg-raised text-ink-3 hover:text-ink"}`}
                >
                  Under
                </button>
              </div>
              <div className="relative w-32">
                <input
                  type="number"
                  min={0}
                  max={session.pusdc}
                  className={`${field} tnum pr-14`}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  aria-label="Stake amount in pUSDC"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-3">pUSDC</span>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-critical">{error}</p>}

          <Button onClick={submit} disabled={busy || !fixture} className="w-full py-3">
            {busy ? "Deploying on-chain…" : "Create bet"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
