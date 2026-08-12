// Gate for auto-adding companies to the GTM monitor. Layer 1 harvests companies from wherever
// candidates happen to work, so it picks up plenty that will never be Watershed clients —
// consultancies, staffing firms, mega-enterprises — plus outright junk from resume-parse errors
// (a real example from live data: "Account Executive" saved as a company name).
//
// Bias: this only decides AUTO-ADD. A skipped company is never deleted and can always be added
// manually — so a false skip is cheap, while a false add permanently pollutes the monitor.

export interface IcpFilterResult {
  ok: boolean;
  reason?: string;
}

/** Placeholder / non-company values that leak in from parsing. */
const JUNK_NAMES = new Set([
  "test", "testing", "n/a", "na", "none", "unknown", "null", "-", "—",
  "self-employed", "self employed", "freelance", "independent", "contractor",
  "various", "confidential", "stealth", "student", "unemployed",
]);

/** If the "company" is really a job title, a parse went wrong upstream. */
const JOB_TITLE_MARKERS = [
  "account executive", "account manager", "sales manager", "sales director",
  "marketing manager", "marketing director", "director of", "head of", "vp of",
  "vice president", "chief ", "engineer", "developer", "designer", "recruiter",
  "consultant at", "intern",
];

/**
 * Categories that are structurally never a fit for a boutique GTM search firm:
 * management consultancies, staffing/recruiting firms (direct competitors), and
 * localization/BPO service shops. Matched as whole words where ambiguous.
 */
const EXCLUDED_KEYWORDS = [
  // Management consultancies
  "mckinsey", "deloitte", "accenture", "bain & company", "boston consulting",
  "kpmg", "pwc", "pricewaterhouse", "ernst & young", "booz allen", "capgemini",
  "infosys", "cognizant", "wipro", "tata consultancy",
  // Staffing / recruiting — competitors, not clients
  "staffing", "recruiting", "recruitment", "headhunt", "talent solutions",
  "search partners", "robert half", "korn ferry", "heidrick", "randstad",
  "adecco", "manpower", "aerotek", "insight global", "teksystems", "kforce",
  // Localization / translation / BPO services
  "transperfect", "multilingual", "localization", "lionbridge", "translation",
  // Global mega-enterprises — a boutique search firm doesn't win these
  "siemens", "oracle corporation", "ibm", "accenture", "infosys",
  "deloitte", "general electric", "honeywell", "lockheed",
];

/** Funding stages that fall outside the growth-stage ICP. */
const NON_ICP_STAGES = new Set(["public", "pe-owned", "acquired"]);

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Decide whether a company should be AUTO-ADDED to the GTM monitor.
 * Returns a reason on rejection so the weekly audit can report what it skipped.
 */
export function isLikelyIcpCompany(name: string, fundingStage?: string | null): IcpFilterResult {
  const n = normalize(name);

  if (!n || n.length < 2) return { ok: false, reason: "empty/too-short name" };
  if (JUNK_NAMES.has(n)) return { ok: false, reason: "placeholder name" };

  // Pure-numeric or mostly-punctuation names are parse noise.
  if (/^[\d\W_]+$/.test(n)) return { ok: false, reason: "non-name value" };

  for (const marker of JOB_TITLE_MARKERS) {
    if (n === marker || n.startsWith(marker)) {
      return { ok: false, reason: `looks like a job title ("${name}")` };
    }
  }

  for (const kw of EXCLUDED_KEYWORDS) {
    if (n.includes(kw)) return { ok: false, reason: `excluded category (${kw})` };
  }

  if (fundingStage && NON_ICP_STAGES.has(fundingStage)) {
    return { ok: false, reason: `stage ${fundingStage} is outside growth-stage ICP` };
  }

  return { ok: true };
}
