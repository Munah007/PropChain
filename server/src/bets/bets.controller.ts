import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { BetsService } from "./bets.service";

@Controller("bets")
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Get()
  list() {
    return this.bets.list();
  }

  @Post()
  create(@Body() body: any) {
    return this.bets.create(body);
  }

  @Post(":address/stake")
  stake(@Param("address") address: string, @Body() body: any) {
    return this.bets.stake(address, body);
  }

  @Post(":address/claim")
  claim(@Param("address") address: string, @Body() body: any) {
    return this.bets.claim(address, body);
  }
}
