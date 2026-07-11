// Auto-funding on wallet creation: drips devnet SOL for fees and mints pUSDC
// (mock USDC) to bet with. Serialized through a queue to avoid blockhash
// races on signup bursts.

import { Inject, Injectable } from "@nestjs/common";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "../solana/solana.constants";

const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL;
const PUSDC_DRIP = 100n * 10n ** 6n; // 100 pUSDC (6 decimals)

@Injectable()
export class FundingService {
  private funder: Keypair;
  private statePath = join(process.env.DATA_DIR ?? process.cwd(), "funder-state.json");
  private mint: PublicKey | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(SOLANA_CONNECTION) private readonly connection: Connection) {
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

  async ensureMint(): Promise<PublicKey> {
    if (this.mint) return this.mint;
    if (process.env.PUSDC_MINT) {
      this.mint = new PublicKey(process.env.PUSDC_MINT);
      return this.mint;
    }
    if (existsSync(this.statePath)) {
      const state = JSON.parse(readFileSync(this.statePath, "utf8"));
      if (state.pusdcMint) {
        this.mint = new PublicKey(state.pusdcMint);
        return this.mint;
      }
    }
    this.mint = await createMint(this.connection, this.funder, this.funder.publicKey, null, 6);
    writeFileSync(this.statePath, JSON.stringify({ pusdcMint: this.mint.toBase58() }, null, 2));
    console.log(`[funding] created pUSDC mint ${this.mint.toBase58()}`);
    return this.mint;
  }

  fund(address: string): Promise<void> {
    const task = this.queue.then(async () => {
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
    });
    this.queue = task.catch(() => {});
    return task as Promise<void>;
  }
}
