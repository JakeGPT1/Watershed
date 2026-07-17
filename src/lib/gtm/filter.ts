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
