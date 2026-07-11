"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetsService = void 0;
const common_1 = require("@nestjs/common");
const web3_js_1 = require("@solana/web3.js");
const session_service_1 = require("../session/session.service");
const wallets_service_1 = require("../wallets/wallets.service");
const txs_service_1 = require("../solana/txs.service");
let BetsService = class BetsService {
    session;
    wallets;
    txs;
    constructor(session, wallets, txs) {
        this.session = session;
        this.wallets = wallets;
        this.txs = txs;
    }
    requireWallet(userKey) {
        const wallet = userKey ? this.session.getWallet(userKey) : undefined;
        if (!wallet) {
            throw new common_1.BadRequestException(`unknown user ${userKey} — call POST /session first`);
        }
        return wallet;
    }
    /**
     * Send a transaction and surface program errors to the client instead of
     * letting them collapse into a generic 500. Anchor's "Error Code: X" (from
     * simulation logs) or the raw message goes into a 400 body the frontend
     * can translate into human feedback.
     */
    async send(fn) {
        try {
            return await fn();
        }
        catch (err) {
            const logs = err?.logs ?? err?.transactionLogs ?? [];
            const combined = [err?.message ?? String(err), ...logs].join(" | ");
            const anchorError = combined.match(/Error Code: (\w+)/)?.[1];
            throw new common_1.BadRequestException(anchorError ? `Program error: ${anchorError}` : combined.slice(0, 400));
        }
    }
    list() {
        return this.txs.listBets();
    }
    async create(body) {
        const wallet = this.requireWallet(body?.userKey);
        const request = {
            fixtureId: Number(body.fixtureId),
            statKeyA: Number(body.statKeyA),
            statKeyB: body.statKeyB != null ? Number(body.statKeyB) : null,
            comparison: body.comparison === "less" ? "less" : "greater",
            threshold: Number(body.threshold),
            kickoffTs: Number(body.kickoffTs),
        };
        const opening = body.opening
            ? {
                side: body.opening.side === "under" ? "under" : "over",
                amount: Number(body.opening.amount),
            }
            : undefined;
        const { txBase64, bet } = await this.txs.buildCreateBet(new web3_js_1.PublicKey(wallet.address), request, opening);
        const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
        return { bet: bet.toBase58(), signature };
    }
    async stake(betAddress, body) {
        const wallet = this.requireWallet(body?.userKey);
        const txBase64 = await this.txs.buildStake(new web3_js_1.PublicKey(wallet.address), new web3_js_1.PublicKey(betAddress), body.side === "under" ? "under" : "over", Number(body.amount));
        const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
        return { signature };
    }
    async claim(betAddress, body) {
        const wallet = this.requireWallet(body?.userKey);
        const txBase64 = await this.txs.buildClaim(new web3_js_1.PublicKey(wallet.address), new web3_js_1.PublicKey(betAddress));
        const signature = await this.send(() => this.wallets.signAndSend(wallet.walletId, txBase64));
        return { signature };
    }
};
exports.BetsService = BetsService;
exports.BetsService = BetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [session_service_1.SessionService,
        wallets_service_1.WalletsService,
        txs_service_1.TxsService])
], BetsService);
//# sourceMappingURL=bets.service.js.map