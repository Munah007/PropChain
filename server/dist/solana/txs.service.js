"use strict";
// Builds every propchain program transaction server-side (fee payer = the
// user's server-managed wallet); WalletsService signs and broadcasts.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxsService = void 0;
const common_1 = require("@nestjs/common");
const anchor = __importStar(require("@coral-xyz/anchor"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const solana_constants_1 = require("./solana.constants");
const funding_service_1 = require("../funding/funding.service");
const { BN } = anchor;
let TxsService = class TxsService {
    connection;
    funding;
    program = null;
    usdcMint = null;
    constructor(connection, funding) {
        this.connection = connection;
        this.funding = funding;
    }
    async getProgram() {
        if (!this.program || !this.usdcMint) {
            this.usdcMint = await this.funding.ensureMint();
            const idlPath = process.env.PROPCHAIN_IDL ?? (0, node_path_1.join)(process.cwd(), "..", "target", "idl", "propchain.json");
            const idl = JSON.parse((0, node_fs_1.readFileSync)(idlPath, "utf8"));
            const provider = new anchor.AnchorProvider(this.connection, {
                publicKey: web3_js_1.PublicKey.default,
                signTransaction: async (t) => t,
                signAllTransactions: async (t) => t,
            }, { commitment: "confirmed" });
            this.program = new anchor.Program(idl, provider);
        }
        return { program: this.program, usdcMint: this.usdcMint };
    }
    betPdas(programId, creator, nonce) {
        const [bet] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bet"), creator.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)], programId);
        const [pool] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool"), bet.toBuffer()], programId);
        return { bet, pool };
    }
    positionPda(programId, bet, user) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("position"), bet.toBuffer(), user.toBuffer()], programId)[0];
    }
    async toBase64(tx, feePayer) {
        tx.feePayer = feePayer;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash("confirmed")).blockhash;
        return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    }
    async buildCreateBet(creator, req, opening) {
        const { program, usdcMint } = await this.getProgram();
        const nonce = Date.now(); // unique per creator; u64 on-chain
        const n = new BN(nonce);
        const { bet, pool } = this.betPdas(program.programId, creator, n);
        const tx = new web3_js_1.Transaction();
        tx.add(await program.methods
            .createBet({
            nonce: n,
            fixtureId: new BN(req.fixtureId),
            statKeyA: req.statKeyA,
            statKeyB: req.statKeyB ?? null,
            comparison: req.comparison === "less" ? { less: {} } : { greater: {} },
            threshold: req.threshold,
            kickoffTs: new BN(req.kickoffTs),
        })
            .accounts({
            creator,
            bet,
            usdcMint,
            pool,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction());
        if (opening) {
            tx.add(await this.stakeIx(program, usdcMint, creator, bet, pool, opening.side, opening.amount));
        }
        return { txBase64: await this.toBase64(tx, creator), bet, nonce };
    }
    async stakeIx(program, usdcMint, user, bet, pool, side, amount) {
        return program.methods
            .placeStake(side === "under" ? { under: {} } : { over: {} }, new BN(Math.round(amount * 1_000_000)))
            .accounts({
            user,
            bet,
            position: this.positionPda(program.programId, bet, user),
            pool,
            userToken: (0, spl_token_1.getAssociatedTokenAddressSync)(usdcMint, user),
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .instruction();
    }
    async buildStake(user, bet, side, amount) {
        const { program, usdcMint } = await this.getProgram();
        const [pool] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool"), bet.toBuffer()], program.programId);
        const tx = new web3_js_1.Transaction().add(await this.stakeIx(program, usdcMint, user, bet, pool, side, amount));
        return this.toBase64(tx, user);
    }
    async buildClaim(user, bet) {
        const { program, usdcMint } = await this.getProgram();
        const [pool] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool"), bet.toBuffer()], program.programId);
        const tx = new web3_js_1.Transaction().add(await program.methods
            .claim()
            .accounts({
            user,
            bet,
            position: this.positionPda(program.programId, bet, user),
            pool,
            userToken: (0, spl_token_1.getAssociatedTokenAddressSync)(usdcMint, user),
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .instruction());
        return this.toBase64(tx, user);
    }
    /** All positions for a wallet (memcmp on UserPosition.user at offset 8+32). */
    async listPositions(user) {
        const { program } = await this.getProgram();
        const positions = await program.account.userPosition.all([
            { memcmp: { offset: 8 + 32, bytes: user.toBase58() } },
        ]);
        return positions.map(({ publicKey, account }) => ({
            address: publicKey.toBase58(),
            bet: account.bet.toBase58(),
            side: Object.keys(account.side)[0],
            amount: account.amount.toString(),
            claimed: account.claimed,
        }));
    }
    async listBets() {
        const { program } = await this.getProgram();
        const bets = await program.account.betConfig.all();
        return bets.map(({ publicKey, account }) => ({
            address: publicKey.toBase58(),
            creator: account.creator.toBase58(),
            fixtureId: account.fixtureId.toString(),
            statKeyA: account.statKeyA,
            statKeyB: account.statKeyB,
            comparison: Object.keys(account.comparison)[0],
            threshold: account.threshold,
            kickoffTs: account.kickoffTs.toNumber(),
            status: Object.keys(account.status)[0],
            pending: account.pending
                ? {
                    result: account.pending.result,
                    proofTs: account.pending.proofTs.toString(),
                    challengeDeadlineTs: account.pending.challengeDeadlineTs.toNumber(),
                }
                : null,
            result: account.result,
            overTotal: account.overTotal.toString(),
            underTotal: account.underTotal.toString(),
        }));
    }
};
exports.TxsService = TxsService;
exports.TxsService = TxsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(solana_constants_1.SOLANA_CONNECTION)),
    __metadata("design:paramtypes", [web3_js_1.Connection,
        funding_service_1.FundingService])
], TxsService);
//# sourceMappingURL=txs.service.js.map