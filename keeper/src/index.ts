// PropChain keeper: two concurrent duties.
//
//  1. RECORD — subscribe to TxLINE's scores SSE stream and append every event
//     to recordings/scores-<date>.jsonl (replay is our demo/test lifeline once
//     the tournament — and free data — ends Jul 19).
//  2. SETTLE — reconcile every open bet against the freshest TxLINE proof:
//     propose at match finality, challenge wrong pending results, finalize
//     lapsed windows, void abandoned bets. See settlement.ts.
//
// Permissionless: anyone can run this binary against the public program.

import { Connection, Keypair } from "@solana/web3.js";
import { TxLineClient, type TxLineNetwork } from "@propchain/txline";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SettlementEngine } from "./settlement.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? join(REPO_ROOT, "recordings");
const KEYPAIR_PATH = process.env.KEEPER_KEYPAIR ?? join(REPO_ROOT, "keeper", "keeper-keypair.json");
const CREDS_PATH = join(REPO_ROOT, "keeper", "txline-creds.json");
const NETWORK = (process.env.TXLINE_NETWORK ?? "devnet") as TxLineNetwork;
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILE_INTERVAL_MS ?? 30_000);

function loadOrCreateKeypair(path: string): Keypair {
  if (process.env.KEEPER_SECRET) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_SECRET)));
  }
  if (existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[keeper] generated keypair ${kp.publicKey.toBase58()} at ${path} — fund it with devnet SOL`);
  return kp;
}

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_CAP_MS = 30_000;

async function recordStream(txline: TxLineClient) {
  let events = 0;
  // Exponential backoff between reconnects, capped at 30s; a productive
  // connection (at least one frame, heartbeats count) resets it.
  let backoffMs = RECONNECT_BASE_MS;
  while (true) {
    let productive = false;
    try {
      console.log("[keeper] opening scores stream…");
      for await (const message of txline.scoresStream()) {
        productive = true;
        events++;
        const record = { recordedAt: Date.now(), event: message.event, data: message.data };
        const day = new Date().toISOString().slice(0, 10);
        appendFileSync(join(RECORDINGS_DIR, `scores-${day}.jsonl`), JSON.stringify(record) + "\n");
        if (events % 50 === 0) console.log(`[keeper] ${events} events recorded`);
      }
      if (productive) backoffMs = RECONNECT_BASE_MS;
      console.log(`[keeper] stream ended, reconnecting in ${backoffMs / 1000}s`);
    } catch (err) {
      if (productive) backoffMs = RECONNECT_BASE_MS;
      console.error(`[keeper] stream error: ${(err as Error).message} — reconnecting in ${backoffMs / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, backoffMs));
    if (!productive) backoffMs = Math.min(backoffMs * 2, RECONNECT_CAP_MS);
  }
}

async function settlementLoop(engine: SettlementEngine) {
  while (true) {
    try {
      await engine.reconcile();
    } catch (err) {
      console.error(`[settle] reconcile failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, RECONCILE_INTERVAL_MS));
  }
}

async function main() {
  mkdirSync(RECORDINGS_DIR, { recursive: true });
  const keypair = loadOrCreateKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const txline = new TxLineClient(NETWORK, CREDS_PATH);
  if (process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN) {
    txline.creds = { jwt: process.env.TXLINE_JWT, apiToken: process.env.TXLINE_API_TOKEN, subTxSig: "" };
  }

  const txoracleIdl = JSON.parse(readFileSync(join(REPO_ROOT, "idls", "txoracle.json"), "utf8"));
  await txline.ensureCredentials(keypair, txoracleIdl);
  console.log(`[keeper] TxLINE credentials ready (${NETWORK})`);

  const propchainIdl = JSON.parse(
    readFileSync(join(REPO_ROOT, "target", "idl", "propchain.json"), "utf8")
  );
  const engine = new SettlementEngine(connection, keypair, txline, propchainIdl, NETWORK);
  console.log(`[keeper] settlement engine armed (reconcile every ${RECONCILE_INTERVAL_MS / 1000}s)`);

  await Promise.all([recordStream(txline), settlementLoop(engine)]);
}

main().catch((e) => {
  console.error("[keeper] fatal:", e);
  process.exit(1);
});
