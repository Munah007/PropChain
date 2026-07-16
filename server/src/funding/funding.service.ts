// Auto-funding on wallet creation: drips devnet SOL for fees and mints pUSDC
// (mock USDC) to bet with. Serialized through a queue to avoid blockhash
// races on signup bursts.
//
// Abuse caps (persisted in funder-state.json so restarts don't reset them):
//  * a userKey is funded at most ONCE ever;
//  * at most MAX_FUNDINGS_PER_WINDOW fundings per rolling 24h, globally.
// Hitting a cap skips funding (logged) rather than failing the session —
// the wallet still works, it just isn't topped up.

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "../solana/solana.constants";

const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL;
const PUSDC_DRIP = 100n * 10n ** 6n; // 100 pUSDC (6 decimals)
const MAX_FUNDINGS_PER_WINDOW = 50;
const FUNDING_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24h

// Bounded self-serve top-up for testers who bet their initial drip to zero.
// Deliberately narrow so it can't be farmed or drain the funder:
//  * only when the on-chain pUSDC balance is genuinely low (read here, not
//    trusted from the client);
//  * once per userKey per rolling 24h;
//  * counted against the SAME global MAX_FUNDINGS_PER_WINDOW budget as the
//    initial drip, so top-ups and signups share one ceiling.
const TOP_UP_AMOUNT = PUSDC_DRIP; // 100 pUSDC, same as the initial drip
const TOP_UP_THRESHOLD = 30n * 10n ** 6n; // eligible only under 30 pUSDC
const TOP_UP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // once per user per 24h

/** Outcome of a top-up attempt — the UI maps `reason` to a message. */
export type TopUpResult =
  | { funded: true; amount: number }
  | { funded: false; reason: "not_low" | "cooldown" | "global_cap"; retryAfterMs?: number };

type TopUpDecision =
  | { fund: true }
  | { fund: false; reason: "not_low" | "cooldown" | "global_cap"; retryAfterMs?: number };

/**
 * Pure gate decision for a top-up — no I/O, so the abuse rules can be pinned in
 * a unit test without a live chain. Precedence is deliberate: a flush wallet is
 * always told it doesn't need one (never funded), THEN the per-user cooldown,
 * THEN the shared global budget. `activeFundings` must already be trimmed to
 * the rolling window by the caller.
 */
export function decideTopUp(p: {
  now: number;
  lastTopUp: number;
  balance: bigint;
  activeFundings: number;
}): TopUpDecision {
  if (p.balance >= TOP_UP_THRESHOLD) return { fund: false, reason: "not_low" };
  const sinceLast = p.now - p.lastTopUp;
  if (sinceLast < TOP_UP_COOLDOWN_MS) {
    return { fund: false, reason: "cooldown", retryAfterMs: TOP_UP_COOLDOWN_MS - sinceLast };
  }
  if (p.activeFundings >= MAX_FUNDINGS_PER_WINDOW) return { fund: false, reason: "global_cap" };
  return { fund: true };
}

interface FunderState {
  pusdcMint?: string;
  fundedUsers: string[];
  fundingTimes: number[]; // unix ms of each funding, trimmed to the window
  topUpTimes: Record<string, number>; // userKey -> unix ms of last top-up
}

