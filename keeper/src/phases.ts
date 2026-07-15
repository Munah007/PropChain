// Match-phase routing — pure lookup from TxLINE phase/state codes to the
// keeper action they imply. No I/O and no imports: settlement.ts feeds it
// whatever the latest scores event carries and acts on the verdict.
//
// Code sources (they agree wherever they overlap):
//  - recorded feeds (recordings/scores-*.jsonl): StatusId 1–10 and 100
//    observed live; 100 always arrives with action "game_finalised", and 5
//    showed up briefly at full-time before being amended/finalised.
//  - TxLINE soccer-feed docs: the full phase table below (NS…P, ids 1–19).
//    Note the docs define 5 = F "ended", superseding the older "5 = stoppage"
//    guess in programs/propchain/src/state.rs comments.
//  - program state.rs: FINAL_STAT_PERIODS = [100, 0] (game_finalised /
//    post-final) is the only on-chain settlement gate — so `settle` here
//    means "worth proposing", never "the proof will verify".

export type PhaseAction = "settle" | "hold" | "abandoned" | "unknown";

export interface PhaseRouting {
  action: PhaseAction;
  reason: string;
}

export interface PhaseInput {
  /** Numeric StatusId from a scores event (also matches stat `period` markers). */
  statusId?: number | null;
  /** Letter phase code (NS/H1/…/P), if a feed ever sends one instead. */
  phase?: string | null;
  /** Fixture-level GameState string ("scheduled" observed; abandoned-family handled). */
  gameState?: string | null;
}

interface PhaseDef {
  code: string;
  action: PhaseAction;
  label: string;
}

/** TxLINE soccer phase table (docs ids 1–19, plus feed markers 100 and 0). */
export const PHASES: Record<number, PhaseDef> = {
  1: { code: "NS", action: "hold", label: "not started" },
  2: { code: "H1", action: "hold", label: "first half in play" },
  3: { code: "HT", action: "hold", label: "halftime" },
  4: { code: "H2", action: "hold", label: "second half in play" },
  5: { code: "F", action: "settle", label: "ended after regulation" },
  6: { code: "WET", action: "hold", label: "waiting for extra time" },
  7: { code: "ET1", action: "hold", label: "extra time first half in play" },
  8: { code: "HTET", action: "hold", label: "extra time halftime" },
  9: { code: "ET2", action: "hold", label: "extra time second half in play" },
  10: { code: "FET", action: "settle", label: "ended after extra time" },
  11: { code: "WPE", action: "hold", label: "waiting for penalty shootout" },
  12: { code: "PE", action: "hold", label: "penalty shootout in progress" },
  13: { code: "FPE", action: "settle", label: "ended after penalty shootout" },
  14: { code: "I", action: "hold", label: "interrupted — may resume" },
  15: { code: "A", action: "abandoned", label: "abandoned" },
  16: { code: "C", action: "abandoned", label: "cancelled" },
  17: { code: "TXCC", action: "abandoned", label: "coverage cancelled — no proof will arrive" },
  18: { code: "TXCS", action: "hold", label: "coverage suspended — may resume" },
  19: { code: "P", action: "abandoned", label: "postponed" },
  100: { code: "GF", action: "settle", label: "game finalised" },
  0: { code: "PF", action: "settle", label: "post-final" },
};

const CODE_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(PHASES).map(([id, def]) => [def.code, Number(id)])
);

// GameState strings we recognise. Only "scheduled" has been observed on the
// feed; the abandoned family is included defensively in case the fixture
// state flips before any StatusId event does.
const GAME_STATES: Record<string, PhaseAction> = {
  scheduled: "hold",
  abandoned: "abandoned",
  postponed: "abandoned",
  cancelled: "abandoned",
  canceled: "abandoned",
};

function describe(id: number): string {
  const def = PHASES[id];
  return `${def.label} (phase ${def.code}, StatusId ${id})`;
}

/**
 * Routes whatever phase/state signals are at hand to a keeper action.
 * Precedence: any abandoned-family signal wins; then StatusId; then a letter
 * phase code; then GameState. Unrecognised codes — or no signal at all —
 * route to `unknown`, which the caller must treat as hold-and-log.
 */
export function routePhase(input: PhaseInput): PhaseRouting {
  const statusId = input.statusId ?? null;
  const phase = input.phase?.trim().toUpperCase() || null;
  const gameState = input.gameState?.trim().toLowerCase() || null;

  const statusDef = statusId != null ? PHASES[statusId] : undefined;
  const phaseId = phase != null ? CODE_TO_ID[phase] : undefined;
  const stateAction = gameState != null ? GAME_STATES[gameState] : undefined;

  // 1. Abandoned/postponed/cancelled from ANY recognised field is terminal —
  //    it must veto settlement even if another (stale) field still looks live.
  if (statusDef?.action === "abandoned") {
    return { action: "abandoned", reason: describe(statusId!) };
  }
  if (phaseId != null && PHASES[phaseId].action === "abandoned") {
    return { action: "abandoned", reason: describe(phaseId) };
  }
  if (stateAction === "abandoned") {
    return { action: "abandoned", reason: `${gameState} (GameState)` };
  }

  // 2. Recognised StatusId is the primary signal.
  if (statusId != null) {
    if (!statusDef) return { action: "unknown", reason: `unrecognised StatusId ${statusId}` };
    return { action: statusDef.action, reason: describe(statusId) };
  }

  // 3. Letter phase code, if that is all we were given.
  if (phase != null) {
    if (phaseId == null) return { action: "unknown", reason: `unrecognised phase code ${phase}` };
    return { action: PHASES[phaseId].action, reason: describe(phaseId) };
  }

  // 4. GameState alone ("scheduled" pre-kickoff fixtures carry nothing else).
  if (gameState != null) {
    if (!stateAction) return { action: "unknown", reason: `unrecognised GameState "${gameState}"` };
    return { action: stateAction, reason: `${gameState} (GameState)` };
  }

  return { action: "unknown", reason: "no phase information" };
}
