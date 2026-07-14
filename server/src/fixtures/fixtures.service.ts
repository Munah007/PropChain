// TxLINE fixtures proxy. The browser never talks to TxLINE — this reuses the
// keeper's activated credentials (txline-creds.json) for read-only fixture
// lookups, cached for 60s.

import { Injectable } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WORLD_CUP_COMPETITION_ID = 72;

export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number; // unix seconds
  competition: string;
}

export interface LiveScore {
  fixtureId: number;
  hasScore: boolean;
  home: number; // home (Participant1) goals
  away: number; // away (Participant2) goals
  minute: number | null; // clock minute when the match clock is running
  gameState: string | null; // raw TxLINE game state (unreliable on the dev replay feed)
  asOf: number; // ms epoch of the latest score event
  seq: number; // TxLINE sequence — advances as the feed replays
}

@Injectable()
export class FixturesService {
  private apiOrigin =
    process.env.TXLINE_NETWORK === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com";
  private credsPath =
    process.env.TXLINE_CREDS ?? join(process.cwd(), "..", "keeper", "txline-creds.json");
  private cache: { at: number; fixtures: Fixture[] } | null = null;
  private scoreCache = new Map<number, { at: number; score: LiveScore }>();

  private creds(): { jwt: string; apiToken: string } {
    if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
      return { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
    }
    if (!existsSync(this.credsPath)) {
      throw new Error(`TxLINE credentials not found at ${this.credsPath} — run the keeper once first`);
    }
    return JSON.parse(readFileSync(this.credsPath, "utf8"));
  }

  /**
   * Live score for one fixture, cached 10s so the board can poll without
   * hammering TxLINE. Goals are read from the latest-by-Seq event that carries
   * them per side, so a partial amend event never blanks the score. Never
   * throws to the caller — a feed hiccup returns hasScore:false, not a 500,
   * so a live demo degrades gracefully instead of breaking.
   */
  async score(fixtureId: number): Promise<LiveScore> {
    const cached = this.scoreCache.get(fixtureId);
    if (cached && Date.now() - cached.at < 10_000) return cached.score;

    const empty: LiveScore = {
      fixtureId, hasScore: false, home: 0, away: 0, minute: null, gameState: null, asOf: 0, seq: -1,
    };
    try {
      const creds = this.creds();
      const res = await fetch(
        `${this.apiOrigin}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`,
        { headers: { Authorization: `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken } }
      );
      if (!res.ok) return empty;
      const raw = await res.json();
      const events: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!events.length) return empty;

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
      const score: LiveScore = {
        fixtureId,
        hasScore: true,
        home: goalsOf("Participant1"),
        away: goalsOf("Participant2"),
        minute: typeof clockSeconds === "number" ? Math.floor(clockSeconds / 60) : null,
        gameState: latest?.GameState ?? null,
        asOf: latest?.Ts ?? Date.now(),
        seq: latest?.Seq ?? -1,
      };
      this.scoreCache.set(fixtureId, { at: Date.now(), score });
      return score;
    } catch {
      return empty;
    }
  }

  async list(): Promise<Fixture[]> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.fixtures;
    const creds = this.creds();
    const startEpochDay = Math.floor(Date.now() / 86_400_000) - 3;
    const res = await fetch(
      `${this.apiOrigin}/api/fixtures/snapshot?startEpochDay=${startEpochDay}`,
      { headers: { Authorization: `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken } }
    );
    if (!res.ok) throw new Error(`TxLINE fixtures fetch failed: ${res.status}`);
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const fixtures = list
      .filter((f: any) => f.CompetitionId === WORLD_CUP_COMPETITION_ID && f.FixtureId)
      .map((f: any) => ({
        fixtureId: f.FixtureId,
        home: f.Participant1,
        away: f.Participant2,
        kickoffTs: Math.floor(f.StartTime / 1000),
        competition: f.Competition,
      }))
      .sort((a: Fixture, b: Fixture) => a.kickoffTs - b.kickoffTs);
    this.cache = { at: Date.now(), fixtures };
    return fixtures;
  }
}
