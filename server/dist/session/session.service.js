"use strict";
// Session bootstrap: first call for a userKey creates a server-managed
// wallet and auto-funds it; later calls return the wallet with live balances.
//
// AUTH NOTE (pre-launch TODO): userKey is caller-supplied for now. Before the
// demo goes public the frontend sends its Privy access token instead and we
// derive userKey via privy.verifyAuthToken().
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
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const solana_constants_1 = require("../solana/solana.constants");
const wallets_service_1 = require("../wallets/wallets.service");
const funding_service_1 = require("../funding/funding.service");
let SessionService = class SessionService {
    connection;
    wallets;
    funding;
    usersPath = (0, node_path_1.join)(process.cwd(), "users.json");
    users;
    constructor(connection, wallets, funding) {
        this.connection = connection;
        this.wallets = wallets;
        this.funding = funding;
        this.users = (0, node_fs_1.existsSync)(this.usersPath)
            ? JSON.parse((0, node_fs_1.readFileSync)(this.usersPath, "utf8"))
            : {};
    }
    getWallet(userKey) {
        return this.users[userKey];
    }
    async getSession(userKey) {
        let created = false;
        if (!this.users[userKey]) {
            this.users[userKey] = await this.wallets.createWallet(userKey);
            (0, node_fs_1.writeFileSync)(this.usersPath, JSON.stringify(this.users, null, 2));
            await this.funding.fund(this.users[userKey].address);
            created = true;
        }
        const wallet = this.users[userKey];
        const address = new web3_js_1.PublicKey(wallet.address);
        const sol = (await this.connection.getBalance(address)) / web3_js_1.LAMPORTS_PER_SOL;
        let pusdc = 0;
        try {
            const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(await this.funding.ensureMint(), address);
            pusdc = Number((await (0, spl_token_1.getAccount)(this.connection, ata)).amount) / 1_000_000;
        }
        catch {
            /* no ATA yet */
        }
        return { userKey, address: wallet.address, sol, pusdc, created, provider: this.wallets.kind };
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(solana_constants_1.SOLANA_CONNECTION)),
    __metadata("design:paramtypes", [web3_js_1.Connection,
        wallets_service_1.WalletsService,
        funding_service_1.FundingService])
], SessionService);
//# sourceMappingURL=session.service.js.map