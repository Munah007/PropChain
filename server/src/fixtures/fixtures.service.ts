// TxLINE fixtures proxy. The browser never talks to TxLINE — this reuses the
// keeper's activated credentials (txline-creds.json) for read-only fixture
// lookups, cached for 60s.
//
// Every successful fetch is merged into a persistent on-disk archive
// (data/fixtures-archive.json): team names, kickoffs and last-known scores
// survive the feed going quiet after the tournament, so settled bets keep
// their real fixture names and final scorelines forever. Neither list() nor
// score() ever throws to the caller — the archive is the fallback.

import { Injectable, Logger } from "@nestjs/common";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { isMatchOver } from "./phases";

const WORLD_CUP_COMPETITION_ID = 72;
// Wide lookback so a single fetch backfills the whole tournament into the
// archive (TxLINE serves ~the full schedule; filtering happens client-side).
const LOOKBACK_DAYS = Number(process.env.FIXTURES_LOOKBACK_DAYS ?? 30);

/** Schedule identity of a match — the shape that persists in the archive. */
export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number; // unix seconds
  competition: string;
}

/** A fixture stamped with its latest known phase — what list() serves. */
export interface FixtureWithStatus extends Fixture {
  statusId: number | null; // latest TxLINE StatusId seen, null if never scored
  finished: boolean; // isMatchOver(statusId) — the board's LIVE/finished signal
}

export interface LiveScore {
  fixtureId: number;
  hasScore: boolean;
  home: number; // home (Participant1) goals
  away: number; // away (Participant2) goals
  minute: number | null; // clock minute when the match clock is running
  statusId: number | null; // TxLINE StatusId — the real phase signal (see phases.ts)
  finished: boolean; // derived from statusId, never stored
  gameState: string | null; // raw TxLINE game state — observed as a constant
  // "scheduled" on every recorded event, so it says nothing about liveness.
  // Kept for debugging only; statusId is the field to trust.
  asOf: number; // ms epoch of the latest score event
  seq: number; // TxLINE sequence — advances as the feed replays
  archived?: boolean; // true when served from the archive, not the live feed
}

interface ArchiveEntry extends Fixture {
  // `finished` is derived from statusId on read, so it is never persisted —
  // archives written before statusId existed simply read back as null/false.
  lastScore?: Omit<LiveScore, "fixtureId" | "hasScore" | "minute" | "archived" | "finished">;
}

/** One pre-scheduled score frame of an active demo replay (see demo/). */
export interface ReplayFrame {
  playAtMs: number; // wall-clock ms at which this frame becomes "current"
  seq: number;
  home: number;
  away: number;
  minute: number | null;
  statusId: number | null; // phase as recorded — flips the card at the replayed whistle
  gameState: string | null;
}

@Injectable()
export class FixturesService {
  private readonly log = new Logger(FixturesService.name);
  private apiOrigin =
    process.env.TXLINE_NETWORK === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com";
  private credsPath =
    process.env.TXLINE_CREDS ?? join(process.cwd(), "..", "keeper", "txline-creds.json");
  private archivePath =
    process.env.FIXTURES_ARCHIVE ??
    join(process.env.DATA_DIR ?? process.cwd(), "data", "fixtures-archive.json");
  private cache: { at: number; fixtures: Fixture[] } | null = null;
  private scoreCache = new Map<number, { at: number; score: LiveScore }>();
  private archive: Map<number, ArchiveEntry> | null = null;
  private replay: {
    fixtureId: number;
    kickoffTs: number; // time-shifted kickoff overlaid in list()
    frames: ReplayFrame[]; // sorted by playAtMs
    expiresAtMs: number;
  } | null = null;

  private creds(): { jwt: string; apiToken: string } {
    if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
      return { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
    }
    if (!existsSync(this.credsPath)) {
      throw new Error(`TxLINE credentials not found at ${this.credsPath} — run the keeper once first`);
    }
    return JSON.parse(readFileSync(this.credsPath, "utf8"));
  }

