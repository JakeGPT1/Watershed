import { prisma } from "./prisma";
import type { ExtractedTag } from "./ai";

const KINDS = new Set(["skill", "seniority", "status", "location", "comp", "vertical", "other"]);

/** Upsert AI-extracted tags onto a candidate. Additive only — never removes anything. */
export async function applyAiTags(candidateId: string, tags: ExtractedTag[]): Promise<void> {
  for (const t of tags) {
    const label = t.label?.trim().toLowerCase();
    if (!label || label.length > 60) continue;
    const kind = KINDS.has(t.kind) ? t.kind : "other";

    const tag = await prisma.tag.upsert({
      where: { label },
      update: {},
      create: { label, kind },
    });
    await prisma.candidateTag.upsert({
      where: { candidateId_tagId: { candidateId, tagId: tag.id } },
      update: {}, // existing link (manual or ai) is never downgraded/overwritten
      create: { candidateId, tagId: tag.id, source: "ai" },
    });
  }
}

/** Skills from resume/LinkedIn parses arrive as bare strings — treat as skill tags. */
export function skillsToTags(skills: string[]): ExtractedTag[] {
  return (skills ?? []).map((s) => ({ label: s, kind: "skill" as const }));
}
