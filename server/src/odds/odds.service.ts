// TxLINE odds proxy: consensus (StablePrice demargined) probabilities per
// fixture, normalized onto the market shapes PropChain can express, so cards
// can show "TxLINE consensus says X%" next to the pool-implied number.
//
// Only markets the feed actually prices are exposed (full-time 1X2 and
// over/under total goals on the devnet World Cup feed — no corners/cards/BTTS
// consensus exists there, and we don't invent numbers we can't source).

import { Injectable, Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface FixtureOdds {
  fixtureId: number;
  available: boolean;
  asOf: number; // ms epoch of the freshest row used
  /** Full-time 1X2 probabilities (0..1), demargined. */
  result: { home: number; draw: number; away: number } | null;
  /** Full-time over/under total-goals lines, probabilities (0..1). */
  totals: { line: number; over: number; under: number }[];
}

const STABLE_BOOK = "TXLineStablePriceDemargined";

@Injectable()
export class OddsService {
  private readonly log = new Logger(OddsService.name);
  private apiOrigin =
    process.env.TXLINE_NETWORK === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com";
  private credsPath =
    process.env.TXLINE_CREDS ?? join(process.cwd(), "..", "keeper", "txline-creds.json");
  private cache = new Map<number, { at: number; odds: FixtureOdds }>();

  private creds(): { jwt: string; apiToken: string } {
    if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
      return { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN };
    }
    if (!existsSync(this.credsPath)) {
      throw new Error(`TxLINE credentials not found at ${this.credsPath}`);
    }
    return JSON.parse(readFileSync(this.credsPath, "utf8"));
  }

  /**
   * Consensus odds for one fixture, cached 60s. Never throws: when the feed
   * has nothing (post-tournament, unknown fixture, feed down) the response is
   * {available:false} and the UI simply omits the consensus line. The last
   * good read is served stale as a fallback — odds context beats no context.
   */
  async fixture(fixtureId: number): Promise<FixtureOdds> {
    const cached = this.cache.get(fixtureId);
    if (cached && Date.now() - cached.at < 60_000) return cached.odds;

    const none: FixtureOdds = { fixtureId, available: false, asOf: 0, result: null, totals: [] };
    try {
      const creds = this.creds();
      const res = await fetch(
        `${this.apiOrigin}/api/odds/snapshot/${fixtureId}?asOf=${Date.now()}`,
        { headers: { Authorization: `Bearer ${creds.jwt}`, "X-Api-Token": creds.apiToken } }
      );
      if (!res.ok) return cached?.odds ?? none;
      const rows: any[] = await res.json();
      if (!Array.isArray(rows) || !rows.length) return cached?.odds ?? none;

      // Full-game consensus rows only; MarketPeriod is null/absent for full time.
      const stable = rows.filter(
        (r) => r.Bookmaker === STABLE_BOOK && (!r.MarketPeriod || r.MarketPeriod === "full")
      );

      const pctOf = (row: any, name: string): number | null => {
        const i = row.PriceNames?.indexOf(name);
        if (i == null || i < 0) return null;
        const pct = Number(row.Pct?.[i]);
        return Number.isFinite(pct) ? pct / 100 : null;
      };

      let result: FixtureOdds["result"] = null;
      const totals: FixtureOdds["totals"] = [];
      let asOf = 0;
      for (const row of stable) {
        asOf = Math.max(asOf, row.Ts ?? 0);
        if (row.SuperOddsType === "1X2_PARTICIPANT_RESULT") {
          const home = pctOf(row, "part1");
          const draw = pctOf(row, "draw");
          const away = pctOf(row, "part2");
          if (home != null && draw != null && away != null) result = { home, draw, away };
        } else if (row.SuperOddsType === "OVERUNDER_PARTICIPANT_GOALS") {
          const line = Number(String(row.MarketParameters ?? "").match(/line=([\d.]+)/)?.[1]);
          const over = pctOf(row, "over");
          const under = pctOf(row, "under");
          if (Number.isFinite(line) && over != null && under != null) {
            totals.push({ line, over, under });
          }
        }
      }
      totals.sort((a, b) => a.line - b.line);

      const odds: FixtureOdds = {
        fixtureId,
        available: result !== null || totals.length > 0,
        asOf,
        result,
        totals,
      };
      this.cache.set(fixtureId, { at: Date.now(), odds });
      return odds;
    } catch (err) {
      this.log.warn(`odds fetch failed for ${fixtureId}: ${err}`);
      return cached?.odds ?? none;
    }
  }
}