  // ---------- persistent archive ----------

  private loadArchive(): Map<number, ArchiveEntry> {
    if (this.archive) return this.archive;
    this.archive = new Map();
    try {
      if (existsSync(this.archivePath)) {
        const entries: ArchiveEntry[] = JSON.parse(readFileSync(this.archivePath, "utf8"));
        for (const e of entries) this.archive.set(e.fixtureId, e);
      }
    } catch (err) {
      this.log.warn(`fixtures archive unreadable (${err}) — starting empty`);
    }
    return this.archive;
  }

  private saveArchive() {
    if (!this.archive) return;
    try {
      mkdirSync(dirname(this.archivePath), { recursive: true });
      const entries = [...this.archive.values()].sort((a, b) => a.kickoffTs - b.kickoffTs);
      writeFileSync(this.archivePath, JSON.stringify(entries, null, 1));
    } catch (err) {
      this.log.warn(`fixtures archive not saved: ${err}`);
    }
  }

  private mergeFixtures(fixtures: Fixture[]) {
    const archive = this.loadArchive();
    let changed = false;
    for (const f of fixtures) {
      const prev = archive.get(f.fixtureId);
      if (!prev || prev.home !== f.home || prev.kickoffTs !== f.kickoffTs) {
        archive.set(f.fixtureId, { ...prev, ...f });
        changed = true;
      }
    }
    if (changed) this.saveArchive();
  }

  private archiveScore(score: LiveScore) {
    const archive = this.loadArchive();
    const entry = archive.get(score.fixtureId);
    if (!entry) return; // only archive scores for known fixtures
    // Keep the freshest event only — the last one archived before the feed
    // goes quiet is the final scoreline.
    const prev = entry.lastScore;
    if (prev && prev.seq > score.seq) return;
    // Same seq normally means nothing new to store, with one exception: an
    // archive written before phases were tracked holds a null statusId, and a
    // finalised match will never emit a higher seq to carry one. Without this
    // backfill those fixtures would read finished:false for good.
    if (prev && prev.seq === score.seq && !(prev.statusId == null && score.statusId != null)) return;
    entry.lastScore = {
      home: score.home,
      away: score.away,
      statusId: score.statusId,
      gameState: score.gameState,
      asOf: score.asOf,
      seq: score.seq,
    };
    this.saveArchive();
  }

  // ---------- demo replay overlay (driven by demo/demo.service.ts) ----------

  /**
   * Overlay a recorded score timeline onto one fixture: score() serves the
   * frame whose playAtMs is the latest one passed, and list() shows the
   * fixture with the time-shifted kickoff, until expiresAtMs. The last frame
   * IS the real final score, so it keeps serving through the grace window
   * (while the keeper settles) and the post-expiry fallthrough to the archive
   * shows the same scoreline — no visible seam. One overlay at a time: the
   * demo itself is capped to one active run.
   */
  setReplay(fixtureId: number, frames: ReplayFrame[], kickoffTs: number, expiresAtMs: number) {
    this.replay = { fixtureId, kickoffTs, frames, expiresAtMs };
    this.log.log(
      `replay overlay set for fixture ${fixtureId}: ${frames.length} frames, expires ${new Date(expiresAtMs).toISOString()}`
    );
  }

  clearReplay() {
    this.replay = null;
  }

  private activeReplay() {
    if (this.replay && Date.now() >= this.replay.expiresAtMs) this.replay = null; // auto-expire
    return this.replay;
  }

