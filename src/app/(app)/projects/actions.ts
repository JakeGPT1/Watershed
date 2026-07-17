"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { createAdminClient, JD_BUCKET } from "@/lib/supabase/admin";
import { STAGES } from "@/lib/stages";
import { analyzeJobDescription } from "@/lib/ai";
import { failTo } from "@/lib/formError";

const STATUSES = ["open", "filled", "closed"] as const;

// A single leading marker fences the AI-generated JD analysis inside the notes
// field, so a re-drop refreshes the analysis in place instead of stacking, and
// manual notes added below are always preserved. No closing marker is shown —
// the boundary is just the first blank line after the analysis body (the body
// itself is collapsed to single newlines so it can never contain one).
const JD_START = "━━━ Job description analysis ━━━";

function mergeJdAnalysis(existingNotes: string | null, analysis: string): string {
  const body = analysis.replace(/\n{2,}/g, "\n").trim();
  const block = `${JD_START}\n${body}`;
  const notes = existingNotes ?? "";
  // Strip any prior analysis block: from the marker up to the first blank line (or end).
  const manual = notes
    .replace(new RegExp(`${JD_START}[\\s\\S]*?(?:\\n\\n|$)`), "")
    .trim();
  return manual ? `${block}\n\n${manual}` : block;
}

export async function createProject(formData: FormData) {
  await requireOwner();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) failTo("/projects/new", "Title is required");

  const companyName = String(formData.get("companyName") ?? "").trim();
  let companyId: string | undefined;
  if (companyName) {
    const existing = await prisma.company.findFirst({ where: { name: companyName } });
    const company = existing ?? (await prisma.company.create({ data: { name: companyName } }));
    companyId = company.id;
  }

  const project = await prisma.project.create({
    data: {
      title,
      companyId,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(projectId: string, formData: FormData) {
  await requireOwner();
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    failTo(`/projects/${projectId}`, "Invalid status");
  }
  await prisma.project.update({ where: { id: projectId }, data: { status } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

export async function addCandidatesToProject(projectId: string, formData: FormData) {
  await requireOwner();
  const candidateIds = formData.getAll("candidateIds").map(String).filter(Boolean);

  for (const candidateId of candidateIds) {
    await prisma.projectCandidate.upsert({
      where: { projectId_candidateId: { projectId, candidateId } },
      update: {},
      create: { projectId, candidateId },
    });
  }
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function uploadJobDescription(projectId: string, formData: FormData) {
  await requireOwner();
  const pagePath = `/projects/${projectId}`;
  const file = formData.get("jd") as File | null;
  if (!file || file.size === 0) failTo(pagePath, "No file provided");
  if (file.size > 10 * 1024 * 1024) failTo(pagePath, "File must be under 10MB");

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
  if (!isPdf && !isText) failTo(pagePath, "Upload a PDF or plain-text job description");

  const buffer = Buffer.from(await file.arrayBuffer());

  // Store the original file
  const admin = createAdminClient();
  const path = `${projectId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await admin.storage
    .from(JD_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) failTo(pagePath, `Storage upload failed: ${upErr.message}`);

  // Analyze
  let analysis;
  try {
    analysis = await analyzeJobDescription(
      isPdf ? { pdfBase64: buffer.toString("base64") } : { text: buffer.toString("utf-8") }
    );
  } catch (e) {
    failTo(pagePath, e instanceof Error ? e.message : "Could not analyze job description");
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  await prisma.project.update({
    where: { id: projectId },
    data: {
      notes: mergeJdAnalysis(project.notes, analysis),
      jdFileUrl: path,
      jdFileName: file.name,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function getJdSignedUrl(projectId: string): Promise<string | null> {
  await requireOwner();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.jdFileUrl) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(JD_BUCKET).createSignedUrl(project.jdFileUrl, 3600);
  return data?.signedUrl ?? null;
}

export async function setProjectNotes(projectId: string, formData: FormData) {
  await requireOwner();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await prisma.project.update({ where: { id: projectId }, data: { notes } });
  revalidatePath(`/projects/${projectId}`);
}

export async function addCandidateToProjectFromCandidate(
  candidateId: string,
  formData: FormData
) {
  await requireOwner();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) failTo(`/candidates/${candidateId}`, "Pick a project");

  await prisma.projectCandidate.upsert({
    where: { projectId_candidateId: { projectId, candidateId } },
    update: {},
    create: { projectId, candidateId },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function setStage(projectId: string, candidateId: string, formData: FormData) {
  await requireOwner();
  const stage = String(formData.get("stage") ?? "");
  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    failTo(`/projects/${projectId}`, "Invalid stage");
  }
  await prisma.projectCandidate.update({
    where: { projectId_candidateId: { projectId, candidateId } },
    data: { stage },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/candidates/${candidateId}`);
}

export async function setProjectCandidateNote(
  projectId: string,
  candidateId: string,
  formData: FormData
) {
  await requireOwner();
  const note = String(formData.get("note") ?? "").trim() || null;
  await prisma.projectCandidate.update({
    where: { projectId_candidateId: { projectId, candidateId } },
    data: { note },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeFromProject(projectId: string, candidateId: string) {
  await requireOwner();
  await prisma.projectCandidate.delete({
    where: { projectId_candidateId: { projectId, candidateId } },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/candidates/${candidateId}`);
}
