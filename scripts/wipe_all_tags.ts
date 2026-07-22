import { prisma } from "../src/lib/prisma";
import { embed } from "../src/lib/embedding";
import { matchCandidatesToJob } from "../src/lib/matching";

// One-off: the old tag taxonomy (auto-tagged skills/notes/transcripts) was noise. This wipes
// every Tag + CandidateTag, then rebuilds affected candidates' embeddings WITHOUT tags in the
// text (inlined here rather than calling recomputeCandidateEmbedding per-candidate, which would
// re-rank every live GTM opportunity once per candidate — wasteful; we re-rank ONCE at the end
// instead). Idempotent: running it again with zero tags left is a harmless no-op.
async function main() {
  const affected = await prisma.candidateTag.findMany({
    select: { candidateId: true },
    distinct: ["candidateId"],
  });
  const affectedIds = affected.map((a) => a.candidateId);
  console.log(`Affected candidates: ${affectedIds.length}`);

  const tagDeleteCount = await prisma.candidateTag.deleteMany({});
  const tagCount = await prisma.tag.deleteMany({});
  console.log(`Deleted ${tagDeleteCount.count} CandidateTag links, ${tagCount.count} Tag rows.`);

  for (const candidateId of affectedIds) {
    const c = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 10 },
        transcripts: { orderBy: { callDate: "desc" }, take: 5, select: { summary: true } },
      },
    });
    if (!c) continue;

    const parts = [
      c.currentTitle,
      c.location,
      c.summary,
      ...c.transcripts.map((t) => t.summary).filter(Boolean),
      ...c.notes.map((n) => n.body),
    ].filter(Boolean);
    const text = parts.join("\n");
    if (!text.trim()) continue;

    const vector = JSON.stringify(await embed(text));
    await prisma.$executeRaw`update "Candidate" set embedding = ${vector}::vector where id = ${candidateId}`;
  }
  console.log(`Recomputed embeddings for ${affectedIds.length} candidates (tags excluded).`);

  const liveOpps = await prisma.job.findMany({ where: { isGtmOpportunity: true }, select: { id: true } });
  for (const j of liveOpps) {
    await matchCandidatesToJob(j.id).catch((e) => console.error("re-rank failed for job", j.id, e));
  }
  console.log(`Re-ranked ${liveOpps.length} live GTM opportunities.`);

  const remainingTags = await prisma.tag.count();
  const remainingLinks = await prisma.candidateTag.count();
  console.log(`Verification — remaining Tag count: ${remainingTags}, remaining CandidateTag count: ${remainingLinks}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
