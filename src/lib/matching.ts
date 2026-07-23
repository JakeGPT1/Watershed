import { prisma } from "@/lib/prisma";
import { matchRationale } from "@/lib/ai";

const DEFAULT_MATCH_LIMIT = 5;

/**
 * Ranks candidates against a Job's embedding (pgvector cosine similarity) and upserts Match
 * rows with scores. Ranking-only and cost-free (no Claude calls) — the fit rationale is
 * generated separately, on demand, via generateMatchRationale when the owner clicks the button
 * on a ranked candidate. Any rationale already generated is PRESERVED across re-ranks.
 * Used by both the GTM monitor (auto-match on discovery) and manual JD paste. Requires the Job
 * to already have an embedding set. Returns the number of matches written.
 */
export async function matchCandidatesToJob(
  jobId: string,
  limit: number = DEFAULT_MATCH_LIMIT
): Promise<number> {
  const hits = await prisma.$queryRaw<{ id: string; score: number }[]>`
    select c.id, 1 - (c.embedding <=> j.embedding) as score
    from "Candidate" c, "Job" j
    where j.id = ${jobId} and c.embedding is not null and j.embedding is not null
    order by c.embedding <=> j.embedding limit ${limit};
  `;
  if (hits.length === 0) return 0;

  // Prune stale matches — a candidate that fell out of the top N no longer belongs here.
  await prisma.match.deleteMany({
    where: { jobId, candidateId: { notIn: hits.map((h) => h.id) } },
  });

  for (const hit of hits) {
    await prisma.match.upsert({
      where: { jobId_candidateId: { jobId, candidateId: hit.id } },
      update: { score: hit.score }, // preserve any existing rationale
      create: { jobId, candidateId: hit.id, score: hit.score, rationale: null },
    });
  }
  return hits.length;
}

/** Generate + store the fit rationale for a single job↔candidate match (one Sonnet call). */
export async function generateMatchRationale(jobId: string, candidateId: string): Promise<string | null> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { tags: { include: { tag: true } } },
  });
  if (!candidate) return null;

  const candidateSummary = [
    candidate.summary,
    candidate.currentTitle,
    candidate.tags.map((t) => t.tag.label).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const jobRequirements = `${job.title} — ${job.department ?? ""}\n${job.rawText.slice(0, 2000)}`;

  const rationale = await matchRationale(jobRequirements, candidateSummary).catch(() => null);
  await prisma.match.update({
    where: { jobId_candidateId: { jobId, candidateId } },
    data: { rationale },
  });
  return rationale;
}
