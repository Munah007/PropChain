import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import { SessionService } from "./session.service";
import { TxsService } from "../solana/txs.service";
import { AuthService } from "../auth/auth.service";
import { SessionThrottleGuard } from "../auth/session-throttle.guard";
import { requireString } from "../common/validation";

@Controller()
export class SessionController {
  constructor(
    private readonly session: SessionService,
    private readonly txs: TxsService,
    private readonly auth: AuthService
  ) {}

  @Post("session")
  @UseGuards(SessionThrottleGuard)
  async createSession(@Req() req: any, @Body() body: { userKey?: string; name?: string }) {
    // PRIVY PATH: when configured and the client sends its Privy access
    // token, the session is bound to the VERIFIED Privy user id — the body
    // userKey is ignored for identity.
    let userKey: string;
    const privyToken = req.headers["x-privy-token"];
    if (this.auth.privyEnabled && typeof privyToken === "string" && privyToken) {
      try {
        userKey = await this.auth.verifyPrivyToken(privyToken);
      } catch {
        throw new UnauthorizedException("invalid Privy token");
      }
    } else {
      // LOCAL SESSION-TOKEN PATH: caller-supplied userKey (dev fallback).
      // Normalise email case so one address is always one account.
      userKey = requireString(body?.userKey, "userKey").toLowerCase();
    }
    const name = body?.name ? String(body.name).trim().slice(0, 80) : undefined;
    const session = await this.session.getSession(userKey, name);
    // sessionToken must go in `Authorization: Bearer <token>` on mutations.
    return { ...session, sessionToken: this.auth.issueToken(userKey) };
  }

  // Read-only: lets the sign-in flow decide "log in" vs "create account"
  // before it does anything. Never creates or funds. (Privy mode resolves
  // identity from the token instead, so this only serves the local path.)
  @Get("session/exists")
  exists(@Query("email") email?: string) {
    const key = requireString(email, "email").toLowerCase();
    return { exists: this.session.exists(key) };
  }

  @Get("users/:userKey/positions")
  async positions(@Param("userKey") userKey: string) {
    const wallet = this.session.getWallet(userKey);
    if (!wallet) return [];
    return this.txs.listPositions(new PublicKey(wallet.address));
  }
}
