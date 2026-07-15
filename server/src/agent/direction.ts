// "Which side of this market roots FOR a given team?" — the core of the 12th
// Man agent. Returns the side ("over"/"under") that pays out when `team` does
// well, or null when the market has no rooting interest for that team.
//
// TxLINE stat keys (odd = home, even = away): 1/2 goals, 3/4 yellow cards,
// 5/6 red cards, 7/8 corners. Goals and corners are GOOD for the team that
// racks them up; cards are BAD. Winner/margin markets are Subtract(home, away).

export interface DirectionalBet {
  statKeyA: number;
  statKeyB: number | null;
  op: "add" | "subtract" | null;
  kind: "line" | "bothScore";
  comparison: "greater" | "less";
}

export interface DirectionalFixture {
  home: string;
  away: string;
}

const isHomeKey = (key: number) => key % 2 === 1;
// Yellow (3/4) and red (5/6) cards: a high count is bad for that team.
const isBadStat = (key: number) => key >= 3 && key <= 6;

/**
 * The side that favors `team`, or null if the market isn't directional for it.
 * Neutral (returns null): markets not involving the team, GG/both-score, and
 * combined two-team totals (Add) like total corners — nobody's "side".
 */
export function proTeamSide(
  bet: DirectionalBet,
  fixture: DirectionalFixture,
  team: string
): "over" | "under" | null {
  const teamIsHome = team === fixture.home;
  const teamIsAway = team === fixture.away;
  if (!teamIsHome && !teamIsAway) return null; // team not in this match

  // GG / both-teams-to-score: both sides scoring, no rooting interest.
  if (bet.kind === "bothScore") return null;

  // Winner / margin: Subtract(home, away). "Over" (home − away greater) favors
  // home; with a "less" comparison it flips to favor away.
  if (bet.op === "subtract" && bet.statKeyB != null) {
    const overFavorsHome = bet.comparison === "greater";
    return teamIsHome === overFavorsHome ? "over" : "under";
  }

  // Combined two-team total (Add), e.g. total corners over N — neutral.
  if (bet.op === "add") return null;

  // Single-team stat: it belongs to whichever team the stat key points at.
  if (bet.statKeyB == null) {
    const statTeamIsHome = isHomeKey(bet.statKeyA);
    const bad = isBadStat(bet.statKeyA);
    // "Over" means a HIGH count. High is good for the stat's team unless it's
    // a card stat; a "less" comparison inverts the whole thing.
    const overFavorsStatTeam = (bet.comparison === "greater") !== bad;
    const teamIsStatTeam = teamIsHome === statTeamIsHome;
    // If the stat is about the OTHER team, what's good for them is bad for us.
    const overFavorsTeam = teamIsStatTeam ? overFavorsStatTeam : !overFavorsStatTeam;
    return overFavorsTeam ? "over" : "under";
  }

  return null;
}
