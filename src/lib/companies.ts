import { prisma } from "@/lib/prisma";
import type { Company } from "@prisma/client";

/** Strip a common legal suffix and collapse whitespace for comparison purposes only —
 *  the stored name keeps whatever the user/AI typed, just trimmed. */
function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co)\b\s*$/i, "")
    .trim()
    .toLowerCase();
}

/** Classic Levenshtein edit distance — fine at this scale (dozens to low hundreds of companies). */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Below this normalized length, fuzzy auto-merge is too risky. A distance-1 edit is trivially
// common between short, UNRELATED real names (verified live: "Brain"/"Bain" and "Vezorq"/"Vezork"
// — both real 1-edit collisions at 5-6 chars — would wrongly auto-merge at a lower floor). The
// bug this helper exists to fix, "Browserbase"/"Broweserbase", is 11-12 chars normalized, well
// clear of this floor, so raising it costs nothing on the real case while cutting off the
// short-name false-positive zone. Anything under this length that's still close gets logged for
// manual review instead of merged automatically.
const MIN_LENGTH_FOR_FUZZY = 9;

/**
 * Find an existing company for this name, or create one. Reuses on an exact
 * (case-insensitive) match. Falls back to a tight fuzzy match (near-typo distance) ONLY
 * when there's a single unambiguous best candidate at a safe length — a short or
 * ambiguous case is logged and a new company is created rather than risk merging two
 * distinct real companies with similar names.
 */
export async function findOrCreateCompany(rawName: string): Promise<Company> {
  const name = rawName.trim();
  const key = normalize(name);

  const exact = await prisma.company.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;

  // Fuzzy pass: pull existing companies once, compare normalized names.
  const all = await prisma.company.findMany({ select: { id: true, name: true } });
  let best: { company: (typeof all)[number]; dist: number } | null = null;
  let secondBestDist = Infinity;
  for (const c of all) {
    const dist = levenshtein(key, normalize(c.name));
    if (!best || dist < best.dist) {
      secondBestDist = best?.dist ?? Infinity;
      best = { company: c, dist };
    } else if (dist < secondBestDist) {
      secondBestDist = dist;
    }
  }

  // Auto-merge threshold: allow ~1 edit per 6 characters, capped at 3, and require the
  // best match to be clearly better than the runner-up (avoids merging into the wrong
  // one of two similar names) AND long enough to be safe (see MIN_LENGTH_FOR_FUZZY).
  const threshold = Math.min(3, Math.max(1, Math.floor(key.length / 6)));
  const safeLength = key.length >= MIN_LENGTH_FOR_FUZZY;
  if (best && safeLength && best.dist <= threshold && best.dist < secondBestDist) {
    console.log(
      `findOrCreateCompany: fuzzy-matched "${name}" -> existing "${best.company.name}" (distance ${best.dist})`
    );
    return prisma.company.findUniqueOrThrow({ where: { id: best.company.id } });
  }
  if (best && best.dist <= threshold + 2) {
    // Close but not auto-merged — surface it so the owner can merge manually if it's the same company.
    console.log(
      `findOrCreateCompany: "${name}" is CLOSE to existing "${best.company.name}" (distance ${best.dist}, safeLength=${safeLength}) but not auto-merged — creating a new row. Review for a possible manual merge.`
    );
  }

  return prisma.company.create({ data: { name } });
}
