import { BadRequestException, Injectable } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { SessionService } from "../session/session.service";
import { WalletsService } from "../wallets/wallets.service";
import { TxsService, CreateBetRequest } from "../solana/txs.service";

@Injectable()
export class BetsService {
  constructor(
    private readonly session: SessionService,
    private readonly wallets: WalletsService,
    private readonly txs: TxsService
  ) {}

  private requireWallet(userKey?: string) {
    const wallet = userKey ? this.session.getWallet(userKey) : undefined;
    if (!wallet) {
      throw new BadRequestException(`unknown user ${userKey} — call POST /session first`);
    }
    return wallet;
  }

  list() {
    return this.txs.listBets();
  }

  async create(body: any) {
    const wallet = this.requireWallet(body?.userKey);
    const request: CreateBetRequest = {
      fixtureId: Number(body.fixtureId),
      statKeyA: Number(body.statKeyA),
      statKeyB: body.statKeyB != null ? Number(body.statKeyB) : null,
      comparison: body.comparison === "less" ? "less" : "greater",
      threshold: Number(body.threshold),
      kickoffTs: Number(body.kickoffTs),
    };
    const opening = body.opening
      ? {
          side: body.opening.side === "under" ? ("under" as const) : ("over" as const),
          amount: Number(body.opening.amount),
        }
      : undefined;
    const { txBase64, bet } = await this.txs.buildCreateBet(
      new PublicKey(wallet.address),
      request,
      opening
    );
    const signature = await this.wallets.signAndSend(wallet.walletId, txBase64);
    return { bet: bet.toBase58(), signature };
  }

  async stake(betAddress: string, body: any) {
    const wallet = this.requireWallet(body?.userKey);
    const txBase64 = await this.txs.buildStake(
      new PublicKey(wallet.address),
      new PublicKey(betAddress),
      body.side === "under" ? "under" : "over",
      Number(body.amount)
    );
    const signature = await this.wallets.signAndSend(wallet.walletId, txBase64);
    return { signature };
  }

  async claim(betAddress: string, body: any) {
    const wallet = this.requireWallet(body?.userKey);
    const txBase64 = await this.txs.buildClaim(
      new PublicKey(wallet.address),
      new PublicKey(betAddress)
    );
    const signature = await this.wallets.signAndSend(wallet.walletId, txBase64);
    return { signature };
  }
}
