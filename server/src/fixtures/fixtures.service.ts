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

@Injectable()
export class FixturesService {
  private apiOrigin =
    process.env.TXLINE_NETWORK === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com";
  private credsPath =
    process.env.TXLINE_CREDS ?? join(process.cwd(), "..", "keeper", "txline-creds.json");
  private cache: { at: number; fixtures: Fixture[] } | null = null;

  async list(): Promise<Fixture[]> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.fixtures;
    let creds: { jwt: string; apiToken: string };
    if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
      creds = { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
    } else {
      if (!existsSync(this.credsPath)) {
        throw new Error(`TxLINE credentials not found at ${this.credsPath} — run the keeper once first`);
      }
      creds = JSON.parse(readFileSync(this.credsPath, "utf8"));
    }
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