  /** Replayed LiveScore for the fixture, or null when no overlay applies. */
  private replayScore(fixtureId: number): LiveScore | null {
    const replay = this.activeReplay();
    if (!replay || replay.fixtureId !== fixtureId) return null;
    const now = Date.now();
    let current: ReplayFrame | null = null;
    for (const frame of replay.frames) {
      if (frame.playAtMs > now) break;
      current = frame;
    }
    // Before the shifted kickoff the fixture looks like any upcoming match.
    if (!current) {
      return {
        fixtureId, hasScore: false, home: 0, away: 0, minute: null,
        statusId: null, finished: false, gameState: null, asOf: 0, seq: -1,
      };
    }
    return {
      fixtureId,
      hasScore: true,
      home: current.home,
      away: current.away,
      minute: current.minute,
      statusId: current.statusId,
      finished: isMatchOver(current.statusId),
      gameState: current.gameState,
      // asOf tracks the replay clock, not the original event time, so the
      // board reads the update as live rather than days old.
      asOf: current.playAtMs,
      seq: current.seq,
    };
  }

  /**
   * Stamp each fixture with its latest known phase from the archive. Applied on
   * the way out of list() rather than before the 60s fixtures cache, so the
   * board's LIVE/finished flip tracks the 10s score cache instead of lagging a
   * whole minute behind the final whistle.
   */
  private withStatus(fixtures: Fixture[]): FixtureWithStatus[] {
    const archive = this.loadArchive();
    return fixtures.map((f) => {
      const statusId = archive.get(f.fixtureId)?.lastScore?.statusId ?? null;
      return { ...f, statusId, finished: isMatchOver(statusId) };
    });
  }

  /**
   * While a replay is active, show its fixture with the shifted kickoff — and
   * with the phase of the frame currently playing, NOT the archived one. The
   * demo replays a match that really finished, so the archive would otherwise
   * stamp it finished before the replay has kicked off.
   */
  private withReplayKickoff(fixtures: FixtureWithStatus[]): FixtureWithStatus[] {
    const replay = this.activeReplay();
    if (!replay) return fixtures;
    const live = this.replayScore(replay.fixtureId);
    return fixtures.map((f) =>
      f.fixtureId === replay.fixtureId
        ? {
            ...f,
            kickoffTs: replay.kickoffTs,
            statusId: live?.statusId ?? null,
            finished: live?.finished ?? false,
          }
        : f
    );
  }

  /** Archived final score, if known — the demo uses it as a replay fallback. */
  lastKnownScore(fixtureId: number) {
    return this.loadArchive().get(fixtureId)?.lastScore ?? null;
  }

  // ---------- API ----------

