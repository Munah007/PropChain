"use client";

import { useMemo, useState } from "react";
import { api, type Fixture, type Session } from "@/lib/api";
import { MARKETS, kickoffLabel, lineOf } from "@/lib/format";
import { Button, Sheet } from "./ui";

const GROUPS = Array.from(new Set(MARKETS.map((m) => m.group)));

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
  onCreated: (message?: string, signature?: string) => void;
}) {
  const upcoming = useMemo(
    () => fixtures.filter((f) => f.kickoffTs > Math.floor(Date.now() / 1000) + 60),
    [fixtures]
  );
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  const [marketId, setMarketId] = useState(MARKETS[0].id);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [side, setSide] = useState<"over" | "under">("over");
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fixture = upcoming.find((f) => f.fixtureId === fixtureId) ?? upcoming[0];
  const market = MARKETS.find((m) => m.id === marketId) ?? MARKETS[0];
  const line = threshold ?? market.defaultThreshold;
  const team = { home: fixture?.home ?? "Home", away: fixture?.away ?? "Away" };
  const fill = (s: string) => s.replace("{home}", team.home).replace("{away}", team.away);

  async function submit() {
    if (!fixture) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createBet({
        userKey: session.userKey,
        fixtureId: fixture.fixtureId,
        statKeyA: market.a,
        statKeyB: market.b,
        op: market.op,
        kind: market.kind,
        comparison: "greater",
        threshold: line,
        kickoffTs: fixture.kickoffTs,
        opening: amount > 0 ? { side, amount } : undefined,
      });
      onCreated("Bet is live on the board", result.signature);
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
            <div className={market.hasLine ? "" : "col-span-2"}>
              <label className={label} htmlFor="market">Market</label>
              <select
                id="market"
                className={field}
                value={marketId}
                onChange={(e) => {
                  setMarketId(e.target.value);
                  setThreshold(null); // reset to the new market's default line
                }}
              >
                {GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {MARKETS.filter((m) => m.group === group).map((m) => (
                      <option key={m.id} value={m.id}>{fill(m.label)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {market.hasLine && (
              <div>
                <label className={label} htmlFor="line">Line</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setThreshold(Math.max(0, line - 1))}
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-hairline bg-raised text-ink-2 hover:text-ink"
                    aria-label="Lower line"
                  >
                    −
                  </button>
                  <span className="tnum flex-1 rounded-lg border border-hairline bg-raised py-2 text-center font-mono text-sm font-semibold text-ink">
                    {lineOf(line)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setThreshold(line + 1)}
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-hairline bg-raised text-ink-2 hover:text-ink"
                    aria-label="Raise line"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="rounded-lg bg-raised px-3 py-2 text-xs leading-relaxed text-ink-3">
            {market.hasLine ? (
              <>
                <span className="text-ink-2">{fill(market.sides[0])} {lineOf(line)}</span> needs {line + 1} or more;
                exactly {line} goes {fill(market.sides[1]).toLowerCase()}.
              </>
            ) : market.kind === "bothScore" ? (
              <>Lands only if <span className="text-ink-2">both teams score at least once</span>.</>
            ) : (
              <>Binary market — <span className="text-ink-2">{fill(market.sides[0])}</span> vs{" "}
                <span className="text-ink-2">{fill(market.sides[1])}</span>.</>
            )}{" "}
            Settlement is trustless: a TxLINE Merkle proof verified on-chain decides it.
          </p>

          <div>
            <span className={label}>Your opening stake</span>
            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-hairline">
                <button
                  type="button"
                  onClick={() => setSide("over")}
                  className={`flex-1 truncate px-2 py-2.5 text-sm font-semibold transition ${side === "over" ? "bg-over text-white" : "bg-raised text-ink-3 hover:text-ink"}`}
                >
                  {fill(market.sides[0])}
                </button>
                <button
                  type="button"
                  onClick={() => setSide("under")}
                  className={`flex-1 truncate px-2 py-2.5 text-sm font-semibold transition ${side === "under" ? "bg-under text-white" : "bg-raised text-ink-3 hover:text-ink"}`}
                >
                  {fill(market.sides[1])}
                </button>
              </div>
              <div className="relative w-32 shrink-0">
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

          {amount > 0 && (
            <p className="tnum -mt-1 font-mono text-xs text-ink-2">
              You open “{fill(market.sides[side === "over" ? 0 : 1])}” with {amount} pUSDC — payout grows
              as the other side fills.
            </p>
          )}

          {error && <p className="text-sm text-critical">{error}</p>}

          <Button onClick={submit} disabled={busy || !fixture} className="w-full py-3">
            {busy ? "Deploying on-chain…" : "Create bet"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
