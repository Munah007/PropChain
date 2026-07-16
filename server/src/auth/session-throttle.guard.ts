// Per-IP sliding-window throttle for POST /session (the faucet trigger).
// Hand-rolled and in-memory on purpose — a small per-IP window needs no
// @nestjs/throttler dependency, and losing counts on restart is acceptable.
//
// What this protects is the FAUCET, not the endpoint: getSession() only creates
// and funds a wallet the first time it sees a userKey. Anything that cannot
// reach that path is waved through, because throttling it costs a real user a
// session and buys no protection:
//   * a valid bearer token — a returning session refreshing balances;
//   * a userKey we already hold a wallet for — same, minus the token.
// Only genuinely new users consume the window.
//
// Sizing: judges share one NAT'd IP at a demo event, so a handful per hour is
// far too tight — the 6th judge to sign in gets a 429 that reads to them as
// "sign-in is broken". SESSION_THROTTLE_MAX / _WINDOW_MIN tune it per venue.

import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SessionService } from "../session/session.service";

const WINDOW_MS = Number(process.env.SESSION_THROTTLE_WINDOW_MIN ?? 60) * 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.SESSION_THROTTLE_MAX ?? 30);

@Injectable()
export class SessionThrottleGuard implements CanActivate {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // A returning session (valid bearer token) is just refreshing balances —
    // it can't trigger funding again, so it doesn't count against the window.
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer && this.auth.resolveToken(bearer)) return true;

    // Same reasoning without a token: a userKey with a wallet already on file
    // takes the no-op path through getSession(). Losing a token (new tab,
    // cleared storage, a second device) must not cost anyone their session.
    const userKey = req.body?.userKey;
    if (typeof userKey === "string" && this.sessions.isKnownUser(userKey)) return true;

    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (typeof forwarded === "string" && forwarded.split(",")[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      // Say when, not just no: a bare 429 is indistinguishable from an outage.
      // `recent` is empty when the cap is 0 (a deliberate lockout), so fall back
      // to a full window rather than emitting NaN at the user.
      const oldest = recent[0] ?? now;
      const retryAfterS = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
      const res = context.switchToHttp().getResponse();
      res?.setHeader?.("Retry-After", String(retryAfterS));
      throw new HttpException(
        `too many new sign-ups from this network — try again in ${Math.ceil(retryAfterS / 60)} min`,
        HttpStatus.TOO_MANY_REQUESTS
      );
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
