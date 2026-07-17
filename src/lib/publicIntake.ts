import { prisma } from "@/lib/prisma";
import { createAdminClient, RESUMES_BUCKET } from "@/lib/supabase/admin";
import { parseResume, extractJobFromJD } from "@/lib/ai";
import { applyAiTags, skillsToTags } from "@/lib/tags";
import { recomputeCandidateEmbedding, setJobEmbedding } from "@/lib/embedding";
import { matchCandidatesToJob } from "@/lib/matching";

// Shared core behind both the owner's "Upload resume" action and the public
// website intake form — resume parsing/tagging/embedding must behave
// identically no matter who submitted the file. Throws plain Errors; callers
// (owner server action vs public API route) decide how to surface them.
export async function ingestResumeFile(
  candidateId: string,
  file: { buffer: Buffer; type: string; name: string }
): Promise<void> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
  if (!isPdf && !isText) throw new Error("Upload a PDF or plain-text resume");

  const admin = createAdminClient();
  const path = `${candidateId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await admin.storage
    .from(RESUMES_BUCKET)
    .upload(path, file.buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const parsed = await parseResume(
    isPdf ? { pdfBase64: file.buffer.toString("base64") } : { text: file.buffer.toString("utf-8") }
  );

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
}

const LINKEDIN_RE = /^https?:\/\/(www\.)?linkedin\.com\/in\/[^\s]+$/i;

function cleanLinkedInUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = v.startsWith("http") ? v : `https://${v}`;
  return LINKEDIN_RE.test(withProto) ? withProto : null; // silently drop malformed input rather than fail the submission
}

/** Public candidate intake: creates the Candidate, then runs the same pipeline as an owner resume upload. */
export async function intakeCandidate(input: {
  name: string;
  email: string;
  linkedinUrl?: string;
  resumeFile: { buffer: Buffer; type: string; name: string };
}): Promise<void> {
  const candidate = await prisma.candidate.create({
    data: {
      name: input.name,
      email: input.email,
      linkedinUrl: input.linkedinUrl ? cleanLinkedInUrl(input.linkedinUrl) : null,
      source: "website",
    },
  });

  await ingestResumeFile(candidate.id, input.resumeFile);

  await prisma.note.create({
    data: {
      candidateId: candidate.id,
      body: "Inbound: submitted via website candidate form.",
    },
  });
}

/** Public client intake: upserts Company + Contact, then runs the same pipeline as "Paste a Job". */
export async function intakeJob(input: {
  contactName: string;
  email: string;
  companyName: string;
  roleTitle?: string;
  jdText: string;
}): Promise<void> {
  const existingCompany = await prisma.company.findFirst({ where: { name: input.companyName } });
  const company = existingCompany ?? (await prisma.company.create({ data: { name: input.companyName } }));

  const existingContact = await prisma.contact.findFirst({
    where: { companyId: company.id, name: input.contactName },
  });
  if (!existingContact) {
    await prisma.contact.create({
      data: { companyId: company.id, name: input.contactName, email: input.email },
    });
  }

  // Never lose a lead to an AI parse failure — fall back to a bare Job record.
  try {
    const extract = await extractJobFromJD(input.jdText);
    const job = await prisma.job.create({
      data: {
        title: extract.title,
        requirements: extract.requirements,
        rawText: input.jdText,
        companyId: company.id,
        source: "website",
        isGtmOpportunity: false,
        externalId: null,
      },
    });
    await setJobEmbedding(job.id, extract.matchText);
    await matchCandidatesToJob(job.id);
  } catch (e) {
    console.error("intakeJob: extract/embed/match failed, saving bare job record", e);
    await prisma.job.create({
      data: {
        title: input.roleTitle?.trim() || "Inbound search",
        rawText: input.jdText,
        companyId: company.id,
        source: "website",
        isGtmOpportunity: false,
        externalId: null,
      },
    });
  }
}
