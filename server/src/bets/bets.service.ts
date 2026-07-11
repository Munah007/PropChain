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

  /**
   * Send a transaction and surface program errors to the client instead of
   * letting them collapse into a generic 500. Anchor's "Error Code: X" (from
   * simulation logs) or the raw message goes into a 400 body the frontend
   * can translate into human feedback.
   */
  private async send(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn();
    } catch (err: any) {
      const logs: string[] = err?.logs ?? err?.transactionLogs ?? [];
      const combined = [err?.message ?? String(err), ...logs].join(" | ");
      const anchorError = combined.match(/Error Code: (\w+)/)?.[1];
      throw new BadRequestException(anchorError ? `Program error: ${anchorError}` : combined.slice(0, 400));
    }
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
      op: body.op === "add" || body.op === "subtract" ? body.op : null,
      kind: body.kind === "bothScore" ? "bothScore" : "line",
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
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
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
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
    return { signature };
  }

  async claim(betAddress: string, body: any) {
    const wallet = this.requireWallet(body?.userKey);
    const txBase64 = await this.txs.buildClaim(
      new PublicKey(wallet.address),
      new PublicKey(betAddress)
    );
    const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
    return { signature };
  }
}
