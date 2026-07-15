// Pickable teams for the 12th Man agent — the 48 World Cup nations plus the
// major club sides, grouped by competition. A curated list (not free text) so
// a team is always spelled the way fixtures name it: no typos, no mismatches.

import { TEAMS as NATIONS } from "./flags";

export interface TeamOption {
  name: string;
  group: string; // "National teams" | league name
}

const CLUBS: Record<string, string[]> = {
  "Premier League": [
    "Arsenal", "Aston Villa", "Brighton", "Chelsea", "Crystal Palace", "Everton",
    "Fulham", "Liverpool", "Manchester City", "Manchester United", "Newcastle United",
    "Nottingham Forest", "Tottenham Hotspur", "West Ham United", "Wolves",
  ],
  "La Liga": [
    "Athletic Bilbao", "Atlético Madrid", "Barcelona", "Real Betis", "Girona",
    "Real Madrid", "Real Sociedad", "Sevilla", "Valencia", "Villarreal",
  ],
  "Serie A": [
    "Atalanta", "Bologna", "Fiorentina", "Inter Milan", "Juventus", "Lazio",
    "AC Milan", "Napoli", "Roma", "Torino",
  ],
  Bundesliga: [
    "Bayer Leverkusen", "Bayern Munich", "Borussia Dortmund", "Borussia Mönchengladbach",
    "Eintracht Frankfurt", "RB Leipzig", "VfB Stuttgart", "Wolfsburg",
  ],
  "Ligue 1": [
    "Lens", "Lille", "Lyon", "Marseille", "Monaco", "Nice", "Paris Saint-Germain", "Rennes",
  ],
  "Other clubs": [
    "Ajax", "Benfica", "Celtic", "Feyenoord", "Galatasaray", "PSV Eindhoven",
    "Porto", "Rangers", "Sporting CP",
  ],
};

export const TEAM_OPTIONS: TeamOption[] = [
  ...NATIONS.map((name) => ({ name, group: "National teams" })),
  ...Object.entries(CLUBS).flatMap(([group, names]) => names.map((name) => ({ name, group }))),
];

// name → group, so we can label a chosen team (national vs which league).
export const TEAM_GROUP = new Map(TEAM_OPTIONS.map((t) => [t.name, t.group]));

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Search teams by name OR league. Typing "premier" surfaces the Premier League
 * clubs; "united" surfaces every United; "" returns everything. Already-picked
 * teams are excluded. Capped so the list stays snappy.
 */
export function searchTeams(query: string, exclude: string[] = []): TeamOption[] {
  const q = norm(query.trim());
  const chosen = new Set(exclude);
  return TEAM_OPTIONS.filter(
    (t) => !chosen.has(t.name) && (q === "" || norm(t.name).includes(q) || norm(t.group).includes(q))
  ).slice(0, 40);
}
