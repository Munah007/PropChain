// The 12th Man agent: an autonomous loyalty bettor. Each user names their
// team(s); the agent then defends them — automatically taking the pro-team
// side of markets that go against them, from the user's own server-side
// wallet, within per-pool and per-day limits.
//
// This class is the STATEFUL shell: persistence, the 20s loop, and the thin
// executor that signs+sends. All the actual "should I bet, how much" logic
// lives in the pure planStakes() (agent.planner.ts) so it stays chain-free and
// unit-testable.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BetsService } from "../bets/bets.service";
import { StakeDto } from "../bets/bets.dto";
import { FixturesService } from "../fixtures/fixtures.service";
import { SessionService } from "../session/session.service";
import { TxsService } from "../solana/txs.service";
import { AgentConfig, DEFAULT_CONFIG } from "./agent.dto";
import { planStakes } from "./agent.planner";

const TICK_MS = Number(process.env.AGENT_TICK_MS ?? 20_000);
const ACTIVITY_LIMIT = 50; // keep the last N placements per user

export interface AgentActivity {
  ts: number; // ms epoch of the placement
  betAddress: string;
  fixtureId: string;
  side: "over" | "under";
  amount: number; // whole pUSDC
  team: string;
  reason: string;
  signature: string;
}

interface DailyCount {
  day: string; // "YYYY-MM-DD" UTC
  count: number;
}

interface PersistedState {
  entered: Record<string, string[]>; // userKey → bet addresses already staked
  daily: Record<string, DailyCount>;
  activity: Record<string, AgentActivity[]>;
}

