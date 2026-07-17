const GTM_KEYWORDS = [
  "sales",
  "account executive",
  "account exec",
  "\\bae\\b",
  "sdr",
  "bdr",
  "business development",
  "marketing",
  "demand gen",
  "growth",
  "revenue",
  "revops",
  "\\bgtm\\b",
  "partnerships",
  "customer success",
  "cs manager",
];

const EXCLUDE_KEYWORDS = ["point of sale", "salesforce developer", "salesforce admin", "salesforce engineer"];

// Flagged separately rather than excluded — a real GTM-adjacent role, not a false positive.
const SALES_ENGINEER_RE = /sales engineer/i;

const LEADERSHIP_RE = /\b(vp|vice president|head of|director|cro|cmo)\b/i;

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => new RegExp(p, "i").test(text));
}

export function isGtmRole(title: string, department: string | null): boolean {
  const haystack = `${title} ${department ?? ""}`;
  if (matchesAny(haystack, EXCLUDE_KEYWORDS)) return false;
  return matchesAny(haystack, GTM_KEYWORDS);
}

export function isSalesEngineerRole(title: string): boolean {
  return SALES_ENGINEER_RE.test(title);
}

export function isLeadershipGtmRole(title: string): boolean {
  return LEADERSHIP_RE.test(title) && matchesAny(title, GTM_KEYWORDS);
}

/** Kill switch — flip to false to restore all-locations GTM monitoring. */
export const GTM_US_ONLY = true;

const NON_US_COUNTRY_REGION_MARKERS = [
  "united kingdom",
  "\\buk\\b",
  "england",
  "scotland",
  "wales",
  "ireland",
  "canada",
  "germany",
  "france",
  "spain",
  "italy",
  "netherlands",
  "poland",
  "portugal",
  "sweden",
  "switzerland",
  "india",
  "singapore",
  "australia",
  "japan",
  "china",
  "hong kong",
  "brazil",
  "mexico",
  "argentina",
  "israel",
  "united arab emirates",
  "\\buae\\b",
  "saudi",
  "qatar",
  "\\bemea\\b",
  "\\bapac\\b",
  "\\blatam\\b",
  "middle east",
  "\\beurope\\b",
  "\\basia\\b",
  "eastern europe",
  "nato",
];

const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia", "washington dc",
];

const US_STATE_ABBR_RE =
  /(^|[,\s])(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)([,\s]|$)/i;

const NON_US_CITY_MARKERS = [
  "london",
  "dublin",
  "toronto",
  "vancouver",
  "berlin",
  "munich",
  "paris",
  "madrid",
  "barcelona",
  "amsterdam",
  "bangalore",
  "bengaluru",
  "sydney",
  "melbourne",
  "tokyo",
  "tel aviv",
  "abu dhabi",
  "dubai",
  "são paulo",
  "sao paulo",
  "mexico city",
];

// Major US cities that commonly appear WITHOUT a trailing state/country in job-board
// location strings (e.g. "San Francisco" alone). Without this list those postings fall
// through with no US signal and are wrongly excluded — checked before the non-US city
// blocklist since it's more specific.
const US_CITY_MARKERS = [
  "san francisco",
  "new york",
  "los angeles",
  "chicago",
  "seattle",
  "boston",
  "austin",
  "denver",
  "atlanta",
  "miami",
  "san diego",
  "dallas",
  "houston",
  "phoenix",
  "philadelphia",
  "portland",
  "minneapolis",
  "nashville",
  "salt lake city",
  "san jose",
  "oakland",
  "sacramento",
  "pittsburgh",
  "charlotte",
  "raleigh",
  "columbus",
  "detroit",
  "baltimore",
  "tampa",
  "orlando",
  "las vegas",
];

/**
 * Strict US-only classifier for freeform job-board location strings. Order matters:
 * country/region blocklist first, then US signals, then a city-only blocklist — this is
 * what correctly separates "Dublin, OH" (US) from "Ireland - Dublin Office" (not US).
 * Unknown/blank locations are treated as NOT confirmed US.
 */
export function isUsLocation(location: string | null): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();

  if (matchesAny(lower, NON_US_COUNTRY_REGION_MARKERS)) return false;

  const hasUsPhrase = /(united states|\busa\b|u\.s\.a|u\.s\.|\bus\b)/i.test(lower);
  const hasUsState = matchesAny(lower, US_STATE_NAMES) || US_STATE_ABBR_RE.test(lower);
  const hasUsCity = matchesAny(lower, US_CITY_MARKERS);
  if (hasUsPhrase || hasUsState || hasUsCity) return true;

  if (matchesAny(lower, NON_US_CITY_MARKERS)) return false;

  if (/\bremote\b/i.test(lower)) return true;

  return false;
}
