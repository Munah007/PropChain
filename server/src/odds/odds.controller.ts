import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { OddsService } from "./odds.service";

@Controller("odds")
export class OddsController {
  constructor(private readonly odds: OddsService) {}

  @Get(":fixtureId")
  fixture(@Param("fixtureId", ParseIntPipe) fixtureId: number) {
    return this.odds.fixture(fixtureId);
  }
}
