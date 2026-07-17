import { fetchPostings } from "./fetchPostings";

const ATS_TYPES = ["greenhouse", "lever", "ashby"] as const;

function slugCandidates(name: string): string[] {
  const lower = name.toLowerCase();
  const noSpace = lower.replace(/[^a-z0-9]+/g, "");
  const hyphenated = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return Array.from(new Set([noSpace, hyphenated]));
}

/**
 * Probe Greenhouse/Lever/Ashby with common slug variants for a company with no
 * known ATS. Cheap, bounded (2 slugs x 3 ATS = 6 requests). Returns null if none
 * resolve — the company is flagged "unknown" and skipped by the monitor, per spec.
 */
export async function discoverAts(
  name: string
): Promise<{ atsType: "greenhouse" | "lever" | "ashby"; atsSlug: string } | null> {
  const candidates = slugCandidates(name);
  for (const slug of candidates) {
    for (const atsType of ATS_TYPES) {
      const postings = await fetchPostings(atsType, slug);
      if (postings && postings.length > 0) {
        return { atsType, atsSlug: slug };
      }
    }
  }
  return null;
}