// UTC calendar day — the maxBetsPerDay window rolls over at 00:00 UTC.
const utcDay = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AgentService.name);
  private readonly dataDir = process.env.DATA_DIR ?? process.cwd();
  private readonly configPath = join(this.dataDir, "agent-config.json");
  private readonly statePath = join(this.dataDir, "agent-state.json");

  private configs: Record<string, AgentConfig> = {};
  private entered = new Map<string, Set<string>>();
  private daily: Record<string, DailyCount> = {};
  private activity: Record<string, AgentActivity[]> = {};

  private timer: NodeJS.Timeout | null = null;
  private busy = false; // reentrancy guard: one tick (loop OR manual run) at a time

  constructor(
    private readonly bets: BetsService,
    private readonly fixtures: FixturesService,
    private readonly session: SessionService,
    private readonly txs: TxsService
  ) {
    this.load();
  }

  onModuleInit() {
    // Start the autonomous loop. void the promise — an errored tick must never
    // reject up into the interval and kill it.
    this.timer = setInterval(() => void this.tickAll(), TICK_MS);
    this.log.log(`12th Man loop started (every ${TICK_MS}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- public API (used by AgentController) ----------

  /** GET /agent payload for one caller — config (defaults if unset) + counters. */
  getStatus(userKey: string) {
    const config = this.configs[userKey] ?? DEFAULT_CONFIG;
    return {
      config,
      today: { count: this.todayCount(userKey), max: config.maxBetsPerDay },
      recent: this.recent(userKey),
    };
  }

  /** POST /agent — persist the validated config, return the GET shape. */
  setConfig(userKey: string, config: AgentConfig) {
    this.configs[userKey] = config;
    this.saveConfig();
    return this.getStatus(userKey);
  }

  /** POST /agent/run — force one immediate evaluation for the caller only. */
  async runOnce(userKey: string): Promise<{ placed: AgentActivity[] }> {
    const config = this.configs[userKey];
    if (!config?.enabled) return { placed: [] };
    // Serialize behind any active tick so a pool is never double-staked. The
    // busy check + set is synchronous (no await between them) so it's atomic.
    while (this.busy) await new Promise((r) => setTimeout(r, 25));
    this.busy = true;
    try {
      return { placed: await this.evaluate(userKey, config) };
    } catch (err: any) {
      // Usually a devnet RPC 429 — surface a clean, retryable message rather
      // than a bare 500 the UI shows as "Internal server error".
      const rateLimited = /429|Too Many Requests/i.test(err?.message ?? "");
      this.log.warn(`runOnce failed for ${userKey}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(
        rateLimited
          ? "The devnet RPC is busy right now — give it a moment and try again."
          : "Couldn't reach the chain right now — try again in a moment."
      );
    } finally {
      this.busy = false;
    }
  }

  // ---------- the loop ----------

  private async tickAll() {
    if (this.busy) return; // previous tick still running — skip this beat
    this.busy = true;
    try {
      for (const [userKey, config] of Object.entries(this.configs)) {
        if (!config.enabled) continue;
        try {
          await this.evaluate(userKey, config);
        } catch (err: any) {
          // One user's failure must never abort the loop for everyone else.
          this.log.warn(`agent tick failed for ${userKey}: ${err?.message ?? err}`);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Evaluate + execute one user's stakes. Fetches the world once, delegates the
   * decision to the pure planner, then signs+sends each planned stake — logging
   * and continuing past any single per-pool failure.
   */
  private async evaluate(userKey: string, config: AgentConfig): Promise<AgentActivity[]> {
    const wallet = this.session.getWallet(userKey);
    if (!wallet) return []; // configured but session gone — nothing to sign with

    const [bets, fixtures] = await Promise.all([this.bets.list(), this.fixtures.list()]);
    const positions = await this.txs.listPositions(new PublicKey(wallet.address));
    const entered = this.enteredSet(userKey);
    const nowSec = Math.floor(Date.now() / 1000);

    const plan = planStakes(config, bets, fixtures, positions, entered, this.todayCount(userKey), nowSec);

    const placed: AgentActivity[] = [];
    for (const p of plan) {
      if (this.todayCount(userKey) >= config.maxBetsPerDay) break; // cap may fill mid-plan
      try {
        const { signature } = await this.bets.stake(
          new PublicKey(p.betAddress),
          userKey,
          StakeDto.from({ side: p.side, amount: p.amount })
        );
        // Record entry + count BEFORE logging so a later crash can't re-enter
        // the same pool. A failed stake (below) leaves it un-entered for retry.
        entered.add(p.betAddress);
        this.bumpDaily(userKey);
        const activity: AgentActivity = {
          ts: Date.now(),
          betAddress: p.betAddress,
          fixtureId: p.fixtureId,
          side: p.side,
          amount: p.amount,
          team: p.team,
          reason: p.reason,
          signature,
        };
        this.pushActivity(userKey, activity);
        placed.push(activity);
        this.log.log(`12th Man staked ${p.amount} pUSDC ${p.side} for ${userKey} (${p.team}) on ${p.betAddress}`);
      } catch (err: any) {
        this.log.warn(`stake failed for ${userKey} on ${p.betAddress}: ${err?.message ?? err}`);
      }
    }
    if (placed.length) this.saveState();
    return placed;
  }

  // ---------- runtime state helpers ----------

  private enteredSet(userKey: string): Set<string> {
    let set = this.entered.get(userKey);
    if (!set) this.entered.set(userKey, (set = new Set()));
    return set;
  }

  private todayCount(userKey: string): number {
    const d = this.daily[userKey];
    return d && d.day === utcDay() ? d.count : 0; // stale day = 0 (rolled over)
  }

  private bumpDaily(userKey: string) {
    const today = utcDay();
    const d = this.daily[userKey];
    this.daily[userKey] = d && d.day === today ? { day: today, count: d.count + 1 } : { day: today, count: 1 };
  }

  private pushActivity(userKey: string, activity: AgentActivity) {
    const log = this.activity[userKey] ?? (this.activity[userKey] = []);
    log.push(activity);
    if (log.length > ACTIVITY_LIMIT) log.splice(0, log.length - ACTIVITY_LIMIT);
  }

  private recent(userKey: string): AgentActivity[] {
    return [...(this.activity[userKey] ?? [])].reverse(); // newest first for the UI
  }

  // ---------- persistence (JSON under DATA_DIR, mirrors session/fixtures) ----------

  private load() {
    try {
      if (existsSync(this.configPath)) {
        this.configs = JSON.parse(readFileSync(this.configPath, "utf8"));
      }
    } catch (err) {
      this.log.warn(`agent-config unreadable (${err}) — starting empty`);
    }
    try {
      if (existsSync(this.statePath)) {
        const state: PersistedState = JSON.parse(readFileSync(this.statePath, "utf8"));
        for (const [k, v] of Object.entries(state.entered ?? {})) this.entered.set(k, new Set(v));
        this.daily = state.daily ?? {};
        this.activity = state.activity ?? {};
      }
    } catch (err) {
      this.log.warn(`agent-state unreadable (${err}) — starting empty`);
    }
  }

  private saveConfig() {
    this.writeJson(this.configPath, this.configs);
  }

  private saveState() {
    const entered: Record<string, string[]> = {};
    for (const [k, set] of this.entered) entered[k] = [...set];
    const state: PersistedState = { entered, daily: this.daily, activity: this.activity };
    this.writeJson(this.statePath, state);
  }

  private writeJson(path: string, value: unknown) {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(path, JSON.stringify(value, null, 2));
    } catch (err) {
      this.log.warn(`could not persist ${path}: ${err}`);
    }
  }
}
