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
import { FixturesController } from "./fixtures/fixtures.controller";
import { FixturesService } from "./fixtures/fixtures.service";
import { AuthService } from "./auth/auth.service";
import { SessionAuthGuard } from "./auth/session-auth.guard";
import { SessionThrottleGuard } from "./auth/session-throttle.guard";
import { DemoController } from "./demo/demo.controller";
import { DemoService } from "./demo/demo.service";
import { OddsController } from "./odds/odds.controller";
import { OddsService } from "./odds/odds.service";
import { AgentController } from "./agent/agent.controller";
import { AgentService } from "./agent/agent.service";

@Module({
  controllers: [SessionController, BetsController, FixturesController, DemoController, OddsController, AgentController],
  providers: [
    FixturesService,
    DemoService,
    OddsService,
    AgentService,
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
    AuthService,
    SessionAuthGuard,
    SessionThrottleGuard,
  ],
})
export class AppModule {}
