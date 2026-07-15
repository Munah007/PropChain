// Country → flag emoji for the 48 World Cup teams in the feed. Flags make the
// board scannable at a glance — you recognise a match by its flags before you
// read the names. Built from ISO-3166 codes (regional-indicator pairs), with
// tag-sequence overrides for the home nations.

const ISO: Record<string, string> = {
  Algeria: "DZ",
  Argentina: "AR",
  Australia: "AU",
  Austria: "AT",
  Belgium: "BE",
  "Bosnia & Herzegovina": "BA",
  Brazil: "BR",
  Canada: "CA",
  "Cape Verde": "CV",
  Colombia: "CO",
  "Congo DR": "CD",
  Croatia: "HR",
  Curacao: "CW",
  "Czech Republic": "CZ",
  Ecuador: "EC",
  Egypt: "EG",
  France: "FR",
  Germany: "DE",
  Ghana: "GH",
  Haiti: "HT",
  Iran: "IR",
  Iraq: "IQ",
  "Ivory Coast": "CI",
  Japan: "JP",
  Jordan: "JO",
  Mexico: "MX",
  Morocco: "MA",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Norway: "NO",
  Panama: "PA",
  Paraguay: "PY",
  Portugal: "PT",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Senegal: "SN",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Tunisia: "TN",
  Turkey: "TR",
  USA: "US",
  Uruguay: "UY",
  Uzbekistan: "UZ",
};

// Home nations aren't ISO countries — GB subdivision tag sequences.
const SPECIAL: Record<string, string> = {
  England: "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  Scotland: "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  Wales: "🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
};

const codeToEmoji = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Flag emoji for a team, or a neutral globe when we don't recognise it. */
export function flag(team: string | undefined | null): string {
  if (!team) return "🏳️";
  if (SPECIAL[team]) return SPECIAL[team];
  const iso = ISO[team];
  return iso ? codeToEmoji(iso) : "🏳️";
}

/** Every team we can show a flag for, alphabetical — for the team picker. */
export const TEAMS: string[] = [...Object.keys(ISO), ...Object.keys(SPECIAL)].sort();
