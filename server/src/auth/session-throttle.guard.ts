// Per-IP sliding-window throttle for POST /session (the faucet trigger).
// Hand-rolled and in-memory on purpose — 5 requests/hour/IP needs no
// @nestjs/throttler dependency, and losing counts on restart is acceptable.

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

@Injectable()
export class SessionThrottleGuard implements CanActivate {
  private hits = new Map<string, number[]>();

  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // A returning session (valid bearer token) is just refreshing balances —
    // it can't trigger funding again, so it doesn't count against the window.
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer && this.auth.resolveToken(bearer)) return true;
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (typeof forwarded === "string" && forwarded.split(",")[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      throw new HttpException("too many session requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(ip, recent);
    // Opportunistic sweep so the map can't grow without bound.
    if (this.hits.size > 10_000) {
      for (const [key, times] of this.hits) {
        if (times.every((t) => now - t >= WINDOW_MS)) this.hits.delete(key);
      }
    }
    return true;
  }
}
