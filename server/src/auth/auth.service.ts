// Two authentication paths, kept deliberately separate:
//
//  * LOCAL SESSION TOKENS (dev / unauthenticated fallback) — POST /session
//    mints a crypto-random bearer token bound to the caller's userKey.
//    Mutating endpoints must present it as `Authorization: Bearer <token>`.
//    Tokens persist to sessions.json (sibling of users.json) so restarts
//    keep sessions alive.
//
//  * PRIVY (production) — when PRIVY_APP_ID/PRIVY_APP_SECRET are set and the
//    request carries an `x-privy-token` header, we verify it with Privy's
//    verifyAuthToken() and use the verified Privy user id (DID) as the
//    identity. The session-token path stays available as the fallback.

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface SessionRecord {
  userKey: string;
  createdAt: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private sessionsPath = join(process.env.DATA_DIR ?? process.cwd(), "sessions.json");
  private sessions: Record<string, SessionRecord> = {};
  private tokenByUser = new Map<string, string>();
  private privy: any = null;

  async onModuleInit() {
    if (existsSync(this.sessionsPath)) {
      this.sessions = JSON.parse(readFileSync(this.sessionsPath, "utf8"));
      for (const [token, record] of Object.entries(this.sessions)) {
        this.tokenByUser.set(record.userKey, token);
      }
    }
    // PRIVY PATH setup — only active when credentials are configured.
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (appId && appSecret) {
      const { PrivyClient } = await import("@privy-io/server-auth");
      this.privy = new PrivyClient(appId, appSecret);
      this.logger.log("Privy token verification enabled (x-privy-token)");
    }
  }

  /** Issue a bearer token for a userKey (idempotent — one token per user). */
  issueToken(userKey: string): string {
    const existing = this.tokenByUser.get(userKey);
    if (existing) return existing;
    const token = randomBytes(32).toString("hex");
    this.sessions[token] = { userKey, createdAt: Date.now() };
    this.tokenByUser.set(userKey, token);
    writeFileSync(this.sessionsPath, JSON.stringify(this.sessions, null, 2));
    return token;
  }

  /** LOCAL SESSION-TOKEN PATH: token -> userKey (undefined if unknown). */
  resolveToken(token: string): string | undefined {
    return this.sessions[token]?.userKey;
  }

  get privyEnabled(): boolean {
    return this.privy !== null;
  }

  /**
   * PRIVY PATH: verify a Privy access token and return the verified Privy
   * user id (DID). Throws on invalid/expired tokens — callers translate to 401.
   */
  async verifyPrivyToken(token: string): Promise<string> {
    const claims = await this.privy.verifyAuthToken(token);
    return claims.userId;
  }
}
