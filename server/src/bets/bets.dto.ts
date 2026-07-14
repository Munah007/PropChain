// Bets request DTOs with hand-rolled parsing (no class-validator in this
// workspace). Bounds mirror the on-chain types: stat keys are u16,
// threshold is i32, fixture id / kickoff are u64/i64. Amounts are pUSDC
// (6 decimals) and must stay strictly positive.

import { BadRequestException } from "@nestjs/common";
import { requireNumber } from "../common/validation";

const MAX_AMOUNT = 1_000_000; // pUSDC — generous vs the 100 pUSDC faucet drip
const MAX_U16 = 65_535;
const I32_MIN = -2_147_483_648;
const I32_MAX = 2_147_483_647;

export class OpeningStakeDto {
  side!: "over" | "under";
  amount!: number;

  static from(body: any): OpeningStakeDto {
    const dto = new OpeningStakeDto();
    dto.side = body?.side === "under" ? "under" : "over";
    dto.amount = requireNumber(body?.amount, "opening.amount", { min: 0.000001, max: MAX_AMOUNT });
    return dto;
  }
}

export class CreateBetDto {
  fixtureId!: number;
  statKeyA!: number;
  statKeyB!: number | null;
  op!: "add" | "subtract" | null;
  kind!: "line" | "bothScore";
  comparison!: "greater" | "less";
  threshold!: number;
  kickoffTs!: number;
  opening?: OpeningStakeDto;

  static from(body: any): CreateBetDto {
    if (!body || typeof body !== "object") throw new BadRequestException("request body required");
    const dto = new CreateBetDto();
    dto.fixtureId = requireNumber(body.fixtureId, "fixtureId", {
      integer: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    dto.statKeyA = requireNumber(body.statKeyA, "statKeyA", { integer: true, min: 0, max: MAX_U16 });
    dto.statKeyB =
      body.statKeyB != null
        ? requireNumber(body.statKeyB, "statKeyB", { integer: true, min: 0, max: MAX_U16 })
        : null;
    dto.op = body.op === "add" || body.op === "subtract" ? body.op : null;
    dto.kind = body.kind === "bothScore" ? "bothScore" : "line";
    dto.comparison = body.comparison === "less" ? "less" : "greater";
    dto.threshold = requireNumber(body.threshold, "threshold", {
      integer: true,
      min: I32_MIN,
      max: I32_MAX,
    });
    dto.kickoffTs = requireNumber(body.kickoffTs, "kickoffTs", {
      integer: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    dto.opening = body.opening ? OpeningStakeDto.from(body.opening) : undefined;
    return dto;
  }
}

export class StakeDto {
  side!: "over" | "under";
  amount!: number;

  static from(body: any): StakeDto {
    if (!body || typeof body !== "object") throw new BadRequestException("request body required");
    const dto = new StakeDto();
    dto.side = body.side === "under" ? "under" : "over";
    dto.amount = requireNumber(body.amount, "amount", { min: 0.000001, max: MAX_AMOUNT });
    return dto;
  }
}
