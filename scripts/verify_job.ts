import { prisma } from "@/lib/prisma";

async function main() {
  const job = await prisma.job.findFirst({
    where: { source: "website" },
    include: { company: { include: { contacts: true } }, matches: true },
    orderBy: { createdAt: "desc" },
  });
  if (!job) {
    console.log("NOT FOUND");
    return;
  }
  const emb = await prisma.$queryRaw<{ has_embedding: boolean }[]>`
    select embedding is not null as has_embedding from "Job" where id = ${job.id}
  `;
  console.log(
    JSON.stringify(
      {
        id: job.id,
        title: job.title,
        source: job.source,
        externalId: job.externalId,
        companyName: job.company?.name,
        contacts: job.company?.contacts.map((c) => ({ name: c.name, email: c.email })),
        matchCount: job.matches.length,
        hasEmbedding: emb[0]?.has_embedding,
        requirements: job.requirements?.slice(0, 120),
      },
      null,
      2
    )
  );
}
main().finally(() => prisma.$disconnect());
