// @propchain/txline — minimal TxLINE client.
// Covers: guest auth → free-tier on-chain subscribe → API token activation,
// REST data endpoints, SSE streams, and conversion of stat-validation
// payloads into validateStat/propose_settlement instruction args.
//
// Spike-verified quirks encoded here:
//  - subscribe weeks must be a multiple of 4
//  - user's TxL (Token-2022) ATA must exist before subscribe
//  - activation message is `${txSig}:${leagues.join(",")}:${jwt}`, nacl-signed
//  - API responses use PascalCase fields (FixtureId, StartTime, Seq, Stats)

import * as anchorNs from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const anchor = (anchorNs as any).default ?? anchorNs;
const { BN } = anchor;

export const TXLINE_CONFIG = {
  mainnet: {
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: "https://api.devnet.solana.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
} as const;

export type TxLineNetwork = keyof typeof TXLINE_CONFIG;

export const WORLD_CUP_COMPETITION_ID = 72;
export const FREE_SERVICE_LEVEL = 1; // 60s delayed; level 12 = real-time (mainnet only)

// TxLINE soccer stat keys (odd = home, even = away); full key = period*1000 + base.
export const STAT_KEYS = {
  goalsHome: 1, goalsAway: 2,
  yellowsHome: 3, yellowsAway: 4,
  redsHome: 5, redsAway: 6,
  cornersHome: 7, cornersAway: 8,
} as const;

export interface TxLineCredentials {
  jwt: string;
  apiToken: string;
  subTxSig: string;
}

export function toBytes32(value: string | number[] | Uint8Array): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value)
    : value instanceof Uint8Array
      ? value
      : (value as string).startsWith("0x")
        ? Buffer.from((value as string).slice(2), "hex")
        : Buffer.from(value as string, "base64");
  if (bytes.length !== 32) throw new Error(`Expected 32 bytes, got ${bytes.length}`);
  return Array.from(bytes);
}

export function toProofNodes(nodes: Array<{ hash: any; isRightSibling: boolean }>) {
  return nodes.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling }));
}

/// Converts a /api/scores/stat-validation payload into the argument list for
/// txoracle.validateStat / propchain.propose_settlement. `threshold` and
/// `comparison` come from the bet, never from the payload.
export function buildValidateStatArgs(validation: any) {
  const fixtureSummary = {
    fixtureId: new BN(validation.summary.fixtureId),
    updateStats: {
      updateCount: validation.summary.updateStats.updateCount,
      minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
  };
  const statA = {
    statToProve: validation.statToProve,
    eventStatRoot: toBytes32(validation.eventStatRoot),
    statProof: toProofNodes(validation.statProof),
  };
  const statB = validation.statToProve2 != null
    ? {
        statToProve: validation.statToProve2,
        eventStatRoot: toBytes32(validation.eventStatRoot),
        statProof: toProofNodes(validation.statProof2),
      }
    : null;
  return {
    targetTs: new BN(validation.summary.updateStats.minTimestamp),
    fixtureSummary,
    fixtureProof: toProofNodes(validation.subTreeProof),
    mainTreeProof: toProofNodes(validation.mainTreeProof),
    statA,
    statB,
    op: statB ? { add: {} } : null,
  };
}

/// Derives the daily_scores_roots PDA for a given event timestamp (ms).
export function dailyScoresRootsPda(targetTsMs: number, programId: PublicKey): PublicKey {
  const epochDay = Math.floor(targetTsMs / 86_400_000);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
    programId
  )[0];
}

export class TxLineClient {
  network: TxLineNetwork;
  config: (typeof TXLINE_CONFIG)[TxLineNetwork];
  creds: TxLineCredentials | null = null;
  statePath: string | null;

  constructor(network: TxLineNetwork = "devnet", statePath: string | null = null) {
    this.network = network;
    this.config = TXLINE_CONFIG[network];
    this.statePath = statePath;
    if (statePath && existsSync(statePath)) {
      this.creds = JSON.parse(readFileSync(statePath, "utf8"));
    }
  }

  /// Full credential bootstrap: guest JWT → on-chain subscribe (free tier)
  /// → API token. Persists to statePath so it runs once per keypair.
  async ensureCredentials(keypair: Keypair, txoracleIdl: any): Promise<TxLineCredentials> {
    if (this.creds?.apiToken) return this.creds;

    const auth = await this.request("/auth/guest/start", { method: "POST" });
    const jwt = auth.token ?? auth;

    const connection = new Connection(this.config.rpcUrl, "confirmed");
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
      commitment: "confirmed",
    });
    const program = new anchor.Program(txoracleIdl, provider);

    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury_v2")],
      this.config.programId
    );
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      this.config.txlMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_matrix")],
      this.config.programId
    );
    const userTokenAccount = getAssociatedTokenAddressSync(
      this.config.txlMint, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      keypair.publicKey, userTokenAccount, keypair.publicKey, this.config.txlMint,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const subTxSig = await program.methods
      .subscribe(FREE_SERVICE_LEVEL, 4) // weeks must be a multiple of 4
      .preInstructions([createAtaIx])
      .accounts({
        user: keypair.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: this.config.txlMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const message = new TextEncoder().encode(`${subTxSig}::${jwt}`);
    const walletSignature = Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString("base64");
    const activation = await this.request("/api/token/activate", {
      method: "POST",
      jwt,
      body: { txSig: subTxSig, walletSignature, leagues: [] },
    });
    const apiToken = activation.token ?? activation;

    this.creds = { jwt, apiToken, subTxSig };
    if (this.statePath) writeFileSync(this.statePath, JSON.stringify(this.creds, null, 2));
    return this.creds;
  }

  async request(path: string, opts: { method?: string; jwt?: string; body?: any } = {}) {
    const jwt = opts.jwt ?? this.creds?.jwt;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    if (this.creds?.apiToken) headers["X-Api-Token"] = this.creds.apiToken;
    const res = await fetch(`${this.config.apiOrigin}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  }

  fixturesSnapshot(startEpochDay?: number, competitionId?: number) {
    const qs = new URLSearchParams();
    if (startEpochDay != null) qs.set("startEpochDay", String(startEpochDay));
    if (competitionId != null) qs.set("competitionId", String(competitionId));
    return this.request(`/api/fixtures/snapshot?${qs}`);
  }

  scoresSnapshot(fixtureId: number, asOf: number = Date.now()) {
    return this.request(`/api/scores/snapshot/${fixtureId}?asOf=${asOf}`);
  }

  statValidation(fixtureId: number, seq: number, statKey: number, statKey2?: number) {
    const qs = new URLSearchParams({ fixtureId: String(fixtureId), seq: String(seq), statKey: String(statKey) });
    if (statKey2 != null) qs.set("statKey2", String(statKey2));
    return this.request(`/api/scores/stat-validation?${qs}`);
  }

  /// Async generator over an SSE stream (scores or odds).
  async *stream(path: string): AsyncGenerator<{ event: string | null; data: any }> {
    if (!this.creds) throw new Error("Call ensureCredentials first");
    const res = await fetch(`${this.config.apiOrigin}${path}`, {
      headers: {
        Authorization: `Bearer ${this.creds.jwt}`,
        "X-Api-Token": this.creds.apiToken,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok || !res.body) throw new Error(`Stream ${path} failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event: string | null = null;
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length) {
          const joined = dataLines.join("\n");
          let data: any = joined;
          try { data = JSON.parse(joined); } catch { /* keep raw */ }
          yield { event, data };
        }
      }
    }
  }

  scoresStream() {
    return this.stream("/api/scores/stream");
  }
}
