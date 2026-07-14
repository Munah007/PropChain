import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { FixturesService } from "./fixtures.service";

@Controller("fixtures")
export class FixturesController {
  constructor(private readonly fixtures: FixturesService) {}

  @Get()
  list() {
    return this.fixtures.list();
  }

  @Get(":fixtureId/score")
  score(@Param("fixtureId", ParseIntPipe) fixtureId: number) {
    return this.fixtures.score(fixtureId);
  }
}
