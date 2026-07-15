import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { BetsService } from "./bets.service";
import { CreateBetDto, StakeDto } from "./bets.dto";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { parsePublicKey } from "../common/validation";

@Controller("bets")
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Get()
  list() {
    return this.bets.list();
  }

  // Mutations require auth — SessionAuthGuard sets req.userKey from the
  // verified token; the legacy body userKey is never trusted for identity.

  @Post()
  @UseGuards(SessionAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    return this.bets.create(req.userKey, CreateBetDto.from(body));
  }

  @Post(":address/stake")
  @UseGuards(SessionAuthGuard)
  stake(@Param("address") address: string, @Req() req: any, @Body() body: any) {
    return this.bets.stake(parsePublicKey(address, "bet address"), req.userKey, StakeDto.from(body));
  }

  @Post(":address/claim")
  @UseGuards(SessionAuthGuard)
  claim(@Param("address") address: string, @Req() req: any) {
    return this.bets.claim(parsePublicKey(address, "bet address"), req.userKey);
  }
}
