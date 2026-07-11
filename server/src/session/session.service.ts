// Session bootstrap: first call for a userKey creates a server-managed
// wallet and auto-funds it; later calls return the wallet with live balances.
//
// AUTH NOTE (pre-launch TODO): userKey is caller-supplied for now. Before the
// demo goes public the frontend sends its Privy access token instead and we
// derive userKey via privy.verifyAuthToken().

import { Inject, Injectable } from "@nestjs/common";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SOLANA_CONNECTION } from "../solana/solana.constants";
import { WalletsService, UserWallet } from "../wallets/wallets.service";
import { FundingService } from "../funding/funding.service";

@Injectable()
export class SessionService {
  private usersPath = join(process.cwd(), "users.json");
  private users: Record<string, UserWallet>;

  constructor(
    @Inject(SOLANA_CONNECTION) private readonly connection: Connection,
    private readonly wallets: WalletsService,
    private readonly funding: FundingService
  ) {
    this.users = existsSync(this.usersPath)
      ? JSON.parse(readFileSync(this.usersPath, "utf8"))
      : {};
  }

  getWallet(userKey: string): UserWallet | undefined {
    return this.users[userKey];
  }

  async getSession(userKey: string) {
    let created = false;
    if (!this.users[userKey]) {
      this.users[userKey] = await this.wallets.createWallet(userKey);
      writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
      await this.funding.fund(this.users[userKey].address);
      created = true;
    }
    const wallet = this.users[userKey];
    const address = new PublicKey(wallet.address);
    const sol = (await this.connection.getBalance(address)) / LAMPORTS_PER_SOL;
    let pusdc = 0;
    try {
      const ata = getAssociatedTokenAddressSync(await this.funding.ensureMint(), address);
      pusdc = Number((await getAccount(this.connection, ata)).amount) / 1_000_000;
    } catch {
      /* no ATA yet */
    }
    return { userKey, address: wallet.address, sol, pusdc, created, provider: this.wallets.kind };
  }
}
