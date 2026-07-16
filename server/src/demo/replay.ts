// Pure timeline remapping for the demo replay: a recorded TxLINE score
// timeline (a real match, ~2h of events) is compressed onto a few wall-clock
// minutes, preserving relative pacing, so the board ticks like a live match
// while the keeper works toward a real settlement. Kept free of Nest/IO so it
// is unit-testable with node --test alone.

/** One condensed score event distilled from a recorded TxLINE feed line. */
export interface RecordedFrame {
  tsMs: number; // original event timestamp (ms epoch)
  seq: number; // TxLINE sequence — advances, lets pollers detect updates
  home: number; // cumulative goals at this point in the match
  away: number;
  minute: number | null; // match clock minute when the clock was running
  statusId: number | null; // recorded TxLINE StatusId — replays the phase too
  gameState: string | null;
}

/**
 * Map frames' original span [first.tsMs .. last.tsMs] onto the wall-clock
 * window [startMs .. startMs + durationMs]. Frames must be sorted by tsMs.
 * An empty recording maps to nothing; a single frame — or a zero-length span —
 * plays immediately at the window start (there is no pacing to preserve).
 */
export function remapReplayTimeline<T extends { tsMs: number }>(
  frames: T[],
  startMs: number,
  durationMs: number
): (T & { playAtMs: number })[] {
  if (frames.length === 0) return [];
  const firstTs = frames[0].tsMs;
  const span = frames[frames.length - 1].tsMs - firstTs;
  return frames.map((frame) => ({
    ...frame,
    playAtMs:
      span <= 0 ? startMs : Math.round(startMs + ((frame.tsMs - firstTs) / span) * durationMs),
  }));
}
