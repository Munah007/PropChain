import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { SessionService } from "./session.service";
import { TxsService } from "../solana/txs.service";

@Controller()
export class SessionController {
  constructor(
    private readonly session: SessionService,
    private readonly txs: TxsService
  ) {}

  @Post("session")
  async createSession(@Body() body: { userKey?: string; name?: string }) {
    if (!body?.userKey) throw new BadRequestException("userKey required");
    const name = body.name ? String(body.name).trim().slice(0, 80) : undefined;
    return this.session.getSession(String(body.userKey), name);
  }

  @Get("users/:userKey/positions")
  async positions(@Param("userKey") userKey: string) {
    const wallet = this.session.getWallet(userKey);
    if (!wallet) return [];
    return this.txs.listPositions(new PublicKey(wallet.address));
  }
}
