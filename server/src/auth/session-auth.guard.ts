// Guard for mutating endpoints: derives the caller's identity from a
// verified token and stashes it on the request as `req.userKey`. The legacy
// body userKey field is IGNORED for identity — if present it must match the
// authenticated identity (403 otherwise) so stale clients fail loudly
// instead of acting as someone else.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userKey = await this.resolveIdentity(req);
    const bodyKey = req.body?.userKey;
    if (bodyKey != null && String(bodyKey) !== userKey) {
      throw new ForbiddenException("userKey does not match the authenticated session");
    }
    req.userKey = userKey;
    return true;
  }

  private async resolveIdentity(req: any): Promise<string> {
    // PRIVY PATH: only when configured AND the header is present.
    const privyToken = req.headers["x-privy-token"];
    if (this.auth.privyEnabled && typeof privyToken === "string" && privyToken) {
      try {
        return await this.auth.verifyPrivyToken(privyToken);
      } catch {
        throw new UnauthorizedException("invalid Privy token");
      }
    }
    // LOCAL SESSION-TOKEN PATH: Authorization: Bearer <sessionToken>.
    const header = req.headers["authorization"];
    const token =
      typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      throw new UnauthorizedException("Authorization: Bearer <sessionToken> required");
    }
    const userKey = this.auth.resolveToken(token);
    if (!userKey) throw new UnauthorizedException("invalid session token");
    return userKey;
  }
}
