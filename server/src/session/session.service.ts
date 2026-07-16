// Session bootstrap: first call for a userKey creates a server-managed
// wallet and auto-funds it; later calls return the wallet with live balances.
//
// AUTH NOTE: identity is resolved BEFORE this service is called — either a
// Privy access token verified by AuthService (userKey = Privy DID) or the
// dev-mode caller-supplied userKey. Mutating endpoints elsewhere require the
// sessionToken issued alongside this session (see auth/).

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "../solana/solana.constants";
import { WalletsService, UserWallet } from "../wallets/wallets.service";
import { FundingService } from "../funding/funding.service";

@Injectable()
export class SessionService {
  private usersPath = join(process.env.DATA_DIR ?? process.cwd(), "users.json");
  private users: Record<string, UserWallet & { name?: string }>;

  constructor(
    @Inject(SOLANA_CONNECTION) private readonly connection: Connection,
    private readonly wallets: WalletsService,
    private readonly funding: FundingService
  ) {
    this.users = existsSync(this.usersPath)
      ? JSON.parse(readFileSync(this.usersPath, "utf8"))
      : {};
    this.recoverFromEnv();
  }

  /**
   * One-time account recovery. RECOVER_USERS is a JSON map
   *   { "email": { "walletId": "...", "address": "...", "name": "..." }, ... }
   * merged in on boot for any email we don't already know. Restores a lost
   * email→wallet mapping (e.g. after an ephemeral-disk wipe) with no shell
   * access — set the env, redeploy once, then remove it. Never overwrites an
   * existing account, so it's safe to leave set.
   */
  private recoverFromEnv() {
    const raw = process.env.RECOVER_USERS;
    if (!raw) return;
    try {
      const entries = JSON.parse(raw) as Record<string, UserWallet & { name?: string }>;
      let added = 0;
      for (const [email, rec] of Object.entries(entries)) {
        const key = email.toLowerCase();
        if (!this.users[key] && rec?.walletId && rec?.address) {
          this.users[key] = rec;
          added++;
        }
      }
      if (added) {
        writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
        console.log(`[session] recovered ${added} account(s) from RECOVER_USERS`);
      }
    } catch (err) {
      console.error(`[session] RECOVER_USERS is not valid JSON — skipped: ${err}`);
    }
  }

  getWallet(userKey: string): UserWallet | undefined {
    return this.users[userKey];
  }

  /** Does an account already exist for this key? Read-only — never creates. */
  exists(userKey: string): boolean {
    return !!this.users[userKey];
  }

  /**
   * True when this user already has a wallet. Such a request cannot trigger the
   * faucet — getSession() only funds on first creation — so the throttle guard
   * lets it through. Purely a read; never creates anything.
   */
  isKnownUser(userKey: string): boolean {
    return Boolean(this.users[userKey]);
  }

  async getSession(userKey: string, name?: string) {
    let created = false;
    if (!this.users[userKey]) {
      this.users[userKey] = await this.wallets.createWallet(userKey);
      created = true;
    }
    if (name && name !== this.users[userKey].name) this.users[userKey].name = name;
    if (created || name) writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
    if (created) await this.funding.fund(this.users[userKey].address, userKey);
    const wallet = this.users[userKey];
    const { sol, pusdc } = await this.readBalances(wallet.address);
    return {
      userKey,
      email: userKey,
      name: wallet.name ?? null,
      address: wallet.address,
      sol,
      pusdc,
      created,
      provider: this.wallets.kind,
    };
  }

  /**
   * Self-serve top-up for an existing, authenticated user. Identity is the
   * verified userKey (never a body field). Returns the funding outcome plus
   * refreshed balances so the client can update without a second round-trip.
   */
  async topUp(userKey: string) {
    const wallet = this.users[userKey];
    if (!wallet) throw new NotFoundException("no wallet for this session");
    const result = await this.funding.topUp(wallet.address, userKey);
    const { sol, pusdc } = await this.readBalances(wallet.address);
    return { ...result, sol, pusdc };
  }

  /** Live on-chain SOL + pUSDC for an address. Missing ATA reads as 0 pUSDC. */
  private async readBalances(address: string): Promise<{ sol: number; pusdc: number }> {
    const pk = new PublicKey(address);
    const sol = (await this.connection.getBalance(pk)) / LAMPORTS_PER_SOL;
    let pusdc = 0;
    try {
      const ata = getAssociatedTokenAddressSync(await this.funding.ensureMint(), pk);
      pusdc = Number((await getAccount(this.connection, ata)).amount) / 1_000_000;
    } catch {
      /* no ATA yet */
    }
    return { sol, pusdc };
  }
}
