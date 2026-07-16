// The top-up faucet spends real devnet SOL, so the thing worth pinning is when
// it says NO. decideTopUp is pure — these tests lock the three abuse gates and,
// crucially, their precedence, so a future edit can't quietly let a flush wallet
// or an on-cooldown user through.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTopUp } from "./funding.service";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY; // arbitrary fixed clock (Date.now() is banned in tests)
const pusdc = (n: number) => BigInt(n) * 10n ** 6n;

test("funds a genuinely low wallet that's off cooldown and under budget", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: 0, balance: pusdc(2), activeFundings: 0 });
  assert.deepEqual(d, { fund: true });
});

test("a wallet at the 30 pUSDC threshold is not low — never funded", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: 0, balance: pusdc(30), activeFundings: 0 });
  assert.deepEqual(d, { fund: false, reason: "not_low" });
});

test("just under the threshold is eligible", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: 0, balance: pusdc(30) - 1n, activeFundings: 0 });
  assert.equal(d.fund, true);
});

test("a low wallet within 24h of its last top-up is on cooldown, with a retry hint", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: NOW - DAY / 2, balance: 0n, activeFundings: 0 });
  assert.equal(d.fund, false);
  assert.equal((d as any).reason, "cooldown");
  assert.equal((d as any).retryAfterMs, DAY / 2); // ~12h left
});

test("cooldown lapses exactly at 24h", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: NOW - DAY, balance: 0n, activeFundings: 0 });
  assert.deepEqual(d, { fund: true });
});

test("the global 50/24h budget blocks even a fresh, low wallet", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: 0, balance: 0n, activeFundings: 50 });
  assert.deepEqual(d, { fund: false, reason: "global_cap" });
});

test("one under the global cap still funds", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: 0, balance: 0n, activeFundings: 49 });
  assert.deepEqual(d, { fund: true });
});

// Precedence is the part a refactor is most likely to break.
test("a flush wallet is told not_low even while on cooldown and at the cap", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: NOW, balance: pusdc(50), activeFundings: 50 });
  assert.equal((d as any).reason, "not_low");
});

test("a low, on-cooldown wallet gets cooldown even when the global cap is also hit", () => {
  const d = decideTopUp({ now: NOW, lastTopUp: NOW - 60_000, balance: 0n, activeFundings: 50 });
  assert.equal((d as any).reason, "cooldown");
});
