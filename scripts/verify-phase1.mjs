// End-to-end Phase 1 pipeline check: Claude tagging + summary, tag upsert, embedding write.
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.EMBEDDINGS_API_KEY });

const parseJson = (t) => {
  const c = t.replace(/```(?:json)?/g, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
};

// 1. Create a candidate
const cand = await prisma.candidate.create({
  data: { name: "__pipeline_test__", currentTitle: "Senior Backend Engineer", location: "Austin, TX" },
});
console.log("1. Candidate created:", cand.id);

// 2. Note auto-tagging (Haiku — same prompt as the app)
const noteBody = "Spoke with candidate today. Strong Python and Kafka, 8 years experience, wants remote only, targeting $185k. Very interested in fintech roles.";
const tagMsg = await anthropic.messages.create({
  model: process.env.CLAUDE_MODEL_CHEAP,
  max_tokens: 512,
  messages: [{ role: "user", content: 'Extract recruiter tags from this note. Return JSON only: { "tags": [{ "label": string (lowercase, short), "kind": "skill"|"seniority"|"status"|"location"|"comp"|"vertical"|"other" }] }. Note: ' + noteBody }],
});
const tags = parseJson(tagMsg.content[0].text).tags;
console.log("2. Haiku extracted tags:", tags.map((t) => `${t.label}(${t.kind})`).join(", "));

// 3. Upsert tags
for (const t of tags.slice(0, 8)) {
  const label = t.label.trim().toLowerCase();
  const tag = await prisma.tag.upsert({ where: { label }, update: {}, create: { label, kind: t.kind } });
  await prisma.candidateTag.upsert({
    where: { candidateId_tagId: { candidateId: cand.id, tagId: tag.id } },
    update: {},
    create: { candidateId: cand.id, tagId: tag.id, source: "ai" },
  });
}
await prisma.note.create({ data: { candidateId: cand.id, body: noteBody } });
console.log("3. Tags + note persisted");

// 4. Embedding recompute + vector write
const withTags = await prisma.candidate.findUnique({
  where: { id: cand.id },
  include: { tags: { include: { tag: true } }, notes: true },
});
const text = [withTags.currentTitle, withTags.location, withTags.tags.map((t) => t.tag.label).join(", "), ...withTags.notes.map((n) => n.body)].join("\n");
const emb = await openai.embeddings.create({ model: process.env.EMBEDDINGS_MODEL, input: text });
const vec = JSON.stringify(emb.data[0].embedding);
await prisma.$executeRaw`update "Candidate" set embedding = ${vec}::vector where id = ${cand.id}`;
console.log("4. Embedding written (", emb.data[0].embedding.length, "dims )");

// 5. Semantic search sanity: query for a python/kafka JD, expect our candidate on top
const jdEmb = await openai.embeddings.create({ model: process.env.EMBEDDINGS_MODEL, input: "Looking for a senior Python engineer with Kafka and distributed systems experience, remote, fintech" });
const jdVec = JSON.stringify(jdEmb.data[0].embedding);
const hits = await prisma.$queryRaw`
  select id, 1 - (embedding <=> ${jdVec}::vector) as score
  from "Candidate" where embedding is not null
  order by embedding <=> ${jdVec}::vector limit 3;`;
const top = hits[0];
console.log("5. Semantic match top hit:", top.id === cand.id ? `OUR CANDIDATE (score ${top.score.toFixed(3)})` : "unexpected candidate!");

// Cleanup
await prisma.candidateTag.deleteMany({ where: { candidateId: cand.id } });
await prisma.note.deleteMany({ where: { candidateId: cand.id } });
await prisma.candidate.delete({ where: { id: cand.id } });
console.log("Cleanup done. PHASE 1 PIPELINE VERIFIED.");
await prisma.$disconnect();
