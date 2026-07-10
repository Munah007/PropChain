import { Controller, Get } from "@nestjs/common";
import { FixturesService } from "./fixtures.service";

@Controller("fixtures")
export class FixturesController {
  constructor(private readonly fixtures: FixturesService) {}

  @Get()
  list() {
    return this.fixtures.list();
  }
}
