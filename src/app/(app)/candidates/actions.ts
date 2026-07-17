"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { createAdminClient, RESUMES_BUCKET } from "@/lib/supabase/admin";
import { parseLinkedIn, tagNote, summarizeTranscript } from "@/lib/ai";
import { applyAiTags, skillsToTags } from "@/lib/tags";
import { recomputeCandidateEmbedding } from "@/lib/embedding";
import { ingestResumeFile } from "@/lib/publicIntake";
import { failTo } from "@/lib/formError";

const LINKEDIN_RE = /^https?:\/\/(www\.)?linkedin\.com\/in\/[^\s]+$/i;

function cleanLinkedInUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = v.startsWith("http") ? v : `https://${v}`;
  if (!LINKEDIN_RE.test(withProto)) throw new Error("LinkedIn URL must look like linkedin.com/in/...");
  return withProto;
}

export async function createCandidate(formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo("/candidates/new", "Name is required");

  let linkedinUrl: string | null;
  try {
    linkedinUrl = cleanLinkedInUrl(String(formData.get("linkedinUrl") ?? ""));
  } catch (e) {
    failTo("/candidates/new", e instanceof Error ? e.message : "Invalid LinkedIn URL");
  }

  const candidate = await prisma.candidate.create({
    data: {
      name,
      currentTitle: String(formData.get("currentTitle") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      compExpect: String(formData.get("compExpect") ?? "").trim() || null,
      linkedinUrl,
    },
  });
  redirect(`/candidates/${candidate.id}`);
}

export async function updateCandidate(candidateId: string, formData: FormData) {
  await requireOwner();
  const editPath = `/candidates/${candidateId}/edit`;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo(editPath, "Name is required");

  let linkedinUrl: string | null;
  try {
    linkedinUrl = cleanLinkedInUrl(String(formData.get("linkedinUrl") ?? ""));
  } catch (e) {
    failTo(editPath, e instanceof Error ? e.message : "Invalid LinkedIn URL");
  }

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      name,
      currentTitle: String(formData.get("currentTitle") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      compExpect: String(formData.get("compExpect") ?? "").trim() || null,
      linkedinUrl,
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
  redirect(`/candidates/${candidateId}`);
}

export async function uploadResume(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const file = formData.get("resume") as File | null;
  if (!file || file.size === 0) failTo(pagePath, "No file provided");
  if (file.size > 10 * 1024 * 1024) failTo(pagePath, "Resume must be under 10MB");

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await ingestResumeFile(candidateId, { buffer, type: file.type, name: file.name });
  } catch (e) {
    failTo(pagePath, e instanceof Error ? e.message : "Resume upload failed");
  }
  revalidatePath(pagePath);
}

export async function pasteLinkedIn(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const rawText = String(formData.get("linkedinText") ?? "").trim();
  if (rawText.length < 40) failTo(pagePath, "Paste the profile text (About/Experience/Skills)");

  const existing = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { tags: { include: { tag: true } } },
  });

  let parsed;
  try {
    parsed = await parseLinkedIn(
      rawText,
      existing.summary,
      existing.tags.map((t) => t.tag.label)
    );
  } catch (e) {
    failTo(pagePath, e instanceof Error ? e.message : "LinkedIn parsing failed");
  }

  // Merge, don't overwrite: fill empty fields; summary only if model returned an improvement
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      linkedinRawText: rawText,
      currentTitle: existing.currentTitle ?? parsed.currentTitle,
      location: existing.location ?? parsed.location,
      summary: parsed.summary ?? existing.summary,
    },
  });
  await applyAiTags(candidateId, skillsToTags(parsed.skills));
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(pagePath);
}

export async function addNote(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) failTo(pagePath, "Note is empty");

  await prisma.note.create({ data: { candidateId, body } });
  const tags = await tagNote(body).catch(() => []);
  await applyAiTags(candidateId, tags);
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(pagePath);
}

export async function addTranscript(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const rawText = String(formData.get("rawText") ?? "").trim();
  if (rawText.length < 40) failTo(pagePath, "Transcript looks too short");
  const callDateRaw = String(formData.get("callDate") ?? "").trim();
  const callDate = callDateRaw ? new Date(callDateRaw) : new Date();

  let parsed;
  try {
    parsed = await summarizeTranscript(rawText);
  } catch (e) {
    failTo(pagePath, e instanceof Error ? e.message : "Transcript summarization failed");
  }

  await prisma.transcript.create({
    data: { candidateId, rawText, summary: parsed.summary, callDate },
  });
  await applyAiTags(candidateId, parsed.tags);
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(pagePath);
}

export async function addManualTag(candidateId: string, formData: FormData) {
  await requireOwner();
  const label = String(formData.get("label") ?? "").trim().toLowerCase();
  if (!label) return;
  const kind = String(formData.get("kind") ?? "other");

  const tag = await prisma.tag.upsert({ where: { label }, update: {}, create: { label, kind } });
  await prisma.candidateTag.upsert({
    where: { candidateId_tagId: { candidateId, tagId: tag.id } },
    update: { source: "manual" }, // manual claim upgrades an ai link — manual tags are sacred
    create: { candidateId, tagId: tag.id, source: "manual" },
  });
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function removeTag(candidateId: string, tagId: string) {
  await requireOwner();
  await prisma.candidateTag.delete({
    where: { candidateId_tagId: { candidateId, tagId } },
  });
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function getResumeSignedUrl(candidateId: string): Promise<string | null> {
  await requireOwner();
  const c = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!c?.resumeUrl) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(RESUMES_BUCKET).createSignedUrl(c.resumeUrl, 3600);
  return data?.signedUrl ?? null;
}
