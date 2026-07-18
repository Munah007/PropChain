// Unit tests for the track-record aggregation. Run with: npm test (compiles
// first — node's type stripping can't load these extensionless imports
// straight from src).
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, settledMarkets, TrackRecordBet } from "./track-record.service";

let seq = 0;
const bet = (over: Partial<TrackRecordBet> = {}): TrackRecordBet => ({
  address: `bet${seq++}`,
  fixtureId: "100",
  statKeyA: 1,
  statKeyB: 2,
  op: "add",
  kind: "line",
  comparison: "greater",
  threshold: 2,
  status: "open",
  pending: null,
  overTotal: "0",
  underTotal: "0",
  ...over,
});

const proof = (proofTs: string, result = true) => ({
  result,
  proofTs,
  challengeDeadlineTs: 1_700_000_000,
});

const teams = () => ({ home: "France", away: "Brazil" });
const noTeams = () => null;

// ---------- summarize ----------

test("counts each status into its own bucket", () => {
  const s = summarize([
    bet({ status: "open" }),
    bet({ status: "settlementPending" }),
    bet({ status: "settled", pending: proof("1700000000000") }),
    bet({ status: "voided" }),
  ]);
  assert.equal(s.marketsCreated, 4);
  assert.equal(s.settled, 1);
  assert.equal(s.voided, 1);
  // settlementPending is not final — the money is still at stake, so it counts open.
  assert.equal(s.open, 2);
});

test("stakes sum both sides of every market, settled or not", () => {
  const s = summarize([
    bet({ overTotal: "1500000", underTotal: "500000" }),
    bet({ status: "settled", pending: proof("1"), overTotal: "3000000", underTotal: "0" }),
  ]);
  assert.equal(s.totalStakedBaseUnits, "5000000");
  assert.equal(s.totalStakedUsdc, 5);
});

test("stake totals are exact past the float-safe integer range", () => {
  // 2^53 base units is ~9.007bn pUSDC; Number addition would round here.
  const big = "9007199254740993"; // 2^53 + 1
  const s = summarize([bet({ overTotal: big, underTotal: big })]);
  assert.equal(s.totalStakedBaseUnits, "18014398509481986");
});

test("a malformed total is skipped rather than poisoning the ledger", () => {
  const s = summarize([bet({ overTotal: "not-a-number", underTotal: "1000000" })]);
  assert.equal(s.totalStakedBaseUnits, "1000000");
});

test("every settled market carrying a proof reads 100%", () => {
  const s = summarize([
    bet({ status: "settled", pending: proof("1700000000000") }),
    bet({ status: "settled", pending: proof("1700000001000", false) }),
  ]);
  assert.equal(s.settledWithProof, 2);
  assert.equal(s.proofBackedPct, 100);
});

test("a settled market with no proof drags proofBackedPct below 100", () => {
  // This is the number that would expose an admin-key settlement.
  const s = summarize([
    bet({ status: "settled", pending: proof("1700000000000") }),
    bet({ status: "settled", pending: null }),
  ]);
  assert.equal(s.settledWithProof, 1);
  assert.equal(s.proofBackedPct, 50);
});

test("a zero proofTs does not count as a proof", () => {
  const s = summarize([bet({ status: "settled", pending: proof("0") })]);
  assert.equal(s.settledWithProof, 0);
  assert.equal(s.proofBackedPct, 0);
});

test("proofBackedPct rounds to two places", () => {
  const s = summarize([
    bet({ status: "settled", pending: proof("1") }),
    bet({ status: "settled", pending: proof("2") }),
    bet({ status: "settled", pending: null }),
  ]);
  assert.equal(s.proofBackedPct, 66.67);
});

test("no settled markets is 100%, not 0% — nothing has gone unproven", () => {
  assert.equal(summarize([bet({ status: "open" })]).proofBackedPct, 100);
  assert.equal(summarize([]).proofBackedPct, 100);
});

test("an empty program reads as an empty ledger", () => {
  const s = summarize([]);
  assert.equal(s.marketsCreated, 0);
  assert.equal(s.totalStakedBaseUnits, "0");
  assert.equal(s.totalStakedUsdc, 0);
});

// ---------- settledMarkets ----------

test("only settled markets reach the ledger", () => {
  const rows = settledMarkets(
    [
      bet({ status: "open" }),
      bet({ status: "settlementPending", pending: proof("1700000000000") }),
      bet({ status: "voided" }),
      bet({ status: "settled", pending: proof("1700000000000") }),
    ],
    teams
  );
  assert.equal(rows.length, 1);
});

test("newest proof sorts first", () => {
  const rows = settledMarkets(
    [
      bet({ address: "old", status: "settled", pending: proof("1700000000000") }),
      bet({ address: "new", status: "settled", pending: proof("1800000000000") }),
      bet({ address: "mid", status: "settled", pending: proof("1750000000000") }),
    ],
    teams
  );
  assert.deepEqual(rows.map((r) => r.betAddress), ["new", "mid", "old"]);
});

test("proofTs ordering holds past the float-safe range", () => {
  // Same Number() value once rounded; only BigInt comparison separates them.
  const rows = settledMarkets(
    [
      bet({ address: "lower", status: "settled", pending: proof("9007199254740993") }),
      bet({ address: "higher", status: "settled", pending: proof("9007199254740995") }),
    ],
    teams
  );
  assert.deepEqual(rows.map((r) => r.betAddress), ["higher", "lower"]);
});

test("an unproven settlement sorts last but is never dropped", () => {
  const rows = settledMarkets(
    [
      bet({ address: "unproven", status: "settled", pending: null }),
      bet({ address: "proven", status: "settled", pending: proof("1") }),
    ],
    teams
  );
  assert.deepEqual(rows.map((r) => r.betAddress), ["proven", "unproven"]);
  assert.equal(rows[1].proofTs, null);
  assert.equal(rows[1].result, null);
});

test("the winning total follows the proven result", () => {
  const over = settledMarkets(
    [bet({ status: "settled", pending: proof("1", true), overTotal: "7", underTotal: "3" })],
    teams
  );
  assert.equal(over[0].winningTotal, "7");
  const under = settledMarkets(
    [bet({ status: "settled", pending: proof("1", false), overTotal: "7", underTotal: "3" })],
    teams
  );
  assert.equal(under[0].winningTotal, "3");
});

test("team names resolve through the lookup, and degrade to null without it", () => {
  const market = bet({ status: "settled", pending: proof("1") });
  assert.equal(settledMarkets([market], teams)[0].home, "France");
  const degraded = settledMarkets([market], noTeams)[0];
  assert.equal(degraded.home, null);
  assert.equal(degraded.away, null);
  // The proof still reports even when the fixture feed is gone.
  assert.equal(degraded.proofTs, "1");
});

test("the predicate fields pass through unchanged", () => {
  const rows = settledMarkets(
    [
      bet({
        status: "settled",
        pending: proof("1"),
        statKeyA: 7,
        statKeyB: null,
        op: null,
        kind: "bothScore",
        comparison: "less",
        threshold: 9,
      }),
    ],
    teams
  );
  const [r] = rows;
  assert.equal(r.statKeyA, 7);
  assert.equal(r.statKeyB, null);
  assert.equal(r.op, null);
  assert.equal(r.kind, "bothScore");
  assert.equal(r.comparison, "less");
  assert.equal(r.threshold, 9);
  assert.equal(r.challengeDeadlineTs, 1_700_000_000);
});
