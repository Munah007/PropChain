// Program unit tests: create_bet + place_stake (Day 1 scope).
// Run via `anchor test` (spins a local validator and sets ANCHOR_* env vars).

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const { BN } = anchor;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const payer = (provider.wallet as anchor.Wallet).payer;
const idl = JSON.parse(readFileSync(new URL("../target/idl/propchain.json", import.meta.url), "utf8"));
const program = new anchor.Program(idl, provider);

const USDC_DECIMALS = 6;
const usdc = (n: number) => new BN(n * 10 ** USDC_DECIMALS);

let usdcMint: PublicKey;
const alice = Keypair.generate(); // creator, stakes Over
const bob = Keypair.generate(); // stakes Under
let aliceToken: PublicKey;
let bobToken: PublicKey;

function betPdas(creator: PublicKey, nonce: anchor.BN) {
  const [bet] = PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), creator.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), bet.toBuffer()],
    program.programId
  );
  return { bet, pool };
}

function positionPda(bet: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), bet.toBuffer(), user.toBuffer()],
    program.programId
  )[0];
}

const baseArgs = (nonce: number, overrides: Record<string, unknown> = {}) => ({
  nonce: new BN(nonce),
  fixtureId: new BN(18209181),
  statKeyA: 7, // home corners
  statKeyB: 8, // away corners → Add(7, 8) = total corners
  op: { add: {} },
  kind: { line: {} },
  comparison: { greater: {} },
  threshold: 10,
  kickoffTs: new BN(Math.floor(Date.now() / 1000) + 3600),
  ...overrides,
});

async function createBet(nonce: number, overrides: Record<string, unknown> = {}) {
  const args = baseArgs(nonce, overrides);
  const { bet, pool } = betPdas(alice.publicKey, args.nonce as anchor.BN);
  await program.methods
    .createBet(args)
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
  return { bet, pool, args };
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

before(async () => {
  for (const kp of [alice, bob]) {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }
  usdcMint = await createMint(provider.connection, payer, payer.publicKey, null, USDC_DECIMALS);
  aliceToken = await createAssociatedTokenAccount(provider.connection, payer, usdcMint, alice.publicKey);
  bobToken = await createAssociatedTokenAccount(provider.connection, payer, usdcMint, bob.publicKey);
  await mintTo(provider.connection, payer, usdcMint, aliceToken, payer, 1_000n * 10n ** 6n);
  await mintTo(provider.connection, payer, usdcMint, bobToken, payer, 1_000n * 10n ** 6n);
});

test("create_bet initialises config and empty pool", async () => {
  const { bet, pool, args } = await createBet(1);
  const state = await program.account.betConfig.fetch(bet);

  assert.equal(state.creator.toBase58(), alice.publicKey.toBase58());
  assert.equal(state.fixtureId.toNumber(), 18209181);
  assert.equal(state.statKeyA, 7);
  assert.equal(state.statKeyB, 8);
  assert.equal(state.threshold, 10);
  assert.ok(state.status.open);
  assert.equal(state.overTotal.toNumber(), 0);
  assert.equal(state.underTotal.toNumber(), 0);
  assert.equal(
    state.voidAfterTs.toNumber(),
    (args.kickoffTs as anchor.BN).toNumber() + 48 * 3600
  );

  const poolAcc = await getAccount(provider.connection, pool);
  assert.equal(poolAcc.amount, 0n);
  assert.equal(poolAcc.owner.toBase58(), bet.toBase58());
});

test("create_bet rejects past kickoff", async () => {
  await assert.rejects(
    createBet(2, { kickoffTs: new BN(Math.floor(Date.now() / 1000) - 60) }),
    /KickoffInPast/
  );
});

test("create_bet rejects invalid stat keys", async () => {
  await assert.rejects(createBet(3, { statKeyA: 9 }), /InvalidStatKey/);
  await assert.rejects(createBet(4, { statKeyA: 7, statKeyB: 6009 }), /InvalidStatKey/);
});

test("place_stake moves USDC and tracks totals per side", async () => {
  const { bet, pool } = await createBet(5);

  await stake(alice, aliceToken, bet, pool, { over: {} }, usdc(100));
  await stake(bob, bobToken, bet, pool, { under: {} }, usdc(40));

  const state = await program.account.betConfig.fetch(bet);
  assert.equal(state.overTotal.toNumber(), usdc(100).toNumber());
  assert.equal(state.underTotal.toNumber(), usdc(40).toNumber());

  const poolAcc = await getAccount(provider.connection, pool);
  assert.equal(poolAcc.amount, BigInt(usdc(140).toString()));

  const alicePos = await program.account.userPosition.fetch(positionPda(bet, alice.publicKey));
  assert.ok(alicePos.side.over);
  assert.equal(alicePos.amount.toNumber(), usdc(100).toNumber());
  assert.equal(alicePos.claimed, false);
});

test("top-up on the same side accumulates; opposite side is rejected", async () => {
  const { bet, pool } = await createBet(6);

  await stake(alice, aliceToken, bet, pool, { over: {} }, usdc(10));
  await stake(alice, aliceToken, bet, pool, { over: {} }, usdc(15));

  const pos = await program.account.userPosition.fetch(positionPda(bet, alice.publicKey));
  assert.equal(pos.amount.toNumber(), usdc(25).toNumber());

  await assert.rejects(
    stake(alice, aliceToken, bet, pool, { under: {} }, usdc(1)),
    /SideMismatch/
  );
});

test("place_stake rejects zero amount", async () => {
  const { bet, pool } = await createBet(7);
  await assert.rejects(
    stake(alice, aliceToken, bet, pool, { over: {} }, new BN(0)),
    /AmountZero/
  );
});
