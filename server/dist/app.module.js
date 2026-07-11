"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const web3_js_1 = require("@solana/web3.js");
const solana_constants_1 = require("./solana/solana.constants");
const session_controller_1 = require("./session/session.controller");
const session_service_1 = require("./session/session.service");
const bets_controller_1 = require("./bets/bets.controller");
const bets_service_1 = require("./bets/bets.service");
const wallets_service_1 = require("./wallets/wallets.service");
const funding_service_1 = require("./funding/funding.service");
const txs_service_1 = require("./solana/txs.service");
const fixtures_controller_1 = require("./fixtures/fixtures.controller");
const fixtures_service_1 = require("./fixtures/fixtures.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [session_controller_1.SessionController, bets_controller_1.BetsController, fixtures_controller_1.FixturesController],
        providers: [
            fixtures_service_1.FixturesService,
            {
                provide: solana_constants_1.SOLANA_CONNECTION,
                useFactory: () => new web3_js_1.Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed"),
            },
            wallets_service_1.WalletsService,
            funding_service_1.FundingService,
            txs_service_1.TxsService,
            session_service_1.SessionService,
            bets_service_1.BetsService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map