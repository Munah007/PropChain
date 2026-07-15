"use client";

// Live scoreline off the TxLINE feed (proxied by our server, 60s-delayed free
// tier). We poll rather than stream — on a delayed feed it's equivalent and
// far more robust for a live demo. Staleness is measured from OUR last
// successful fetch, not the feed's event timestamp (the dev replay feed stamps
// events in a simulated match timeline, so its Ts isn't wall-clock).

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { usePoll } from "@/lib/hooks";

export function LiveScore({
  fixtureId,
  home,
  away,
  variant = "inline",
  live = true,
}: {
  fixtureId: number;
  home?: string;
  away?: string;
  variant?: "inline" | "card";
  /** true → in play (pulsing dot); false → final score */
  live?: boolean;
}) {
  const { data } = usePoll(() => api.score(fixtureId), 12000, [fixtureId]);
  const fetchedAt = useRef<number | null>(null);
  const [, tick] = useState(0);
  // Pop the digits when a goal lands mid-session (not on first paint).
  const prevGoals = useRef<string | null>(null);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (data) fetchedAt.current = Date.now();
    if (!data?.hasScore) return;
    const goals = `${data.home}-${data.away}`;
    const was = prevGoals.current;
    prevGoals.current = goals;
    if (was !== null && was !== goals) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 550);
      return () => clearTimeout(t);
    }
  }, [data]);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (!data?.hasScore) return null;

  const agoS = fetchedAt.current ? Math.max(0, Math.round((Date.now() - fetchedAt.current) / 1000)) : 0;
  const freshness = agoS < 5 ? "just now" : `${agoS}s ago`;
  const status = live ? "LIVE" : "Full time";

  if (variant === "card") {
    return (
      <div className="rounded-xl border border-hairline bg-raised p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
          {live && <span className="live-dot size-1.5 rounded-full bg-critical" aria-hidden />}
          <span className={live ? "text-critical" : "text-ink-3"}>{status}</span>
          {data.minute != null && <span className="text-ink-3">· {data.minute}&apos;</span>}
          <span className="ml-auto font-normal normal-case tracking-normal text-ink-3">
            updated {freshness}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{home ?? "Home"}</span>
          <span className={`tnum shrink-0 font-mono text-xl font-bold text-ink ${pop ? "score-pop" : ""}`}>
            {data.home} <span className="text-ink-3">–</span> {data.away}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-ink">{away ?? "Away"}</span>
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`tnum font-mono font-bold text-ink ${pop ? "score-pop" : ""}`}>
        {data.home}<span className="text-ink-3">–</span>{data.away}
      </span>
      {data.minute != null && <span className="text-ink-3">{data.minute}&apos;</span>}
      {/* freshness only matters in play — a final score isn't "3s ago" */}
      {live && <span className="text-ink-3/70">· {freshness}</span>}
    </span>
  );
}