@Injectable()
export class FundingService {
  private readonly logger = new Logger(FundingService.name);
  private funder: Keypair;
  private statePath = join(process.env.DATA_DIR ?? process.cwd(), "funder-state.json");
  private state: FunderState;
  private mint: PublicKey | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(SOLANA_CONNECTION) private readonly connection: Connection) {
    this.state = this.loadState();
    // Cloud deploys (Railway etc.): secret content via env, state on a volume.
    if (process.env.FUNDER_SECRET) {
      this.funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.FUNDER_SECRET)));
      return;
    }
    const keypairPath = process.env.FUNDER_KEYPAIR ?? join(process.cwd(), "funder-keypair.json");
    if (existsSync(keypairPath)) {
      this.funder = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")))
      );
    } else {
      this.funder = Keypair.generate();
      writeFileSync(keypairPath, JSON.stringify(Array.from(this.funder.secretKey)));
      console.log(
        `[funding] generated funder keypair ${this.funder.publicKey.toBase58()} — fund it with devnet SOL`
      );
    }
  }

  /** Load persisted state, tolerating the pre-caps `{ pusdcMint }` shape. */
  private loadState(): FunderState {
    const state: FunderState = existsSync(this.statePath)
      ? JSON.parse(readFileSync(this.statePath, "utf8"))
      : {};
    state.fundedUsers ??= [];
    state.fundingTimes ??= [];
    state.topUpTimes ??= {};
    return state;
  }

  private saveState() {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  async ensureMint(): Promise<PublicKey> {
    if (this.mint) return this.mint;
    if (process.env.PUSDC_MINT) {
      this.mint = new PublicKey(process.env.PUSDC_MINT);
      return this.mint;
    }
    if (this.state.pusdcMint) {
      this.mint = new PublicKey(this.state.pusdcMint);
      return this.mint;
    }
    this.mint = await createMint(this.connection, this.funder, this.funder.publicKey, null, 6);
    this.state.pusdcMint = this.mint.toBase58();
    this.saveState();
    console.log(`[funding] created pUSDC mint ${this.mint.toBase58()}`);
    return this.mint;
  }

  fund(address: string, userKey: string): Promise<void> {
    const task = this.queue.then(async () => {
      // Cap 1: once per userKey, ever.
      if (this.state.fundedUsers.includes(userKey)) {
        this.logger.warn(`skipping funding — already funded once: ${userKey}`);
        return;
      }
      // Cap 2: global rolling-24h budget (trim old entries as we go).
      const now = Date.now();
      this.state.fundingTimes = this.state.fundingTimes.filter((t) => now - t < FUNDING_WINDOW_MS);
      if (this.state.fundingTimes.length >= MAX_FUNDINGS_PER_WINDOW) {
        this.logger.warn(
          `skipping funding — global cap of ${MAX_FUNDINGS_PER_WINDOW}/24h reached (${userKey})`
        );
        return;
      }
      const recipient = new PublicKey(address);
      const mint = await this.ensureMint();
      const solTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.funder.publicKey,
          toPubkey: recipient,
          lamports: SOL_DRIP,
        })
      );
      await sendAndConfirmTransaction(this.connection, solTx, [this.funder]);
      const ata = await getOrCreateAssociatedTokenAccount(this.connection, this.funder, mint, recipient);
      await mintTo(this.connection, this.funder, mint, ata.address, this.funder, PUSDC_DRIP);
      // Record only after success so a failed drip can be retried.
      this.state.fundedUsers.push(userKey);
      this.state.fundingTimes.push(now);
      this.saveState();
    });
    this.queue = task.catch(() => {});
    return task as Promise<void>;
  }

  /**
   * Bounded self-serve top-up. Serialized through the same queue as fund() so
   * concurrent requests can't race the blockhash or double-spend the budget.
   * All three gates are enforced here — the caller (and client) is never
   * trusted for balance, cooldown, or budget.
   */
  topUp(address: string, userKey: string): Promise<TopUpResult> {
    const task = this.queue.then(async (): Promise<TopUpResult> => {
      const now = Date.now();
      const recipient = new PublicKey(address);
      const mint = await this.ensureMint();
      // Read the authoritative on-chain balance so a flush wallet can't farm
      // this. Missing ATA => 0 => eligible.
      let balance = 0n;
      try {
        const ata = getAssociatedTokenAddressSync(mint, recipient);
        balance = (await getAccount(this.connection, ata)).amount;
      } catch {
        /* no ATA yet — treat as zero balance */
      }
      // Trim the shared budget to the window before deciding, so the count the
      // gate sees is current.
      this.state.fundingTimes = this.state.fundingTimes.filter((t) => now - t < FUNDING_WINDOW_MS);
      const decision = decideTopUp({
        now,
        lastTopUp: this.state.topUpTimes[userKey] ?? 0,
        balance,
        activeFundings: this.state.fundingTimes.length,
      });
      if (!decision.fund) {
        if (decision.reason === "global_cap") {
          this.logger.warn(`skipping top-up — global cap of ${MAX_FUNDINGS_PER_WINDOW}/24h reached (${userKey})`);
        }
        return { funded: false, reason: decision.reason, retryAfterMs: decision.retryAfterMs };
      }
      const ata = await getOrCreateAssociatedTokenAccount(this.connection, this.funder, mint, recipient);
      await mintTo(this.connection, this.funder, mint, ata.address, this.funder, TOP_UP_AMOUNT);
      // Record only after success so a failed mint can be retried.
      this.state.topUpTimes[userKey] = now;
      this.state.fundingTimes.push(now);
      this.saveState();
      return { funded: true, amount: Number(TOP_UP_AMOUNT) / 1_000_000 };
    });
    this.queue = task.catch(() => {});
    return task as Promise<TopUpResult>;
  }
}
