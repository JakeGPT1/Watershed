import { prisma } from "@/lib/prisma";

async function main() {
  const c = await prisma.candidate.findFirst({
    where: { source: "website", email: "test+prodintake@example.com" },
    include: { notes: true, tags: { include: { tag: true } } },
  });
  if (!c) {
    console.log("NOT FOUND");
    return;
  }
  const emb = await prisma.$queryRaw<{ has_embedding: boolean }[]>`
    select embedding is not null as has_embedding from "Candidate" where id = ${c.id}
  `;
  console.log(
    JSON.stringify(
      {
        id: c.id,
        name: c.name,
        email: c.email,
        source: c.source,
        resumeUrl: c.resumeUrl,
        summary: c.summary,
        currentTitle: c.currentTitle,
        tagCount: c.tags.length,
        tags: c.tags.map((t) => t.tag.label),
        noteCount: c.notes.length,
        notes: c.notes.map((n) => n.body),
        hasEmbedding: emb[0]?.has_embedding,
      },
      null,
      2
    )
  );
}
main().finally(() => prisma.$disconnect());
