// Settlement engine tests — run against solana-bankrun with:
//   * the REAL txoracle program binary dumped from devnet
//   * the REAL daily_scores_roots account (epochDay 20643)
//   * three REAL Merkle proofs from France–Morocco (fixture 18209181):
//       halftime  (seq 551,  corners 3+1,  period 3   → mid-match)
//       finalised (seq 1114, corners 5+5,  period 100 → game_finalised)
//       final     (seq 1115, corners 5+5,  period 0   → post-final)
//
// Run: npm run test:settlement   (no validator needed; clock is warped)

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { startAnchor, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { buildValidateStatArgs } from "@propchain/txline";

const { BN } = anchor;

const TXORACLE_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const ROOTS_FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/daily-roots-20643.json", import.meta.url), "utf8")
);
const FIXTURE_ID = 18209181;

const loadProof = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/proof-${name.includes("goals") ? name : `corners-${name}`}.json`, import.meta.url), "utf8"));
const PROOF_HALFTIME = loadProof("halftime");
const PROOF_GOALS = loadProof("goals-final"); // France 2-0: keys 1,2 at seq 1115
const PROOF_FINALISED = loadProof("finalised"); // seq 1114, ts 1783634788478
const PROOF_FINAL = loadProof("final"); // seq 1115, ts 1783635207535

const usdc = (n: number) => new BN(n * 1_000_000);

// create_bet only accepts the hardcoded pUSDC mint (state::PUSDC_MINT), and we
// don't hold that mint's keypair — so bankrun injects a mint account AT that
// address, with a test keypair as mint authority.
const PUSDC_MINT = new PublicKey("DWF9ARTjTq3S2jMabyimsaXiVqGVHnVdp1XoRAh3s6Q8");
const mintAuthority = Keypair.generate();

function pusdcMintAccountData(): Buffer {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: mintAuthority.publicKey,
      supply: 0n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data
  );
  return data;
}

let context: Awaited<ReturnType<typeof startAnchor>>;
let client: any;
let provider: InstanceType<typeof BankrunProvider>;
let program: anchor.Program;
let payer: Keypair;

let usdcMint: PublicKey;
const alice = Keypair.generate(); // creator, stakes Over
const bob = Keypair.generate(); // stakes Under
let aliceToken: PublicKey;
let bobToken: PublicKey;
let nonceCounter = 1;

async function processIxs(ixs: any[], signers: Keypair[]) {
  const tx = new Transaction();
  const [blockhash] = (await client.getLatestBlockhash())!;
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(...ixs);
  tx.sign(payer, ...signers);
  await client.processTransaction(tx);
}

async function now(): Promise<bigint> {
  return (await client.getClock()).unixTimestamp;
}

async function warpBy(seconds: number) {
  const clock = await client.getClock();
  context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(seconds)
    )
  );
}

async function tokenBalance(address: PublicKey): Promise<bigint> {
  const acc = await client.getAccount(address);
  return AccountLayout.decode(acc.data).amount;
}

function betPdas(nonce: number) {
  const n = new BN(nonce);
  const [bet] = PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), alice.publicKey.toBuffer(), n.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), bet.toBuffer()],
    program.programId
  );
  return { bet, pool, nonce: n };
}

const positionPda = (bet: PublicKey, user: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("position"), bet.toBuffer(), user.toBuffer()],
    program.programId
  )[0];

/// Creates a corners-total bet (keys 7+8) kicking off shortly after `now`,
/// then warps past kickoff so settlement can be proposed.
async function createBetAndWarpPastKickoff(opts: {
  threshold?: number;
  statKeyA?: number;
  statKeyB?: number | null;
  op?: object | null;
  kind?: object;
  comparison?: object;
  fixtureId?: number;
  overStake?: anchor.BN | null;
  underStake?: anchor.BN | null;
}) {
  const nonce = nonceCounter++;
  const { bet, pool } = betPdas(nonce);
  const kickoff = Number(await now()) + 1000;
  const statKeyB = opts.statKeyB === undefined ? 8 : opts.statKeyB;
  const kind = opts.kind ?? { line: {} };
  const isLine = "line" in kind;
  await program.methods
    .createBet({
      nonce: new BN(nonce),
      fixtureId: new BN(opts.fixtureId ?? FIXTURE_ID),
      statKeyA: opts.statKeyA ?? 7,
      statKeyB,
      op: opts.op !== undefined ? opts.op : isLine && statKeyB != null ? { add: {} } : null,
      kind,
      comparison: opts.comparison ?? { greater: {} },
      threshold: opts.threshold ?? 9,
      kickoffTs: new BN(kickoff),
    })
    .accounts({
      creator: alice.publicKey,
      bet,
      usdcMint,
      pool,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([alice])
    .rpc();

  if (opts.overStake) await stake(alice, aliceToken, bet, pool, { over: {} }, opts.overStake);
  if (opts.underStake) await stake(bob, bobToken, bet, pool, { under: {} }, opts.underStake);

  await warpBy(2000); // past kickoff
  return { bet, pool };
}

async function stake(user: Keypair, userToken: PublicKey, bet: PublicKey, pool: PublicKey, side: object, amount: anchor.BN) {
  await program.methods
    .placeStake(side, amount)
    .accounts({
      user: user.publicKey,
      bet,
      position: positionPda(bet, user.publicKey),
      pool,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([user])
    .rpc();
}

async function propose(bet: PublicKey, proof: any) {
  const a = buildValidateStatArgs(proof);
  const rootsPda = new PublicKey(ROOTS_FIXTURE.pubkey);
  await program.methods
    .proposeSettlement({
      ts: a.targetTs,
      fixtureSummary: a.fixtureSummary,
      fixtureProof: a.fixtureProof,
      mainTreeProof: a.mainTreeProof,
      statA: a.statA,
      statB: a.statB,
    })
    .accounts({
      proposer: payer.publicKey,
      bet,
      dailyScoresMerkleRoots: rootsPda,
      txoracleProgram: TXORACLE_ID,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
}

// bankrun keeps one blockhash across clock warps, so repeat calls with
// identical bytes get deduplicated — vary a compute-budget ix to keep every
// transaction unique.
let uniq = 0;
const uniqIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 + ++uniq });

const finalize = (bet: PublicKey) =>
  program.methods.finalizeSettlement().accounts({ bet }).preInstructions([uniqIx()]).rpc();

const voidBet = (bet: PublicKey) =>
  program.methods.voidBet().accounts({ bet }).preInstructions([uniqIx()]).rpc();

async function claim(user: Keypair, userToken: PublicKey, bet: PublicKey, pool: PublicKey) {
  await program.methods
    .claim()
    .accounts({
      user: user.publicKey,
      bet,
      position: positionPda(bet, user.publicKey),
      pool,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([user])
    .rpc();
}

const expectError = (p: Promise<unknown>, name: string) =>
  assert.rejects(p, (err: Error) => {
    assert.match(String(err), new RegExp(name), `expected error ${name}, got: ${String(err).slice(0, 300)}`);
    return true;
  });

before(async () => {
  context = await startAnchor(
    ".",
    [{ name: "txoracle", programId: TXORACLE_ID }],
    [
      {
        address: new PublicKey(ROOTS_FIXTURE.pubkey),
        info: {
          lamports: ROOTS_FIXTURE.account.lamports,
          data: Buffer.from(ROOTS_FIXTURE.account.data[0], "base64"),
          owner: new PublicKey(ROOTS_FIXTURE.account.owner),
          executable: false,
        },
      },
      {
        address: PUSDC_MINT,
        info: {
          lamports: 1_461_600, // rent-exempt for an 82-byte mint
          data: pusdcMintAccountData(),
          owner: TOKEN_PROGRAM_ID,
          executable: false,
        },
      },
    ]
  );
  client = context.banksClient;
  payer = context.payer;
  provider = new BankrunProvider(context);
  anchor.setProvider(provider as any);
  const idl = JSON.parse(readFileSync(new URL("../target/idl/propchain.json", import.meta.url), "utf8"));
  program = new anchor.Program(idl, provider as any);

  // fund users + mint pUSDC (the mint account itself was injected at startup)
  usdcMint = PUSDC_MINT;
  aliceToken = getAssociatedTokenAddressSync(usdcMint, alice.publicKey);
  bobToken = getAssociatedTokenAddressSync(usdcMint, bob.publicKey);
  await processIxs(
    [
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: alice.publicKey, lamports: 10_000_000_000 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bob.publicKey, lamports: 10_000_000_000 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: mintAuthority.publicKey, lamports: 1_000_000_000 }),
      createAssociatedTokenAccountInstruction(payer.publicKey, aliceToken, alice.publicKey, usdcMint),
      createAssociatedTokenAccountInstruction(payer.publicKey, bobToken, bob.publicKey, usdcMint),
      createMintToInstruction(usdcMint, aliceToken, mintAuthority.publicKey, 1_000_000_000n),
      createMintToInstruction(usdcMint, bobToken, mintAuthority.publicKey, 1_000_000_000n),
    ],
    [mintAuthority]
  );
});

test("full lifecycle: propose → challenge (later proof replaces) → finalize → claims", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    threshold: 9, // corners were 10 → Over wins
    overStake: usdc(100),
    underStake: usdc(40),
  });

  // propose with game_finalised proof (ts 1783634788478)
  await propose(bet, PROOF_FINALISED);
  let state = await program.account.betConfig.fetch(bet);
  assert.ok(state.status.settlementPending);
  assert.equal(state.pending.result, true);
  assert.equal(state.pending.proofTs.toString(), "1783634788478");

  // finalize blocked during challenge window
  await expectError(finalize(bet), "ChallengeWindowActive");

  // challenge with the later post-final proof (ts 1783635207535) — replaces pending
  await propose(bet, PROOF_FINAL);
  state = await program.account.betConfig.fetch(bet);
  assert.equal(state.pending.proofTs.toString(), "1783635207535");

  // stale re-proposal (finalised, earlier ts) is rejected
  await expectError(propose(bet, PROOF_FINALISED), "ProofNotLater");

  // finalize after the window
  await warpBy(91 * 60);
  await finalize(bet);
  state = await program.account.betConfig.fetch(bet);
  assert.ok(state.status.settled);
  assert.equal(state.result, true);

  // winner claims the whole pool (100 + 40)
  const before = await tokenBalance(aliceToken);
  await claim(alice, aliceToken, bet, pool);
  assert.equal(await tokenBalance(aliceToken) - before, 140_000_000n);

  // loser cannot claim; winner cannot double-claim
  await expectError(claim(bob, bobToken, bet, pool), "NotAWinner");
  await expectError(claim(alice, aliceToken, bet, pool), "AlreadyClaimed");
});

test("mid-match proof is rejected by the final-phase gate", async () => {
  const { bet } = await createBetAndWarpPastKickoff({
    threshold: 3, // halftime corners were 4 — predicate WOULD be true mid-match
    overStake: usdc(10),
    underStake: usdc(10),
  });
  await expectError(propose(bet, PROOF_HALFTIME), "ProofNotFinal");
});

test("Under path: predicate false at final → Under wins", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    threshold: 10, // corners were exactly 10, not > 10 → Under (push rule)
    overStake: usdc(60),
    underStake: usdc(30),
  });
  await propose(bet, PROOF_FINAL);
  const pending = (await program.account.betConfig.fetch(bet)).pending;
  assert.equal(pending.result, false);

  await warpBy(91 * 60);
  await finalize(bet);
  const state = await program.account.betConfig.fetch(bet);
  assert.ok(state.status.settled);
  assert.equal(state.result, false);

  const before = await tokenBalance(bobToken);
  await claim(bob, bobToken, bet, pool);
  assert.equal(await tokenBalance(bobToken) - before, 90_000_000n);
});

test("zero-winner rule: finalize voids and stakes are refundable", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    threshold: 9, // Over wins… but nobody staked Over
    underStake: usdc(25),
  });
  await propose(bet, PROOF_FINAL);
  await warpBy(91 * 60);
  await finalize(bet);
  const state = await program.account.betConfig.fetch(bet);
  assert.ok(state.status.voided);

  const before = await tokenBalance(bobToken);
  await claim(bob, bobToken, bet, pool);
  assert.equal(await tokenBalance(bobToken) - before, 25_000_000n);
});

test("void: blocked before timelock, works after, then refunds; propose blocked", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    overStake: usdc(15),
  });
  await expectError(voidBet(bet), "VoidTimelockActive");

  await warpBy(49 * 3600);
  await voidBet(bet);
  const state = await program.account.betConfig.fetch(bet);
  assert.ok(state.status.voided);

  await expectError(propose(bet, PROOF_FINAL), "BetNotOpen");

  const before = await tokenBalance(aliceToken);
  await claim(alice, aliceToken, bet, pool);
  assert.equal(await tokenBalance(aliceToken) - before, 15_000_000n);
});

test("stat binding: proof for the wrong stat key is rejected", async () => {
  const { bet } = await createBetAndWarpPastKickoff({
    statKeyA: 1, // goals bet…
    statKeyB: 2,
    overStake: usdc(5),
  });
  await expectError(propose(bet, PROOF_FINAL), "StatKeyMismatch"); // …corners proof
});

test("fixture binding: proof for another match is rejected", async () => {
  const { bet } = await createBetAndWarpPastKickoff({
    fixtureId: 99999999,
    overStake: usdc(5),
  });
  await expectError(propose(bet, PROOF_FINAL), "FixtureMismatch");
});

test("GG / both teams to score: France 2-0 -> NG side wins", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    kind: { bothScore: {} },
    statKeyA: 1,
    statKeyB: 2,
    op: null,
    threshold: 0,
    overStake: usdc(10), // Over = GG ("yes")
    underStake: usdc(10), // Under = NG ("no") — Morocco scored 0, NG wins
  });
  await propose(bet, PROOF_GOALS);
  const pending = (await program.account.betConfig.fetch(bet)).pending;
  assert.equal(pending.result, false); // GG did not land

  await warpBy(91 * 60);
  await finalize(bet);
  const before = await tokenBalance(bobToken);
  await claim(bob, bobToken, bet, pool);
  assert.equal(await tokenBalance(bobToken) - before, 20_000_000n);
});

test("winner market: home - away > 0 -> France win side wins", async () => {
  const { bet } = await createBetAndWarpPastKickoff({
    kind: { line: {} },
    statKeyA: 1,
    statKeyB: 2,
    op: { subtract: {} },
    threshold: 0, // France won 2-0 -> 2 - 0 > 0 -> Over (home win) true
    overStake: usdc(5),
    underStake: usdc(5),
  });
  await propose(bet, PROOF_GOALS);
  assert.equal((await program.account.betConfig.fetch(bet)).pending.result, true);
});

test("margin market: home wins by 2+ (subtract > 1) -> true", async () => {
  const { bet } = await createBetAndWarpPastKickoff({
    kind: { line: {} },
    statKeyA: 1,
    statKeyB: 2,
    op: { subtract: {} },
    threshold: 1,
    overStake: usdc(5),
    underStake: usdc(5),
  });
  await propose(bet, PROOF_GOALS);
  assert.equal((await program.account.betConfig.fetch(bet)).pending.result, true);
});

test("create_bet rejects malformed markets", async () => {
  await assert.rejects(
    createBetAndWarpPastKickoff({ kind: { line: {} }, statKeyB: 8, op: null }),
    /InvalidMarket/
  );
  await assert.rejects(
    createBetAndWarpPastKickoff({ kind: { bothScore: {} }, statKeyA: 1, statKeyB: 2, op: { add: {} } }),
    /InvalidMarket/
  );
});

test("create_bet rejects any mint other than pUSDC", async () => {
  const rogueMintKp = Keypair.generate();
  const rent = await client.getRent();
  await processIxs(
    [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: rogueMintKp.publicKey,
        space: MINT_SIZE,
        lamports: Number(rent.minimumBalance(BigInt(MINT_SIZE))),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(rogueMintKp.publicKey, 6, payer.publicKey, null),
    ],
    [rogueMintKp]
  );
  const nonce = nonceCounter++;
  const { bet, pool } = betPdas(nonce);
  await expectError(
    program.methods
      .createBet({
        nonce: new BN(nonce),
        fixtureId: new BN(FIXTURE_ID),
        statKeyA: 7,
        statKeyB: 8,
        op: { add: {} },
        kind: { line: {} },
        comparison: { greater: {} },
        threshold: 9,
        kickoffTs: new BN(Number(await now()) + 1000),
      })
      .accounts({
        creator: alice.publicKey,
        bet,
        usdcMint: rogueMintKp.publicKey,
        pool,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc(),
    "InvalidMint"
  );
});

// ---------- sweep ----------

const sweepIx = (creator: Keypair, creatorToken: PublicKey, bet: PublicKey, pool: PublicKey) =>
  program.methods
    .sweep()
    .accounts({
      creator: creator.publicKey,
      bet,
      pool,
      creatorToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([creator])
    .preInstructions([uniqIx()])
    .rpc();

test("sweep: gates (timelock, creator-only), then reclaims unclaimed residual and closes the vault", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    threshold: 9, // corners 10 > 9 → Over (alice) wins
    overStake: usdc(100),
    underStake: usdc(40),
  });
  await propose(bet, PROOF_FINAL);
  await warpBy(91 * 60);
  await finalize(bet);
  assert.ok((await program.account.betConfig.fetch(bet)).status.settled);

  // Settled, but the 7-day post-void_after window hasn't elapsed.
  await expectError(sweepIx(alice, aliceToken, bet, pool), "SweepTimelockActive");

  // Past the sweep timelock (48h void timelock + 7 days, measured from kickoff).
  await warpBy(48 * 3600 + 7 * 86_400);
  await expectError(sweepIx(bob, bobToken, bet, pool), "NotCreator");

  // Winner never claimed — the full 140 pool is the residual, swept to creator.
  const before = await tokenBalance(aliceToken);
  await sweepIx(alice, aliceToken, bet, pool);
  const after = await tokenBalance(aliceToken);
  assert.equal(after - before, 140_000_000n);
  assert.equal(await client.getAccount(pool), null); // vault closed

  // BetConfig survives as the on-chain settlement record…
  assert.ok((await program.account.betConfig.fetch(bet)).status.settled);
  // …but a claim after sweep fails: the vault no longer exists.
  await assert.rejects(claim(alice, aliceToken, bet, pool));
});

test("sweep: rejected while the bet is not in a terminal state", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    overStake: usdc(5),
    underStake: usdc(5),
  });
  // Way past every timelock, but the bet was never settled or voided.
  await warpBy(48 * 3600 + 8 * 86_400);
  await expectError(sweepIx(alice, aliceToken, bet, pool), "NotTerminal");
});

test("sweep: after void + full refunds, sweeps a zero residual and still closes the vault", async () => {
  const { bet, pool } = await createBetAndWarpPastKickoff({
    overStake: usdc(10),
    underStake: usdc(10),
  });
  await warpBy(48 * 3600 + 60);
  await voidBet(bet);
  await claim(alice, aliceToken, bet, pool);
  await claim(bob, bobToken, bet, pool);
  assert.equal(await tokenBalance(pool), 0n);

  await warpBy(7 * 86_400);
  const before = await tokenBalance(aliceToken);
  await sweepIx(alice, aliceToken, bet, pool);
  assert.equal(await tokenBalance(aliceToken), before); // nothing left to sweep
  assert.equal(await client.getAccount(pool), null); // rent reclaimed, vault closed
});
