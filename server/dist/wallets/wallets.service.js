"use strict";
// All user wallets are created and signed SERVER-SIDE (pattern borrowed from
// NectarFi's mobile-server PrivyService). Two providers behind one interface:
//
//  * privy — production path: wallets live in Privy's TEE, created per user,
//    signed/sent via Privy's wallet RPC API.
//  * local — dev fallback when PRIVY_APP_ID/SECRET are absent: keypairs on
//    disk, same interface, so the whole API works without credentials.
//
// The frontend never builds, signs, or holds anything.
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
exports.WalletsService = void 0;
const common_1 = require("@nestjs/common");
const web3_js_1 = require("@solana/web3.js");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const solana_constants_1 = require("../solana/solana.constants");
// CAIP-2 chain ids Privy expects (first 32 chars of the genesis hash).
const CAIP2 = {
    devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};
let WalletsService = class WalletsService {
    connection;
    kind = "local";
    privy = null;
    network = (process.env.SOLANA_NETWORK ?? "devnet");
    keysPath = (0, node_path_1.join)(process.cwd(), "local-wallets.json");
    keys = {};
    constructor(connection) {
        this.connection = connection;
    }
    async onModuleInit() {
        const appId = process.env.PRIVY_APP_ID;
        const appSecret = process.env.PRIVY_APP_SECRET;
        if (appId && appSecret) {
            const { PrivyClient } = await Promise.resolve().then(() => __importStar(require("@privy-io/server-auth")));
            this.privy = new PrivyClient(appId, appSecret);
            this.kind = "privy";
            console.log("[wallets] provider: privy (server-managed wallets)");
        }
        else {
            this.keys = (0, node_fs_1.existsSync)(this.keysPath)
                ? JSON.parse((0, node_fs_1.readFileSync)(this.keysPath, "utf8"))
                : {};
            console.log("[wallets] provider: LOCAL DEV FALLBACK (set PRIVY_APP_ID/PRIVY_APP_SECRET for Privy)");
        }
    }
    /** Create the Solana wallet for a user key (email / privy DID). */
    async createWallet(userKey) {
        if (this.privy) {
            const wallet = await this.privy.walletApi.createWallet({ chainType: "solana" });
            return { walletId: wallet.id, address: wallet.address };
        }
        if (!this.keys[userKey]) {
            const kp = web3_js_1.Keypair.generate();
            this.keys[userKey] = Array.from(kp.secretKey);
            (0, node_fs_1.writeFileSync)(this.keysPath, JSON.stringify(this.keys));
        }
        const kp = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(this.keys[userKey]));
        return { walletId: userKey, address: kp.publicKey.toBase58() };
    }
    /** Sign a base64-serialized transaction with the user's wallet and send it. */
    async signAndSend(walletId, txBase64) {
        if (this.privy) {
            const { hash } = await this.privy.walletApi.solana.signAndSendTransaction({
                walletId,
                caip2: CAIP2[this.network],
                transaction: web3_js_1.Transaction.from(Buffer.from(txBase64, "base64")),
            });
            return hash;
        }
        const secret = this.keys[walletId];
        if (!secret)
            throw new Error(`No local wallet for ${walletId}`);
        const kp = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secret));
        const tx = web3_js_1.Transaction.from(Buffer.from(txBase64, "base64"));
        tx.partialSign(kp);
        const sig = await this.connection.sendRawTransaction(tx.serialize());
        await this.connection.confirmTransaction(sig, "confirmed");
        return sig;
    }
};
exports.WalletsService = WalletsService;
exports.WalletsService = WalletsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(solana_constants_1.SOLANA_CONNECTION)),
    __metadata("design:paramtypes", [web3_js_1.Connection])
], WalletsService);
//# sourceMappingURL=wallets.service.js.map