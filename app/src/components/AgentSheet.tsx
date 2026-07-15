"use client";

// The 12th Man: an autonomous loyalty agent. Name your team and it defends
// them — automatically staking the pro-team side of any market that goes
// against them, from your wallet, within your limits.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type AgentConfig, type AgentInfo } from "@/lib/api";
import { flag } from "@/lib/flags";
import { searchTeams } from "@/lib/teams";
import { Sheet, Button } from "./ui";

const DEFAULTS: AgentConfig = {
  enabled: false,
  teams: [],
  mode: "react",
  minStake: 2,
  maxStake: 10,
  maxBetsPerDay: 5,
};

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function AgentSheet({
  open,
  onClose,
  inferredTeam,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  inferredTeam?: string | null;
  onChanged?: () => void;
}) {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULTS);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranMsg, setRanMsg] = useState<string | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRanMsg(null);
    api
      .agent()
      .then((i) => {
        setInfo(i);
        // prefill an empty config with the team we inferred from their bets
        const teams = i.config.teams.length ? i.config.teams : inferredTeam ? [inferredTeam] : [];
        setCfg({ ...i.config, teams });
      })
      .catch((e) => setError((e as Error).message));
  }, [open, inferredTeam]);

  const setField = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const addTeam = (t: string) => {
    if (t && !cfg.teams.includes(t)) setField("teams", [...cfg.teams, t]);
    setTeamQuery("");
    setPickerOpen(false);
  };
  const removeTeam = (t: string) => setField("teams", cfg.teams.filter((x) => x !== t));

  // Search results grouped by competition (National teams / league).
  const grouped = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const opt of searchTeams(teamQuery, cfg.teams)) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt.name);
      groups.set(opt.group, list);
    }
    return [...groups.entries()];
  }, [teamQuery, cfg.teams]);

  // Close the results dropdown on an outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  async function save(next?: Partial<AgentConfig>) {
    const config = { ...cfg, ...next };
    if (config.enabled && config.teams.length === 0) {
      setError("Pick at least one team for your 12th Man to defend.");
      return;
    }
    if (config.minStake <= 0 || config.minStake > config.maxStake) {
      setError("Min stake must be above 0 and no more than max stake.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const i = await api.setAgent(config);
      setInfo(i);
      setCfg(i.config);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    setError(null);
    setRanMsg(null);
    try {
      const { placed } = await api.runAgent();
      setRanMsg(
        placed.length
          ? `Placed ${placed.length} bet${placed.length === 1 ? "" : "s"} just now.`
          : "Nothing to back right now — no markets are running against your team."
      );
      setInfo(await api.agent());
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="12th Man · your loyalty agent">
      <p className="mb-4 text-sm leading-relaxed text-ink-2">
        Name your team and the 12th Man defends them automatically — taking the other side of
        anyone who bets against you, straight from your wallet, within the limits you set.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {/* enable */}
      <label className="flex items-center justify-between rounded-xl border border-hairline bg-raised p-3.5">
        <span>
          <span className="text-sm font-bold text-ink">
            {cfg.enabled ? "Active" : "Turn on the 12th Man"}
          </span>
          <span className="mt-0.5 block text-xs text-ink-3">
            {cfg.enabled ? "Backing your team automatically" : "Off — no bets placed for you"}
          </span>
        </span>
        <button
          role="switch"
          aria-checked={cfg.enabled}
          onClick={() => save({ enabled: !cfg.enabled })}
          disabled={busy !== null}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${cfg.enabled ? "bg-over" : "bg-hairline"}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${cfg.enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </label>

      {/* teams */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
          My team(s) — country or club
        </p>
        {cfg.teams.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {cfg.teams.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-over/30 bg-over/10 px-2.5 py-1 text-sm font-semibold text-ink">
                <span aria-hidden>{flag(t)}</span> {t}
                <button onClick={() => removeTeam(t)} className="text-ink-3 hover:text-ink" aria-label={`Remove ${t}`}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative" ref={pickerRef}>
          <input
            type="text"
            value={teamQuery}
            onChange={(e) => {
              setTeamQuery(e.target.value);
              setPickerOpen(true);
            }}
            onFocus={() => setPickerOpen(true)}
            placeholder="Search a country, club, or league…"
            aria-label="Search teams"
            className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-over"
          />
          {pickerOpen && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-hairline bg-raised shadow-xl">
              {grouped.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-3">No teams match “{teamQuery}”.</p>
              ) : (
                grouped.map(([group, names]) => (
                  <div key={group}>
                    <p className="sticky top-0 bg-raised px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                      {group}
                    </p>
                    {names.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTeam(t)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition hover:bg-surface"
                      >
                        <span aria-hidden>{flag(t)}</span> {t}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
          Type a nation, a club (Arsenal, Real Madrid…), or a league (Premier League, La Liga)
          to browse it. During the World Cup the live feed is national teams — a country acts
          right away; a club is defended the moment a match for it appears.
        </p>
      </div>

      {/* mode */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">When to step in</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["react", "Answer doubters", "Only bets when someone stakes against your team"],
            ["seed", "Back every market", "Takes your side of every market on your team's matches"],
          ] as const).map(([mode, title, sub]) => (
            <button
              key={mode}
              onClick={() => setField("mode", mode)}
              className={`rounded-xl border p-3 text-left transition ${
                cfg.mode === mode ? "border-over bg-over/10" : "border-hairline hover:border-white/20"
              }`}
            >
              <p className="text-sm font-bold text-ink">{title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* limits */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {([
          ["Min / pool", "minStake"],
          ["Max / pool", "maxStake"],
          ["Bets / day", "maxBetsPerDay"],
        ] as const).map(([label, field]) => (
          <label key={field} className="rounded-xl border border-hairline bg-raised p-3 text-center">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
            <input
              type="number"
              min={1}
              value={cfg[field]}
              onChange={(e) => setField(field, Math.max(1, Number(e.target.value)))}
              className="tnum mt-1 w-full bg-transparent text-center font-mono text-lg font-bold text-ink outline-none"
            />
            <span className="block text-[10px] text-ink-3">{field === "maxBetsPerDay" ? "agent only" : "pUSDC"}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => save()} disabled={busy !== null} className="flex-1">
          {busy === "save" ? "Saving…" : "Save settings"}
        </Button>
        <Button variant="ghost" onClick={runNow} disabled={busy !== null || !cfg.enabled}>
          {busy === "run" ? "Running…" : "Run now"}
        </Button>
      </div>
      <p className="mt-2 text-center text-[11px] leading-snug text-ink-3">
        Save keeps these settings — the agent then runs on its own every ~20s.
        Run now checks immediately instead of waiting.
      </p>
      {ranMsg && <p className="mt-1 text-center text-xs text-ink-2">{ranMsg}</p>}

      {/* activity */}
      {info && (
        <div className="mt-5 border-t border-hairline pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Recent activity</p>
            <p className="tnum text-xs text-ink-3">
              {info.today.count}/{info.today.max} today
            </p>
          </div>
          {info.recent.length === 0 ? (
            <p className="py-3 text-center text-xs text-ink-3">
              No bets yet. When someone bets against your team, they&apos;ll show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {info.recent.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs">
                  <span className="min-w-0 text-ink-2">
                    <span aria-hidden>{flag(a.team)}</span>{" "}
                    Backed <span className="font-semibold text-ink">{a.team}</span> with{" "}
                    <span className="tnum font-mono text-ink">{a.amount}</span> pUSDC
                    <span className="block text-ink-3">{a.reason}</span>
                  </span>
                  <span className="shrink-0 text-right text-ink-3">
                    {ago(a.ts)}
                    {a.signature && (
                      <a
                        href={`https://explorer.solana.com/tx/${a.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="block font-mono text-over hover:underline"
                      >
                        tx ↗
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
