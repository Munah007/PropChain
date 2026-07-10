import { Module } from "@nestjs/common";
import { Connection } from "@solana/web3.js";

import { SOLANA_CONNECTION } from "./solana/solana.constants";
import { SessionController } from "./session/session.controller";
import { SessionService } from "./session/session.service";
import { BetsController } from "./bets/bets.controller";
import { BetsService } from "./bets/bets.service";
import { WalletsService } from "./wallets/wallets.service";
import { FundingService } from "./funding/funding.service";
import { TxsService } from "./solana/txs.service";



@Module({
  controllers: [SessionController, BetsController],
  providers: [
    {
      provide: SOLANA_CONNECTION,
      useFactory: () =>
        new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed"),
    },
    WalletsService,
    FundingService,
    TxsService,
    SessionService,
    BetsService,
  ],
})
export class AppModule {}
