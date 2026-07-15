import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { SessionService } from "../session/session.service";
import { WalletsService } from "../wallets/wallets.service";
import { TxsService, CreateBetRequest } from "../solana/txs.service";
import { CreateBetDto, StakeDto } from "./bets.dto";

@Injectable()
export class BetsService {
  private readonly logger = new Logger(BetsService.name);

  constructor(
    private readonly session: SessionService,
    private readonly wallets: WalletsService,
    private readonly txs: TxsService
  ) {}

  private requireWallet(userKey: string) {
    const wallet = this.session.getWallet(userKey);
    if (!wallet) {
      throw new BadRequestException(`unknown user — call POST /session first`);
    }
    return wallet;
  }

  /**
   * Send a transaction and surface program errors to the client instead of
   * letting them collapse into a generic 500. Only the anchor error name
   * ("Error Code: X", which the frontend maps to human feedback) or a
   * custom-error code goes to the client; full logs stay server-side.
   */
  private async send(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn();
    } catch (err: any) {
      const logs: string[] = err?.logs ?? err?.transactionLogs ?? [];
      const combined = [err?.message ?? String(err), ...logs].join(" | ");
      this.logger.warn(`transaction failed: ${combined}`);
      const anchorError = combined.match(/Error Code: (\w+)/)?.[1];
      const customCode = combined.match(/custom program error: (0x[0-9a-fA-F]+)/)?.[1];
      throw new BadRequestException(
        anchorError || customCode ? `Program error: ${anchorError ?? customCode}` : "Transaction failed"
      );
    }
  }

  list() {
    return this.txs.listBets();
  }

  async create(userKey: string, dto: CreateBetDto) {
    const wallet = this.requireWallet(userKey);
    const request: CreateBetRequest = {
      fixtureId: dto.fixtureId,
      statKeyA: dto.statKeyA,
      statKeyB: dto.statKeyB,
      op: dto.op,
      kind: dto.kind,
      comparison: dto.comparison,
      threshold: dto.threshold,
      kickoffTs: dto.kickoffTs,
    };
    const { txBase64, bet } = await this.txs.buildCreateBet(
      new PublicKey(wallet.address),
      request,
      dto.opening
    );
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
    return { bet: bet.toBase58(), signature };
  }

  async stake(betAddress: PublicKey, userKey: string, dto: StakeDto) {
    const wallet = this.requireWallet(userKey);
    const txBase64 = await this.txs.buildStake(
      new PublicKey(wallet.address),
      betAddress,
      dto.side,
      dto.amount
    );
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
    return { signature };
  }

  async claim(betAddress: PublicKey, userKey: string) {
    const wallet = this.requireWallet(userKey);
    const txBase64 = await this.txs.buildClaim(new PublicKey(wallet.address), betAddress);
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
    return { signature };
  }
}
