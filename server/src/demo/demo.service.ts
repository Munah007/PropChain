// Replay demo: lets a reviewer watch a full provable settlement after the
// tournament — a real bet on a real (finished) fixture, time-shifted so the
// keeper settles it with a real Merkle proof minutes after launch.
//
// How it works: the bet's fixture_id points at a genuinely finished World Cup
// match (its proofs exist in TxLINE, its daily root is on devnet), but its
// kickoff_ts is now+2min. The autonomous keeper — untouched — sees an open
// bet past kickoff on a finalized fixture and proposes settlement with the
// real proof: a genuine CPI-verified settlement, only time-shifted. While
// that plays out, the recorded score feed for the fixture is replayed through
// a FixturesService overlay so the board looks live.
//
// Concurrency contract: at most ONE demo runs at a time. Launching while one
// is active (or in flight) returns the existing demo with 200 — idempotent,
// so several judges pressing the button share one run. New launches are
// additionally capped at 5 per rolling hour (in-memory), since each one
// creates a real on-chain bet.

import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BetsService } from "../bets/bets.service";
import { CreateBetDto, StakeDto } from "../bets/bets.dto";
import { SessionService } from "../session/session.service";
import { Fixture, FixturesService } from "../fixtures/fixtures.service";
import { isMatchEnded } from "../fixtures/phases";
import { RecordedFrame, remapReplayTimeline } from "./replay";

const DEMO_USER = "demo@propchain.app"; // opens the bet, stakes over
const DEMO_COUNTER_USER = "demo-counter@propchain.app"; // stakes under
const STAKE_PUSDC = 10;
const KICKOFF_DELAY_S = 120; // shifted kickoff: soon enough to hold attention
const OVERLAY_GRACE_S = 600; // final score + shifted kickoff linger while the keeper settles
const MAX_LAUNCHES_PER_HOUR = 5;
// TxLINE soccer stat keys: 7 = home corners, 8 = away corners. Summed with a
// "greater than 9" line this is the classic total-corners over/under 9.5 —
// a stat every finished fixture provably produced.
const STAT_CORNERS_HOME = 7;
const STAT_CORNERS_AWAY = 8;
const CORNERS_LINE = 9;

export interface DemoState {
  fixtureId: number;
  home: string;
  away: string;
  bet: string; // bet PDA (base58)
  kickoffTs: number; // shifted kickoff (unix seconds)
  replayEndsTs: number; // unix seconds — score replay reaches full time here
}

interface RecordingEntry {
  fixtureId: number;
  finished: boolean; // saw StatusId 5 (F) or 100 (game_finalised)
  frames: RecordedFrame[];
}

@Injectable()
export class DemoService {
  private readonly log = new Logger(DemoService.name);
  // Recordings are written by the keeper next to the repo's server/ dir.
  private recordingsDir = process.env.RECORDINGS_DIR ?? join(process.cwd(), "..", "recordings");
  private recordings: Map<number, RecordingEntry> | null = null; // lazy index
  private active: DemoState | null = null;
  private inFlight: Promise<DemoState> | null = null;
  private launchTimes: number[] = []; // ms epochs, trimmed to the rolling hour

  constructor(
    private readonly session: SessionService,
    private readonly bets: BetsService,
    private readonly fixtures: FixturesService
  ) {}

