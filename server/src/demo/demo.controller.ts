import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { DemoService } from "./demo.service";

// Public by design — judges must be able to press the button without a
// session. DemoService enforces the protections instead: one active demo at
// a time (relaunch returns it) and 5 new launches per rolling hour.
@Controller("demo")
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  // 200 (not 201) because relaunching returns the already-active demo — the
  // response shape is identical either way.
  @Post("launch")
  @HttpCode(200)
  launch() {
    return this.demo.launch();
  }

  @Get("status")
  status() {
    return this.demo.status();
  }
}
