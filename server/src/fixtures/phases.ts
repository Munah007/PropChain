// Which TxLINE StatusId values mean "this match is over" for display purposes.
//
// The authoritative phase table lives in keeper/src/phases.ts — it drives
// settlement and carries the full docs/feed provenance. This is a read-only
// subset for the board, duplicated rather than imported because the keeper is
// ESM-with-type-stripping and the server is a CommonJS nest build: there is no
// shared compile step between them. Keep the two in sync — if a StatusId is
// added there, add it here.
//
// Deliberately NOT the same question the keeper asks. The keeper's `settle`
// gate is "can we prove a final stat on-chain" (FINAL_STAT_PERIODS = [100, 0]).
// This is the weaker "should the UI stop saying LIVE", which is also true for
// matches that ended after ET/pens but aren't finalised yet, and for abandoned
// fixtures that will never finalise at all.

/** Play is over and a result stands: F, FET, FPE, game finalised, post-final. */
const ENDED_STATUS_IDS = new Set([5, 10, 13, 100, 0]);

/** Play stopped for good with no result: abandoned, cancelled, coverage
 *  cancelled, postponed. Excludes 14 (I) and 18 (TXCS) — both may resume. */
const ABANDONED_STATUS_IDS = new Set([15, 16, 17, 19]);

/**
 * True when play ended with a result that stands. Narrower than isMatchOver:
 * an abandoned fixture is over, but it never produced a result.
 */
export function isMatchEnded(statusId: number | null | undefined): boolean {
  return statusId != null && ENDED_STATUS_IDS.has(statusId);
}

/**
 * True when the match has stopped for good — ended or abandoned. Unknown or
 * missing status returns false, so callers fall back to their own heuristic
 * rather than blanking a match that may well still be in play.
 */
export function isMatchOver(statusId: number | null | undefined): boolean {
  return isMatchEnded(statusId) || (statusId != null && ABANDONED_STATUS_IDS.has(statusId));
}
