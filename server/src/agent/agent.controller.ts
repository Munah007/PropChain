// 12th Man agent HTTP surface. Every route is auth-guarded and acts on the
// caller's own identity (req.userKey set by SessionAuthGuard) — mirrors
// bets.controller. A user can only ever read/configure/run their OWN agent.

import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { parseAgentConfig } from "./agent.dto";
import { SessionAuthGuard } from "../auth/session-auth.guard";

@Controller("agent")
@UseGuards(SessionAuthGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get()
  status(@Req() req: any) {
    return this.agent.getStatus(req.userKey);
  }

  @Post()
  configure(@Req() req: any, @Body() body: any) {
    // parseAgentConfig throws 400 on anything malformed before we persist.
    return this.agent.setConfig(req.userKey, parseAgentConfig(body));
  }

  // Force one immediate evaluation for the caller — lets a judge press "run
  // now" instead of waiting for the 20s loop.
  @Post("run")
  run(@Req() req: any) {
    return this.agent.runOnce(req.userKey);
  }
}
