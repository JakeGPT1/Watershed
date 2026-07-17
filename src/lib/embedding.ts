import OpenAI from "openai";
import { prisma } from "./prisma";

const openai = new OpenAI({ apiKey: process.env.EMBEDDINGS_API_KEY! });
const MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: MODEL,
    input: text.slice(0, 24000), // stay well under token limits
  });
  return res.data[0].embedding;
}

/**
 * Recompute a candidate's embedding from summary + skills/tags + recent notes
 * + recent transcript SUMMARIES (never raw text — filler dilutes the vector).
 */
export async function recomputeCandidateEmbedding(candidateId: string): Promise<void> {
  const c = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      tags: { include: { tag: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 10 },
      transcripts: { orderBy: { callDate: "desc" }, take: 5, select: { summary: true } },
    },
  });
  if (!c) return;

  const parts = [
    c.currentTitle,
    c.location,
    c.summary,
    c.tags.map((t) => t.tag.label).join(", "),
    ...c.transcripts.map((t) => t.summary).filter(Boolean),
    ...c.notes.map((n) => n.body),
  ].filter(Boolean);

  const text = parts.join("\n");
  if (!text.trim()) return;

  const vector = JSON.stringify(await embed(text));
  await prisma.$executeRaw`update "Candidate" set embedding = ${vector}::vector where id = ${candidateId}`;
}

export async function setJobEmbedding(jobId: string, matchText: string): Promise<void> {
  const vector = JSON.stringify(await embed(matchText));
  await prisma.$executeRaw`update "Job" set embedding = ${vector}::vector where id = ${jobId}`;
}
