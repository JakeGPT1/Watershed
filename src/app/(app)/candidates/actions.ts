"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { createAdminClient, RESUMES_BUCKET, TRANSCRIPTS_BUCKET } from "@/lib/supabase/admin";
import { summarizeTranscript } from "@/lib/ai";
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

  const file = formData.get("resume") as File | null;
  if (file && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) failTo("/candidates/new", "Resume must be under 10MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      await ingestResumeFile(candidate.id, { buffer, type: file.type, name: file.name });
    } catch {
      // Candidate is already created; don't lose it on a parse failure —
      // send the owner to the candidate page where they can retry the upload.
      redirect(
        `/candidates/${candidate.id}?error=${encodeURIComponent(
          "Candidate created, but resume parsing failed — re-upload from here."
        )}`
      );
    }
  }
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
      currentCompany: String(formData.get("currentCompany") ?? "").trim() || null,
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

export async function addNote(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) failTo(pagePath, "Note is empty");

  await prisma.note.create({ data: { candidateId, body } });
  await recomputeCandidateEmbedding(candidateId).catch(console.error);
  revalidatePath(pagePath);
}

export async function addTranscript(candidateId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/candidates/${candidateId}`;
  const file = formData.get("transcript") as File | null;
  if (!file || file.size === 0) failTo(pagePath, "Attach a transcript file");
  if (file.size > 10 * 1024 * 1024) failTo(pagePath, "Transcript must be under 10MB");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || /\.(txt|md|vtt)$/i.test(file.name);
  if (!isPdf && !isText) failTo(pagePath, "Upload a PDF or plain-text transcript");

  const callDateRaw = String(formData.get("callDate") ?? "").trim();
  const callDate = callDateRaw ? new Date(callDateRaw) : new Date();

  const buffer = Buffer.from(await file.arrayBuffer());

  // Store original for later download.
  const admin = createAdminClient();
  const path = `${candidateId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await admin.storage
    .from(TRANSCRIPTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) failTo(pagePath, `Storage upload failed: ${upErr.message}`);

  const rawText = isText ? buffer.toString("utf-8") : null;

  let parsed;
  try {
    parsed = await summarizeTranscript(isPdf ? { pdfBase64: buffer.toString("base64") } : { text: rawText! });
  } catch (e) {
    failTo(pagePath, e instanceof Error ? e.message : "Transcript summarization failed");
  }

  await prisma.transcript.create({
    data: { candidateId, rawText, summary: parsed.summary, fileUrl: path, fileName: file.name, callDate },
  });
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

export async function getTranscriptSignedUrl(transcriptId: string): Promise<string | null> {
  await requireOwner();
  const t = await prisma.transcript.findUnique({ where: { id: transcriptId } });
  if (!t?.fileUrl) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(TRANSCRIPTS_BUCKET).createSignedUrl(t.fileUrl, 3600);
  return data?.signedUrl ?? null;
}

export async function deleteCandidate(candidateId: string) {
  await requireOwner();
  // Collect storage paths first (need them before the rows are gone).
  const c = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { transcripts: { select: { fileUrl: true } } },
  });
  if (!c) redirect("/candidates");

  await prisma.$transaction([
    prisma.match.deleteMany({ where: { candidateId } }),
    prisma.candidateTag.deleteMany({ where: { candidateId } }),
    prisma.note.deleteMany({ where: { candidateId } }),
    prisma.transcript.deleteMany({ where: { candidateId } }),
    prisma.interaction.deleteMany({ where: { candidateId } }),
    prisma.projectCandidate.deleteMany({ where: { candidateId } }),
    prisma.candidate.delete({ where: { id: candidateId } }),
  ]);

  // Best-effort storage cleanup — never block the delete on a storage hiccup.
  try {
    const admin = createAdminClient();
    if (c.resumeUrl) await admin.storage.from(RESUMES_BUCKET).remove([c.resumeUrl]);
    const tPaths = c.transcripts.map((t) => t.fileUrl).filter(Boolean) as string[];
    if (tPaths.length) await admin.storage.from(TRANSCRIPTS_BUCKET).remove(tPaths);
  } catch (e) {
    console.error("deleteCandidate: storage cleanup failed (rows already deleted)", e);
  }

  revalidatePath("/candidates");
  redirect("/candidates");
}

export async function getResumeSignedUrl(candidateId: string): Promise<string | null> {
  await requireOwner();
  const c = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!c?.resumeUrl) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(RESUMES_BUCKET).createSignedUrl(c.resumeUrl, 3600);
  return data?.signedUrl ?? null;
}
