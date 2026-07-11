"use strict";
// Auto-funding on wallet creation: drips devnet SOL for fees and mints pUSDC
// (mock USDC) to bet with. Serialized through a queue to avoid blockhash
// races on signup bursts.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FundingService = void 0;
const common_1 = require("@nestjs/common");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const solana_constants_1 = require("../solana/solana.constants");
const SOL_DRIP = 0.05 * web3_js_1.LAMPORTS_PER_SOL;
const PUSDC_DRIP = 100n * 10n ** 6n; // 100 pUSDC (6 decimals)
let FundingService = class FundingService {
    connection;
    funder;
    statePath = (0, node_path_1.join)(process.env.DATA_DIR ?? process.cwd(), "funder-state.json");
    mint = null;
    queue = Promise.resolve();
    constructor(connection) {
        this.connection = connection;
        // Cloud deploys (Railway etc.): secret content via env, state on a volume.
        if (process.env.FUNDER_SECRET) {
            this.funder = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.FUNDER_SECRET)));
            return;
        }
        const keypairPath = process.env.FUNDER_KEYPAIR ?? (0, node_path_1.join)(process.cwd(), "funder-keypair.json");
        if ((0, node_fs_1.existsSync)(keypairPath)) {
            this.funder = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(JSON.parse((0, node_fs_1.readFileSync)(keypairPath, "utf8"))));
        }
        else {
            this.funder = web3_js_1.Keypair.generate();
            (0, node_fs_1.writeFileSync)(keypairPath, JSON.stringify(Array.from(this.funder.secretKey)));
            console.log(`[funding] generated funder keypair ${this.funder.publicKey.toBase58()} — fund it with devnet SOL`);
        }
    }
    async ensureMint() {
        if (this.mint)
            return this.mint;
        if (process.env.PUSDC_MINT) {
            this.mint = new web3_js_1.PublicKey(process.env.PUSDC_MINT);
            return this.mint;
        }
        if ((0, node_fs_1.existsSync)(this.statePath)) {
            const state = JSON.parse((0, node_fs_1.readFileSync)(this.statePath, "utf8"));
            if (state.pusdcMint) {
                this.mint = new web3_js_1.PublicKey(state.pusdcMint);
                return this.mint;
            }
        }
        this.mint = await (0, spl_token_1.createMint)(this.connection, this.funder, this.funder.publicKey, null, 6);
        (0, node_fs_1.writeFileSync)(this.statePath, JSON.stringify({ pusdcMint: this.mint.toBase58() }, null, 2));
        console.log(`[funding] created pUSDC mint ${this.mint.toBase58()}`);
        return this.mint;
    }
    fund(address) {
        const task = this.queue.then(async () => {
            const recipient = new web3_js_1.PublicKey(address);
            const mint = await this.ensureMint();
            const solTx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
                fromPubkey: this.funder.publicKey,
                toPubkey: recipient,
                lamports: SOL_DRIP,
            }));
            await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, solTx, [this.funder]);
            const ata = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this.connection, this.funder, mint, recipient);
            await (0, spl_token_1.mintTo)(this.connection, this.funder, mint, ata.address, this.funder, PUSDC_DRIP);
        });
        this.queue = task.catch(() => { });
        return task;
    }
};
exports.FundingService = FundingService;
exports.FundingService = FundingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(solana_constants_1.SOLANA_CONNECTION)),
    __metadata("design:paramtypes", [web3_js_1.Connection])
], FundingService);
//# sourceMappingURL=funding.service.js.map