import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { SessionService } from "./session.service";

@Controller("session")
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Post()
  async createSession(@Body() body: { userKey?: string }) {
    if (!body?.userKey) throw new BadRequestException("userKey required");
    return this.session.getSession(String(body.userKey));
  }
}
