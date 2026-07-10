// PropChain keeper — Day 1 scope:
//  * authenticate against TxLINE devnet (free World Cup tier)
//  * subscribe to the scores SSE stream
//  * record every event to recordings/scores-<date>.jsonl  (replay is our
//    demo/test lifeline once the tournament — and free data — ends Jul 19)
//
// Day 3 scope (TODO): track open BetConfig accounts via program subscription,
// fetch stat-validation proofs on relevant events, send propose_settlement /
// challenge / finalize_settlement transactions.

import { Keypair } from "@solana/web3.js";
import { TxLineClient } from "@propchain/txline";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? join(REPO_ROOT, "recordings");
const KEYPAIR_PATH = process.env.KEEPER_KEYPAIR ?? join(REPO_ROOT, "keeper", "keeper-keypair.json");
const CREDS_PATH = join(REPO_ROOT, "keeper", "txline-creds.json");
const NETWORK = (process.env.TXLINE_NETWORK ?? "devnet") as "devnet" | "mainnet";

function loadOrCreateKeypair(path: string): Keypair {
  if (existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[keeper] generated keypair ${kp.publicKey.toBase58()} at ${path} — fund it with devnet SOL`);
  return kp;
}

async function main() {
  mkdirSync(RECORDINGS_DIR, { recursive: true });
  const keypair = loadOrCreateKeypair(KEYPAIR_PATH);
  const txline = new TxLineClient(NETWORK, CREDS_PATH);

  const txoracleIdl = JSON.parse(readFileSync(join(REPO_ROOT, "idls", "txoracle.json"), "utf8"));
  await txline.ensureCredentials(keypair, txoracleIdl);
  console.log(`[keeper] TxLINE credentials ready (${NETWORK})`);

  let events = 0;
  while (true) {
    try {
      console.log("[keeper] opening scores stream…");
      for await (const message of txline.scoresStream()) {
        events++;
        const record = { recordedAt: Date.now(), event: message.event, data: message.data };
        const day = new Date().toISOString().slice(0, 10);
        appendFileSync(join(RECORDINGS_DIR, `scores-${day}.jsonl`), JSON.stringify(record) + "\n");
        if (events % 50 === 0) console.log(`[keeper] ${events} events recorded`);
        // TODO(Day 3): match event.data.FixtureId against open bets and
        // drive the propose/challenge/finalize settlement loop.
      }
      console.log("[keeper] stream ended, reconnecting in 5s");
    } catch (err) {
      console.error(`[keeper] stream error: ${(err as Error).message} — reconnecting in 15s`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

main().catch((e) => {
  console.error("[keeper] fatal:", e);
  process.exit(1);
});
