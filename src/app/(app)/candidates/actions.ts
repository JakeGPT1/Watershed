"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { createAdminClient, RESUMES_BUCKET } from "@/lib/supabase/admin";
import { parseResume, parseLinkedIn, tagNote, summarizeTranscript } from "@/lib/ai";
import { applyAiTags, skillsToTags } from "@/lib/tags";
import { recomputeCandidateEmbedding } from "@/lib/embedding";

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
  if (!name) throw new Error("Name is required");

  const candidate = await prisma.candidate.create({
    data: {
      name,
      currentTitle: String(formData.get("currentTitle") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      compExpect: String(formData.get("compExpect") ?? "").trim() || null,
      linkedinUrl: cleanLinkedInUrl(String(formData.get("linkedinUrl") ?? "")),
    },
  });
  redirect(`/candidates/${candidate.id}`);
}

export async function updateCandidate(candidateId: string, formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      name,
      currentTitle: String(formData.get("currentTitle") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      compExpect: String(formData.get("compExpect") ?? "").trim() || null,
      linkedinUrl: cleanLinkedInUrl(String(formData.get("linkedinUrl") ?? "")),
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
  redirect(`/candidates/${candidateId}`);
}

export async function uploadResume(candidateId: string, formData: FormData) {
  await requireOwner();
  const file = formData.get("resume") as File | null;
  if (!file || file.size === 0) throw new Error("No file provided");
  if (file.size > 10 * 1024 * 1024) throw new Error("Resume must be under 10MB");

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
  if (!isPdf && !isText) throw new Error("Upload a PDF or plain-text resume");

  // Store the file
  const admin = createAdminClient();
  const path = `${candidateId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await admin.storage
    .from(RESUMES_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  // Parse with Claude (native PDF support)
  const parsed = await parseResume(
    isPdf ? { pdfBase64: buffer.toString("base64") } : { text: buffer.toString("utf-8") }
  );

  // Fill fields — resume parse fills empty fields, never clobbers user-entered values
  const existing = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      resumeUrl: path,
      currentTitle: existing.currentTitle ?? parsed.currentTitle,
      location: existing.location ?? parsed.location,
      compExpect: existing.compExpect ?? parsed.compExpect,
      summary: existing.summary ?? parsed.summary,
    },
  });
  await applyAiTags(candidateId, skillsToTags(parsed.skills));
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function pasteLinkedIn(candidateId: string, formData: FormData) {
  await requireOwner();
  const rawText = String(formData.get("linkedinText") ?? "").trim();
  if (rawText.length < 40) throw new Error("Paste the profile text (About/Experience/Skills)");

  const existing = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { tags: { include: { tag: true } } },
  });

  const parsed = await parseLinkedIn(
    rawText,
    existing.summary,
    existing.tags.map((t) => t.tag.label)
  );

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
  revalidatePath(`/candidates/${candidateId}`);
}

export async function addNote(candidateId: string, formData: FormData) {
  await requireOwner();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Note is empty");

  await prisma.note.create({ data: { candidateId, body } });
  const tags = await tagNote(body).catch(() => []);
  await applyAiTags(candidateId, tags);
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function addTranscript(candidateId: string, formData: FormData) {
  await requireOwner();
  const rawText = String(formData.get("rawText") ?? "").trim();
  if (rawText.length < 40) throw new Error("Transcript looks too short");
  const callDateRaw = String(formData.get("callDate") ?? "").trim();
  const callDate = callDateRaw ? new Date(callDateRaw) : new Date();

  const parsed = await summarizeTranscript(rawText);
  await prisma.transcript.create({
    data: { candidateId, rawText, summary: parsed.summary, callDate },
  });
  await applyAiTags(candidateId, parsed.tags);
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(`/candidates/${candidateId}`);
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