  /**
   * Live score for one fixture, cached 10s so the board can poll without
   * hammering TxLINE. Goals are read from the latest-by-Seq event that carries
   * them per side, so a partial amend event never blanks the score. Never
   * throws to the caller — a feed hiccup falls back to the archived last-known
   * score (post-tournament: the final scoreline), then to hasScore:false.
   */
  async score(fixtureId: number): Promise<LiveScore> {
    // Demo replay wins over cache and feed — checked first so frames tick
    // faster than the 10s cache, and never leak into cache or archive.
    const replayed = this.replayScore(fixtureId);
    if (replayed) return replayed;

    const cached = this.scoreCache.get(fixtureId);
    if (cached && Date.now() - cached.at < 10_000) return cached.score;

    try {
      const creds = this.creds();
      const res = await fetch(
        `${this.apiOrigin}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`,
        { headers: { Authorization: `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken } }
      );
      if (!res.ok) return this.fallbackScore(fixtureId);
      const raw = await res.json();
      const events: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!events.length) return this.fallbackScore(fixtureId);

      const ordered = [...events].sort((a, b) => (a.Seq ?? -1) - (b.Seq ?? -1));
      const latest = ordered[ordered.length - 1];
      const goalsOf = (p: "Participant1" | "Participant2") => {
        let goals = 0;
        for (const e of ordered) {
          const g = e?.Score?.[p]?.Total?.Goals;
          if (typeof g === "number") goals = g;
        }
        return goals;
      };
      const clockSeconds = latest?.Clock?.Running ? latest?.Clock?.Seconds : null;
      // Phase folds forward like goals do: only ~4 in 5 events carry a
      // StatusId, and the newest event is routinely a stat update that omits
      // it — reading `latest.StatusId` reports null for a finalised match.
      // Last event that states a phase wins, so a later amend still overrides.
      let statusId: number | null = null;
      for (const e of ordered) if (typeof e?.StatusId === "number") statusId = e.StatusId;
      const score: LiveScore = {
        fixtureId,
        hasScore: true,
        home: goalsOf("Participant1"),
        away: goalsOf("Participant2"),
        minute: typeof clockSeconds === "number" ? Math.floor(clockSeconds / 60) : null,
        statusId,
        finished: isMatchOver(statusId),
        gameState: latest?.GameState ?? null,
        asOf: latest?.Ts ?? Date.now(),
        seq: latest?.Seq ?? -1,
      };
      this.scoreCache.set(fixtureId, { at: Date.now(), score });
      this.archiveScore(score);
      return score;
    } catch {
      return this.fallbackScore(fixtureId);
    }
  }

  private fallbackScore(fixtureId: number): LiveScore {
    const last = this.loadArchive().get(fixtureId)?.lastScore;
    if (last) {
      return {
        fixtureId,
        hasScore: true,
        home: last.home,
        away: last.away,
        minute: null,
        statusId: last.statusId ?? null,
        finished: isMatchOver(last.statusId),
        gameState: last.gameState,
        asOf: last.asOf,
        seq: last.seq,
        archived: true,
      };
    }
    return {
      fixtureId, hasScore: false, home: 0, away: 0, minute: null,
      statusId: null, finished: false, gameState: null, asOf: 0, seq: -1,
    };
  }

  /**
   * World Cup fixtures: the live TxLINE snapshot when available, always merged
   * with the archive so fixtures that have left the feed window (or the feed
   * itself, post-tournament) never disappear from the board. Never throws.
   */
  async list(): Promise<FixtureWithStatus[]> {
    // Phase and replay kickoff are overlaid on the way out, never cached.
    if (this.cache && Date.now() - this.cache.at < 60_000) {
      return this.withReplayKickoff(this.withStatus(this.cache.fixtures));
    }

    let fetched: Fixture[] | null = null;
    try {
      const creds = this.creds();
      const startEpochDay = Math.floor(Date.now() / 86_400_000) - LOOKBACK_DAYS;
      const res = await fetch(
        `${this.apiOrigin}/api/fixtures/snapshot?startEpochDay=${startEpochDay}`,
        { headers: { Authorization: `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken } }
      );
      if (!res.ok) throw new Error(`TxLINE fixtures fetch failed: ${res.status}`);
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : [];
      fetched = list
        .filter((f: any) => f.CompetitionId === WORLD_CUP_COMPETITION_ID && f.FixtureId)
        .map((f: any) => ({
          fixtureId: f.FixtureId,
          home: f.Participant1,
          away: f.Participant2,
          kickoffTs: Math.floor(f.StartTime / 1000),
          competition: f.Competition,
        }));
      this.mergeFixtures(fetched);
    } catch (err) {
      this.log.warn(`fixtures fetch failed (${err}) — serving archive`);
    }

    // Archive is the superset: live data refreshes it, and it answers alone
    // when the feed is empty or down.
    const merged = new Map<number, Fixture>();
    for (const { lastScore: _drop, ...fixture } of this.loadArchive().values()) {
      merged.set(fixture.fixtureId, fixture);
    }
    for (const f of fetched ?? []) merged.set(f.fixtureId, f);
    const fixtures = [...merged.values()].sort((a, b) => a.kickoffTs - b.kickoffTs);

    // Don't cache an empty miss — retry on the next call.
    if (fixtures.length) this.cache = { at: Date.now(), fixtures };
    return this.withReplayKickoff(this.withStatus(fixtures));
  }
}
