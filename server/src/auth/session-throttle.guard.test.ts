// The throttle exists to protect the faucet, so the thing worth pinning is who
// it lets THROUGH. A returning user being counted is how a demo turns into
// "sign-in is broken" for the sixth judge on a shared network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionThrottleGuard } from "./session-throttle.guard";

const ctx = (req: any) => ({
  switchToHttp: () => ({
    getRequest: () => req,
    getResponse: () => ({ setHeader() {} }),
  }),
});

const guard = (opts: { validToken?: string; knownUsers?: string[] } = {}) =>
  new SessionThrottleGuard(
    { resolveToken: (t: string) => (t === opts.validToken ? { userKey: "x" } : null) } as any,
    { isKnownUser: (k: string) => (opts.knownUsers ?? []).includes(k) } as any
  );

const req = (over: any = {}) => ({ headers: {}, socket: { remoteAddress: "9.9.9.9" }, ...over });

test("a new user consumes the window", () => {
  const g = guard();
  assert.equal(g.canActivate(ctx(req({ body: { userKey: "new@a.com" } })) as any), true);
});

test("a returning user is never throttled, token or not", () => {
  // Default limit is 30/hour/IP; run past it from one IP with a known userKey.
  const g = guard({ knownUsers: ["back@a.com"] });
  for (let i = 0; i < 60; i++) {
    assert.equal(
      g.canActivate(ctx(req({ body: { userKey: "back@a.com" } })) as any),
      true,
      `returning user blocked on attempt ${i + 1}`
    );
  }
});

test("a valid bearer bypasses the window", () => {
  const g = guard({ validToken: "good" });
  for (let i = 0; i < 60; i++) {
    const r = req({ headers: { authorization: "Bearer good" }, body: { userKey: "any@a.com" } });
    assert.equal(g.canActivate(ctx(r) as any), true, `bearer blocked on attempt ${i + 1}`);
  }
});

test("new sign-ups from one IP are capped, and the error says when to retry", () => {
  const g = guard();
  let blockedAt = 0;
  let message = "";
  for (let i = 1; i <= 40; i++) {
    try {
      g.canActivate(ctx(req({ body: { userKey: `u${i}@a.com` } })) as any);
    } catch (e: any) {
      blockedAt = i;
      message = e.message;
      break;
    }
  }
  assert.equal(blockedAt, 31, "expected the default 30/hour cap to bite on the 31st new user");
  assert.match(message, /try again in \d+ min/);
});

test("a zero cap still yields a readable retry, not NaN", () => {
  // SESSION_THROTTLE_MAX=0 is a deliberate lockout, and it leaves the window
  // empty — the retry maths must not read the oldest hit that isn't there.
  process.env.SESSION_THROTTLE_MAX = "0";
  delete require.cache[require.resolve("./session-throttle.guard")];
  const { SessionThrottleGuard: Fresh } = require("./session-throttle.guard");
  const g = new Fresh(
    { resolveToken: () => null } as any,
    { isKnownUser: () => false } as any
  );
  assert.throws(
    () => g.canActivate(ctx(req({ body: { userKey: "nobody@a.com" } })) as any),
    (e: any) => {
      assert.doesNotMatch(e.message, /NaN/, "retry hint must never say NaN");
      assert.match(e.message, /try again in \d+ min/);
      return true;
    }
  );
  delete process.env.SESSION_THROTTLE_MAX;
  delete require.cache[require.resolve("./session-throttle.guard")];
});

test("the cap is per IP, so one noisy network cannot lock out another", () => {
  const g = guard();
  for (let i = 1; i <= 30; i++) g.canActivate(ctx(req({ body: { userKey: `a${i}@a.com` } })) as any);
  assert.throws(() => g.canActivate(ctx(req({ body: { userKey: "a31@a.com" } })) as any));
  // A different IP is unaffected.
  const other = req({ socket: { remoteAddress: "8.8.8.8" }, body: { userKey: "b1@a.com" } });
  assert.equal(g.canActivate(ctx(other) as any), true);
});

test("x-forwarded-for is honoured so a proxy doesn't collapse every user to one bucket", () => {
  const g = guard();
  const mk = (ip: string, u: string) =>
    req({ headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, body: { userKey: u } });
  for (let i = 1; i <= 30; i++) g.canActivate(ctx(mk("1.1.1.1", `c${i}@a.com`)) as any);
  assert.throws(() => g.canActivate(ctx(mk("1.1.1.1", "c31@a.com")) as any));
  assert.equal(g.canActivate(ctx(mk("2.2.2.2", "d1@a.com")) as any), true);
});
