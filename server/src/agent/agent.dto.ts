// 12th Man agent config, per user, with hand-rolled parsing (no class-validator
// in this workspace — mirrors bets.dto). Bounds keep the autonomous spend sane:
// stakes are 0 < min <= max <= 100 pUSDC per pool and at most 50 agent bets a
// day. Teams are the World Cup nation name(s) the agent defends.

import { BadRequestException } from "@nestjs/common";
import { requireNumber, requireString } from "../common/validation";

const MAX_STAKE_PER_POOL = 100; // pUSDC — hard ceiling on any single agent stake
const MAX_BETS_PER_DAY = 50;
const MAX_TEAMS = 8; // generous; a user follows a handful of nations at most

export interface AgentConfig {
  enabled: boolean;
  teams: string[];
  mode: "react" | "seed";
  minStake: number;
  maxStake: number;
  maxBetsPerDay: number;
}

// Safe starting point: OFF, react mode, small per-pool band, modest daily cap.
export const DEFAULT_CONFIG: AgentConfig = {
  enabled: false,
  teams: [],
  mode: "react",
  minStake: 1,
  maxStake: 10,
  maxBetsPerDay: 5,
};

export function parseAgentConfig(body: any): AgentConfig {
  if (!body || typeof body !== "object") throw new BadRequestException("request body required");

  const enabled = body.enabled === true;
  const mode = body.mode === "seed" ? "seed" : body.mode === "react" ? "react" : null;
  if (mode == null) throw new BadRequestException(`mode must be "react" or "seed"`);

  if (body.teams != null && !Array.isArray(body.teams)) {
    throw new BadRequestException("teams must be an array of team names");
  }
  const rawTeams: unknown[] = Array.isArray(body.teams) ? body.teams : [];
  if (rawTeams.length > MAX_TEAMS) {
    throw new BadRequestException(`too many teams (max ${MAX_TEAMS})`);
  }
  // De-dupe while validating each name; requireString trims + bounds length.
  const teams = [...new Set(rawTeams.map((t, i) => requireString(t, `teams[${i}]`)))];
  // A running agent with no team would defend nobody — reject the footgun.
  if (enabled && teams.length === 0) {
    throw new BadRequestException("teams required when the agent is enabled");
  }

  const minStake = requireNumber(body.minStake, "minStake", { min: 0.000001, max: MAX_STAKE_PER_POOL });
  const maxStake = requireNumber(body.maxStake, "maxStake", { min: 0.000001, max: MAX_STAKE_PER_POOL });
  if (minStake > maxStake) {
    throw new BadRequestException("minStake must be <= maxStake");
  }
  const maxBetsPerDay = requireNumber(body.maxBetsPerDay, "maxBetsPerDay", {
    integer: true,
    min: 1,
    max: MAX_BETS_PER_DAY,
  });

  return { enabled, teams, mode, minStake, maxStake, maxBetsPerDay };
}
