// PropChain funder service.
// POST /fund { "address": "<pubkey>" }
//   → sends 0.05 SOL (fees) and mints 100 pUSDC (mock USDC) to the address.
// Called by the app backend on first Privy login so judges/users never touch
// a faucet. Devnet only — pUSDC is a mint this service controls.

import http from "node:http";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const PORT = Number(process.env.FUNDER_PORT ?? 8787);
const KEYPAIR_PATH = process.env.FUNDER_KEYPAIR ?? join(ROOT, "funder-keypair.json");
const STATE_PATH = join(ROOT, "funder-state.json");

const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL;
const PUSDC_DRIP = 100n * 10n ** 6n; // 100 pUSDC, 6 decimals

function loadOrCreateKeypair(path: string): Keypair {
  if (existsSync(path)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[funder] generated keypair ${kp.publicKey.toBase58()} — fund it with devnet SOL`);
  return kp;
}

const connection = new Connection(RPC_URL, "confirmed");
const funder = loadOrCreateKeypair(KEYPAIR_PATH);

async function ensureMint(): Promise<PublicKey> {
  if (existsSync(STATE_PATH)) {
    const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    if (state.pusdcMint) return new PublicKey(state.pusdcMint);
  }
  const mint = await createMint(connection, funder, funder.publicKey, null, 6);
  writeFileSync(STATE_PATH, JSON.stringify({ pusdcMint: mint.toBase58() }, null, 2));
  console.log(`[funder] created pUSDC mint ${mint.toBase58()}`);
  return mint;
}

// One-at-a-time queue: avoids blockhash races and double-funding bursts.
const funded = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();

async function fund(address: string, mint: PublicKey) {
  const recipient = new PublicKey(address);
  const solTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: recipient, lamports: SOL_DRIP })
  );
  const { sendAndConfirmTransaction } = await import("@solana/web3.js");
  await sendAndConfirmTransaction(connection, solTx, [funder]);
  const ata = await getOrCreateAssociatedTokenAccount(connection, funder, mint, recipient);
  await mintTo(connection, funder, mint, ata.address, funder, PUSDC_DRIP);
}

const mintPromise = ensureMint();

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST" || req.url !== "/fund") return res.writeHead(404).end();

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    queue = queue.then(async () => {
      try {
        const { address } = JSON.parse(body);
        if (!address) throw new Error("address required");
        if (funded.has(address)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ status: "already_funded" }));
        }
        await fund(address, await mintPromise);
        funded.add(address);
        console.log(`[funder] funded ${address}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "funded", sol: 0.05, pusdc: 100 }));
      } catch (err) {
        console.error(`[funder] error: ${(err as Error).message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  });
});

server.listen(PORT, () => console.log(`[funder] listening on :${PORT} (rpc ${RPC_URL})`));
