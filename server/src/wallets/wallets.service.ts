// All user wallets are created and signed SERVER-SIDE (pattern borrowed from
// NectarFi's mobile-server PrivyService). Two providers behind one interface:
//
//  * privy — production path: wallets live in Privy's TEE, created per user,
//    signed/sent via Privy's wallet RPC API.
//  * local — dev fallback when PRIVY_APP_ID/SECRET are absent: keypairs on
//    disk, same interface, so the whole API works without credentials.
//
// The frontend never builds, signs, or holds anything.

import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "../solana/solana.constants";

export interface UserWallet {
  walletId: string;
  address: string;
}

@Injectable()
export class WalletsService implements OnModuleInit {
  kind: "privy" | "local" = "local";
  private privy: any = null;
  private keysPath = join(process.env.DATA_DIR ?? process.cwd(), "local-wallets.json");
  private keys: Record<string, number[]> = {};

  constructor(@Inject(SOLANA_CONNECTION) private readonly connection: Connection) {}

  async onModuleInit() {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (appId && appSecret) {
      const { PrivyClient } = await import("@privy-io/server-auth");
      this.privy = new PrivyClient(appId, appSecret);
      this.kind = "privy";
      console.log("[wallets] provider: privy (server-managed wallets)");
    } else {
      this.keys = existsSync(this.keysPath)
        ? JSON.parse(readFileSync(this.keysPath, "utf8"))
        : {};
      console.log(
        "[wallets] provider: LOCAL DEV FALLBACK (set PRIVY_APP_ID/PRIVY_APP_SECRET for Privy)"
      );
    }
  }

  /** Create the Solana wallet for a user key (email / privy DID). */
  async createWallet(userKey: string): Promise<UserWallet> {
    if (this.privy) {
      const wallet = await this.privy.walletApi.createWallet({ chainType: "solana" });
      return { walletId: wallet.id, address: wallet.address };
    }
    if (!this.keys[userKey]) {
      const kp = Keypair.generate();
      this.keys[userKey] = Array.from(kp.secretKey);
      writeFileSync(this.keysPath, JSON.stringify(this.keys));
    }
    const kp = Keypair.fromSecretKey(Uint8Array.from(this.keys[userKey]));
    return { walletId: userKey, address: kp.publicKey.toBase58() };
  }

  /** Sign a base64-serialized transaction with the user's wallet and send it. */
  async signAndSend(walletId: string, txBase64: string): Promise<string> {
    if (this.privy) {
      // Privy signs; WE broadcast on our own connection. Privy's
      // signAndSendTransaction submits through its own RPC for the caip2
      // chain, which can point at a different cluster than the one our
      // blockhash came from ("Blockhash not found").
      const { signedTransaction } = await this.privy.walletApi.solana.signTransaction({
        walletId,
        transaction: Transaction.from(Buffer.from(txBase64, "base64")),
      });
      const sig = await this.connection.sendRawTransaction(signedTransaction.serialize());
      await this.connection.confirmTransaction(sig, "confirmed");
      return sig;
    }
    const secret = this.keys[walletId];
    if (!secret) throw new Error(`No local wallet for ${walletId}`);
    const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
    const tx = Transaction.from(Buffer.from(txBase64, "base64"));
    tx.partialSign(kp);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}
