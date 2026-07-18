import { Controller, Get } from "@nestjs/common";
import { TrackRecordService } from "./track-record.service";

@Controller("track-record")
export class TrackRecordController {
  constructor(private readonly trackRecord: TrackRecordService) {}

  /** Public and unauthenticated on purpose: a provability claim nobody can
   *  audit without a session is not a provability claim. */
  @Get()
  list() {
    return this.trackRecord.list();
  }
}
