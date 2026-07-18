import { Controller, Get } from "@nestjs/common";
import { SignalsService } from "./signals.service";

@Controller("signals")
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  /** Public: the board is a browse surface, same as fixtures and bets. */
  @Get()
  list() {
    return this.signals.list();
  }
}
