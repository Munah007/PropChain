// Builds every propchain program transaction server-side (fee payer = the
// user's server-managed wallet); WalletsService signs and broadcasts.

import { Inject, Injectable } from "@nestjs/common";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "./solana.constants";
import { FundingService } from "../funding/funding.service";

const { BN } = anchor;

export interface CreateBetRequest {
  fixtureId: number;
  statKeyA: number;
  statKeyB?: number | null;
  comparison: "greater" | "less";
  threshold: number;
  kickoffTs: number; // unix seconds
}

@Injectable()
export class TxsService {
  private program: anchor.Program | null = null;
  private usdcMint: PublicKey | null = null;

  constructor(
    @Inject(SOLANA_CONNECTION) private readonly connection: Connection,
    private readonly funding: FundingService
  ) {}

  private async getProgram(): Promise<{ program: anchor.Program; usdcMint: PublicKey }> {
    if (!this.program || !this.usdcMint) {
      this.usdcMint = await this.funding.ensureMint();
      const idlPath = process.env.PROPCHAIN_IDL ?? join(process.cwd(), "..", "target", "idl", "propchain.json");
      const idl = JSON.parse(readFileSync(idlPath, "utf8"));
      const provider = new anchor.AnchorProvider(
        this.connection,
        {
          publicKey: PublicKey.default,
          signTransaction: async (t: any) => t,
          signAllTransactions: async (t: any) => t,
        } as any,
        { commitment: "confirmed" }
      );
      this.program = new anchor.Program(idl, provider);
    }
    return { program: this.program, usdcMint: this.usdcMint };
  }

  private betPdas(programId: PublicKey, creator: PublicKey, nonce: anchor.BN) {
    const [bet] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), creator.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      programId
    );
    const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), bet.toBuffer()], programId);
    return { bet, pool };
  }

  private positionPda(programId: PublicKey, bet: PublicKey, user: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), bet.toBuffer(), user.toBuffer()],
      programId
    )[0];
  }

  private async toBase64(tx: Transaction, feePayer: PublicKey): Promise<string> {
    tx.feePayer = feePayer;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash("confirmed")).blockhash;
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  }

  async buildCreateBet(
    creator: PublicKey,
    req: CreateBetRequest,
    opening?: { side: "over" | "under"; amount: number }
  ): Promise<{ txBase64: string; bet: PublicKey; nonce: number }> {
    const { program, usdcMint } = await this.getProgram();
    const nonce = Date.now(); // unique per creator; u64 on-chain
    const n = new BN(nonce);
    const { bet, pool } = this.betPdas(program.programId, creator, n);

    const tx = new Transaction();
    tx.add(
      await (program.methods as any)
        .createBet({
          nonce: n,
          fixtureId: new BN(req.fixtureId),
          statKeyA: req.statKeyA,
          statKeyB: req.statKeyB ?? null,
          comparison: req.comparison === "less" ? { less: {} } : { greater: {} },
          threshold: req.threshold,
          kickoffTs: new BN(req.kickoffTs),
        })
        .accounts({
          creator,
          bet,
          usdcMint,
          pool,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    if (opening) {
      tx.add(await this.stakeIx(program, usdcMint, creator, bet, pool, opening.side, opening.amount));
    }
    return { txBase64: await this.toBase64(tx, creator), bet, nonce };
  }

  private async stakeIx(
    program: anchor.Program,
    usdcMint: PublicKey,
    user: PublicKey,
    bet: PublicKey,
    pool: PublicKey,
    side: "over" | "under",
    amount: number
  ) {
    return (program.methods as any)
      .placeStake(side === "under" ? { under: {} } : { over: {} }, new BN(Math.round(amount * 1_000_000)))
      .accounts({
        user,
        bet,
        position: this.positionPda(program.programId, bet, user),
        pool,
        userToken: getAssociatedTokenAddressSync(usdcMint, user),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async buildStake(user: PublicKey, bet: PublicKey, side: "over" | "under", amount: number): Promise<string> {
    const { program, usdcMint } = await this.getProgram();
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), bet.toBuffer()],
      program.programId
    );
    const tx = new Transaction().add(await this.stakeIx(program, usdcMint, user, bet, pool, side, amount));
    return this.toBase64(tx, user);
  }

  async buildClaim(user: PublicKey, bet: PublicKey): Promise<string> {
    const { program, usdcMint } = await this.getProgram();
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), bet.toBuffer()],
      program.programId
    );
    const tx = new Transaction().add(
      await (program.methods as any)
        .claim()
        .accounts({
          user,
          bet,
          position: this.positionPda(program.programId, bet, user),
          pool,
          userToken: getAssociatedTokenAddressSync(usdcMint, user),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
    );
    return this.toBase64(tx, user);
  }

  async listBets() {
    const { program } = await this.getProgram();
    const bets = await (program.account as any).betConfig.all();
    return bets.map(({ publicKey, account }: any) => ({
      address: publicKey.toBase58(),
      creator: account.creator.toBase58(),
      fixtureId: account.fixtureId.toString(),
      statKeyA: account.statKeyA,
      statKeyB: account.statKeyB,
      comparison: Object.keys(account.comparison)[0],
      threshold: account.threshold,
      kickoffTs: account.kickoffTs.toNumber(),
      status: Object.keys(account.status)[0],
      pending: account.pending
        ? {
            result: account.pending.result,
            proofTs: account.pending.proofTs.toString(),
            challengeDeadlineTs: account.pending.challengeDeadlineTs.toNumber(),
          }
        : null,
      result: account.result,
      overTotal: account.overTotal.toString(),
      underTotal: account.underTotal.toString(),
    }));
  }
}