  async launch(): Promise<DemoState> {
    // Idempotent while a demo is active or mid-launch — see header contract.
    const existing = this.activeState();
    if (existing) return existing;
    if (this.inFlight) return this.inFlight;

    const now = Date.now();
    this.launchTimes = this.launchTimes.filter((t) => now - t < 3_600_000);
    if (this.launchTimes.length >= MAX_LAUNCHES_PER_HOUR) {
      throw new HttpException(
        `demo launch limit reached (${MAX_LAUNCHES_PER_HOUR}/hour) — try again later`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    // Count the attempt even if it fails — the cap guards on-chain spend and
    // funder drain, both of which happen before a launch can fail.
    this.launchTimes.push(now);

    this.inFlight = this.doLaunch().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  status(): { active: boolean } & Partial<DemoState> {
    const state = this.activeState();
    return state ? { active: true, ...state } : { active: false };
  }

  /** The current demo until its overlay expires (replay end + grace). */
  private activeState(): DemoState | null {
    if (this.active && Date.now() / 1000 >= this.active.replayEndsTs + OVERLAY_GRACE_S) {
      this.active = null;
    }
    return this.active;
  }

  private async doLaunch(): Promise<DemoState> {
    try {
      const { fixture, frames } = await this.pickDemoFixture();
      const kickoffTs = Math.floor(Date.now() / 1000) + KICKOFF_DELAY_S;
      const replayMinutes = Number(process.env.REPLAY_MINUTES ?? 3);
      const replayEndsTs = kickoffTs + Math.round(replayMinutes * 60);

      // Both demo wallets must exist before any tx; the first launch ever
      // creates and auto-funds them through the normal session path.
      await this.session.getSession(DEMO_USER, "PropChain Demo");
      await this.session.getSession(DEMO_COUNTER_USER, "PropChain Demo (counter)");

      const { bet } = await this.bets.create(
        DEMO_USER,
        CreateBetDto.from({
          fixtureId: fixture.fixtureId,
          statKeyA: STAT_CORNERS_HOME,
          statKeyB: STAT_CORNERS_AWAY,
          op: "add",
          kind: "line",
          comparison: "greater",
          threshold: CORNERS_LINE,
          kickoffTs,
          opening: { side: "over", amount: STAKE_PUSDC },
        })
      );
      await this.bets.stake(
        new PublicKey(bet),
        DEMO_COUNTER_USER,
        StakeDto.from({ side: "under", amount: STAKE_PUSDC })
      );

      // Overlay only once the bet exists — a failed launch must leave the
      // board untouched.
      const mapped = remapReplayTimeline(frames, kickoffTs * 1000, (replayEndsTs - kickoffTs) * 1000);
      this.fixtures.setReplay(fixture.fixtureId, mapped, kickoffTs, (replayEndsTs + OVERLAY_GRACE_S) * 1000);

      this.active = {
        fixtureId: fixture.fixtureId,
        home: fixture.home,
        away: fixture.away,
        bet,
        kickoffTs,
        replayEndsTs,
      };
      this.log.log(
        `demo launched: ${fixture.home} vs ${fixture.away} (fixture ${fixture.fixtureId}), ` +
          `bet ${bet}, kickoff in ${KICKOFF_DELAY_S}s, replay ${replayMinutes}min (${mapped.length} frames)`
      );
      return this.active;
    } catch (err: any) {
      if (err instanceof HttpException) throw err; // already a clean client-facing error
      this.log.error(`demo launch failed: ${err?.stack ?? err}`);
      throw new InternalServerErrorException(`demo launch failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Best demo fixture: the most recently kicked-off FINISHED fixture with a
   * recorded score timeline (replay actually ticks). Fallback: any past
   * fixture with an archived final score — the replay then just shows the
   * final scoreline, which still demos a full settlement.
   */
  private async pickDemoFixture(): Promise<{ fixture: Fixture; frames: RecordedFrame[] }> {
    const fixtures = await this.fixtures.list();
    const byId = new Map(fixtures.map((f) => [f.fixtureId, f]));

    const recorded = [...this.loadRecordings().values()]
      .filter((r) => r.finished && r.frames.length > 0 && byId.has(r.fixtureId))
      .sort((a, b) => byId.get(b.fixtureId)!.kickoffTs - byId.get(a.fixtureId)!.kickoffTs);
    if (recorded.length) {
      const pick = recorded[0];
      return { fixture: byId.get(pick.fixtureId)!, frames: pick.frames };
    }

    const nowS = Math.floor(Date.now() / 1000);
    const past = fixtures.filter((f) => f.kickoffTs < nowS).sort((a, b) => b.kickoffTs - a.kickoffTs);
    for (const fixture of past) {
      const last = this.fixtures.lastKnownScore(fixture.fixtureId);
      if (!last) continue;
      return {
        fixture,
        frames: [
          {
            tsMs: last.asOf,
            seq: last.seq,
            home: last.home,
            away: last.away,
            minute: null,
            statusId: last.statusId ?? null,
            gameState: last.gameState,
          },
        ],
      };
    }
    throw new InternalServerErrorException("no finished fixture with score data available for a demo");
  }

  /**
   * Index the keeper's recorded score feeds (recordings/scores-*.jsonl) into
   * per-fixture frame timelines, once, on first use. Each JSONL line is
   * { recordedAt, event, data } where data is a raw TxLINE score event; goals
   * ride on Score.ParticipantN.Total.Goals of SOME events, so they are folded
   * cumulatively in Seq order — mirroring how FixturesService reads the live
   * snapshot.
   */
  private loadRecordings(): Map<number, RecordingEntry> {
    if (this.recordings) return this.recordings;
    const eventsByFixture = new Map<number, any[]>();
    try {
      const files = readdirSync(this.recordingsDir).filter((f) => f.endsWith(".jsonl")).sort();
      for (const file of files) {
        for (const line of readFileSync(join(this.recordingsDir, file), "utf8").split("\n")) {
          if (!line) continue;
          let data: any;
          try {
            data = JSON.parse(line)?.data;
          } catch {
            continue; // torn write — skip the line, keep the recording
          }
          if (!data?.FixtureId) continue; // heartbeats carry no fixture
          let events = eventsByFixture.get(data.FixtureId);
          if (!events) eventsByFixture.set(data.FixtureId, (events = []));
          events.push(data);
        }
      }
    } catch (err) {
      this.log.warn(`recordings unreadable at ${this.recordingsDir} (${err}) — falling back to archive`);
    }

    this.recordings = new Map();
    for (const [fixtureId, events] of eventsByFixture) {
      events.sort((a, b) => (a.Seq ?? -1) - (b.Seq ?? -1));
      const frames: RecordedFrame[] = [];
      let home = 0;
      let away = 0;
      let statusId: number | null = null;
      let finished = false;
      let lastTs = 0;
      for (const e of events) {
        const goalsHome = e?.Score?.Participant1?.Total?.Goals;
        const goalsAway = e?.Score?.Participant2?.Total?.Goals;
        if (typeof goalsHome === "number") home = goalsHome;
        if (typeof goalsAway === "number") away = goalsAway;
        // Phase folds forward like goals — plenty of events omit StatusId, and
        // a frame that read it straight off the event would drop the replayed
        // match back to "live" every time one arrived.
        if (typeof e.StatusId === "number") statusId = e.StatusId;
        // F / FET / FPE / game_finalised / post-final — a match that went to
        // extra time or pens ends on 10 or 13 and never reports 5.
        if (isMatchEnded(statusId)) finished = true;
        // Clamp timestamps to non-decreasing so the remapped timeline stays
        // monotonic even across feed reconnects with slight clock skew.
        lastTs = Math.max(lastTs, e.Ts ?? 0);
        if (!lastTs) continue; // no usable timestamp yet
        frames.push({
          tsMs: lastTs,
          seq: e.Seq ?? -1,
          home,
          away,
          minute:
            e?.Clock?.Running && typeof e.Clock.Seconds === "number"
              ? Math.floor(e.Clock.Seconds / 60)
              : null,
          statusId,
          gameState: e.GameState ?? null,
        });
      }
      this.recordings.set(fixtureId, { fixtureId, finished, frames });
    }
    this.log.log(`indexed ${this.recordings.size} recorded fixtures from ${this.recordingsDir}`);
    return this.recordings;
  }
}
