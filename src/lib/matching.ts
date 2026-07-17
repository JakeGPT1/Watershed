import { prisma } from "@/lib/prisma";
import { matchRationale } from "@/lib/ai";

const DEFAULT_MATCH_LIMIT = 5;

/**
 * Ranks candidates against a Job's embedding (pgvector cosine similarity), generates a
 * fit rationale for each, and upserts Match rows. Used by both the GTM monitor (auto-match
 * on discovery) and manual JD paste. Requires the Job to already have an embedding set.
 * Returns the number of matches written.
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

  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  let written = 0;
  for (const hit of hits) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: hit.id },
      include: { tags: { include: { tag: true } } },
    });
    if (!candidate) continue;

    const candidateSummary = [
      candidate.summary,
      candidate.currentTitle,
      candidate.tags.map((t) => t.tag.label).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
    const jobRequirements = `${job.title} — ${job.department ?? ""}\n${job.rawText.slice(0, 2000)}`;

    const rationale = await matchRationale(jobRequirements, candidateSummary).catch(() => null);

    await prisma.match.upsert({
      where: { jobId_candidateId: { jobId, candidateId: hit.id } },
      update: { score: hit.score, rationale },
      create: { jobId, candidateId: hit.id, score: hit.score, rationale },
    });
    written++;
  }
  return written;
}
