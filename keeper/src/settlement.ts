// Settlement engine — the keeper's core loop. Permissionless by design:
// anyone can run this against the public program; the Merkle proof is the
// trust anchor, not this process.
//
// Per reconcile tick, for every bet:
//   Open + past void timelock          → void_bet
//   Open + past kickoff                → fetch latest proof; propose iff the
//                                        stat is from a final match phase
//   Pending + window lapsed            → finalize_settlement
//   Pending + still in window          → challenge iff a strictly-later proof
//                                        yields a DIFFERENT verdict

import * as anchorNs from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TxLineClient,
  TXLINE_CONFIG,
  buildValidateStatArgs,
  dailyScoresRootsPda,
  type TxLineNetwork,
} from "@propchain/txline";

const anchor = (anchorNs as any).default ?? anchorNs;

const FINAL_PERIODS = [100, 0]; // game_finalised / post-final (see program state.rs)

export class SettlementEngine {
  private program: any;
  private keeper: Keypair;
  private txline: TxLineClient;
  private oracleProgramId: PublicKey;
  // per-bet note of the last condition we logged, to avoid spamming
  private lastLog = new Map<string, string>();

  constructor(
    connection: Connection,
    keeper: Keypair,
    txline: TxLineClient,
    propchainIdl: any,
    network: TxLineNetwork = "devnet"
  ) {
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keeper), {
      commitment: "confirmed",
    });
    this.program = new anchor.Program(propchainIdl, provider);
    this.keeper = keeper;
    this.txline = txline;
    this.oracleProgramId = TXLINE_CONFIG[network].programId;
  }

  private note(bet: string, msg: string) {
    if (this.lastLog.get(bet) !== msg) {
      this.lastLog.set(bet, msg);
      console.log(`[settle] ${bet.slice(0, 8)}… ${msg}`);
    }
  }

  /** Decode-tolerant account listing (skips pre-migration layouts). */
  private async allBets() {
    const raw = await this.program.provider.connection.getProgramAccounts(this.program.programId);
    const out: { publicKey: PublicKey; account: any }[] = [];
    for (const { pubkey, account } of raw) {
      try {
        out.push({ publicKey: pubkey, account: this.program.coder.accounts.decode("betConfig", account.data) });
      } catch {
        /* UserPosition or stale layout — skip */
      }
    }
    return out;
  }

  async reconcile() {
    const bets = await this.allBets();
    const now = Math.floor(Date.now() / 1000);
    for (const { publicKey, account } of bets) {
      try {
        await this.processBet(publicKey, account, now);
      } catch (err) {
        this.note(publicKey.toBase58(), `error: ${(err as Error).message.slice(0, 160)}`);
      }
    }
  }

  private async processBet(address: PublicKey, bet: any, now: number) {
    const status = Object.keys(bet.status)[0];

    if (status === "open") {
      if (now >= bet.voidAfterTs.toNumber()) return this.voidBet(address);
      if (now >= bet.kickoffTs.toNumber()) return this.tryPropose(address, bet, null);
      return; // pre-kickoff
    }

    if (status === "settlementPending" && bet.pending) {
      if (now >= bet.pending.challengeDeadlineTs.toNumber()) return this.finalize(address);
      return this.tryPropose(address, bet, bet.pending);
    }
  }

  /** Fetch the freshest proof for the bet's stat(s); propose or challenge. */
  private async tryPropose(address: PublicKey, bet: any, pending: any) {
    const key = address.toBase58();
    const fixtureId = Number(bet.fixtureId);

    const snap = await this.txline.scoresSnapshot(fixtureId);
    const events = Array.isArray(snap) ? snap : [snap];
    if (!events.length || events[0]?.Seq == null) {
      return this.note(key, `no scores data for fixture ${fixtureId} yet`);
    }
    const latest = events.reduce((a: any, b: any) => ((b.Seq ?? -1) > (a.Seq ?? -1) ? b : a));

    const validation = await this.txline.statValidation(
      fixtureId,
      latest.Seq,
      bet.statKeyA,
      bet.statKeyB ?? undefined
    );

    if (!FINAL_PERIODS.includes(validation.statToProve.period)) {
      return this.note(key, `fixture ${fixtureId} not final yet (period ${validation.statToProve.period})`);
    }

    const proofTs = Number(validation.summary.updateStats.maxTimestamp);
    if (pending) {
      if (proofTs <= Number(pending.proofTs)) return; // nothing newer than the pending proof
      const verdict = this.evaluate(bet, validation);
      if (verdict === pending.result) return; // newer proof agrees — no challenge needed
      this.note(key, `CHALLENGING pending result=${pending.result} with later proof (verdict ${verdict})`);
    }

    const a = buildValidateStatArgs(validation);
    const rootsPda = dailyScoresRootsPda(Number(a.targetTs), this.oracleProgramId);
    const sig = await this.program.methods
      .proposeSettlement({
        ts: a.targetTs,
        fixtureSummary: a.fixtureSummary,
        fixtureProof: a.fixtureProof,
        mainTreeProof: a.mainTreeProof,
        statA: a.statA,
        statB: a.statB,
      })
      .accounts({
        proposer: this.keeper.publicKey,
        bet: address,
        dailyScoresMerkleRoots: rootsPda,
        txoracleProgram: this.oracleProgramId,
      })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .rpc();
    this.lastLog.delete(key);
    console.log(`[settle] ${key.slice(0, 8)}… PROPOSED settlement (fixture ${fixtureId}): ${sig}`);
  }

  /** Local predicate evaluation — mirrors the on-chain logic for challenge decisions. */
  private evaluate(bet: any, validation: any): boolean {
    const a = Number(validation.statToProve.value);
    const b = Number(validation.statToProve2?.value ?? 0);
    if (bet.kind && "bothScore" in bet.kind) return a > 0 && b > 0;
    const op = bet.op ? Object.keys(bet.op)[0] : null;
    const combined = op === "subtract" ? a - b : op === "add" ? a + b : a;
    const cmp = Object.keys(bet.comparison)[0];
    return cmp === "greater" ? combined > bet.threshold : combined < bet.threshold;
  }

  private async finalize(address: PublicKey) {
    const sig = await this.program.methods
      .finalizeSettlement()
      .accounts({ bet: address })
      .rpc();
    this.lastLog.delete(address.toBase58());
    console.log(`[settle] ${address.toBase58().slice(0, 8)}… FINALIZED: ${sig}`);
  }

  private async voidBet(address: PublicKey) {
    const sig = await this.program.methods.voidBet().accounts({ bet: address }).rpc();
    this.lastLog.delete(address.toBase58());
    console.log(`[settle] ${address.toBase58().slice(0, 8)}… VOIDED (timelock lapsed): ${sig}`);
  }
}
