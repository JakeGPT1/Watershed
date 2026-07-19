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

// Storage-only fallback used when the full ingest pipeline (parse/tags/embedding) throws
// partway through, so we never lose the uploaded resume file itself.
async function storageOnlyUpload(
  candidateId: string,
  file: { buffer: Buffer; type: string; name: string }
): Promise<string> {
  const admin = createAdminClient();
  const path = `${candidateId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: upErr } = await admin.storage
    .from(RESUMES_BUCKET)
    .upload(path, file.buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  await prisma.candidate.update({ where: { id: candidateId }, data: { resumeUrl: path } });
  return path;
}

/** Public candidate intake: creates the Candidate, then runs the same pipeline as an owner resume upload. */
export async function intakeCandidate(input: {
  name: string;
  email: string;
  linkedinUrl?: string;
  resumeFile: { buffer: Buffer; type: string; name: string };
}): Promise<void> {
  // Idempotency guard: a retried submit (e.g. after a client-side timeout on the original
  // request) should not create a second Candidate row for the same person.
  const recentDuplicate = await prisma.candidate.findFirst({
    where: {
      email: input.email,
      source: "website",
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });
  if (recentDuplicate) return;

  const rawLinkedin = input.linkedinUrl?.trim();
  const cleanedLinkedin = rawLinkedin ? cleanLinkedInUrl(rawLinkedin) : null;

  const candidate = await prisma.candidate.create({
    data: {
      name: input.name,
      email: input.email,
      linkedinUrl: cleanedLinkedin,
      source: "website",
    },
  });

  // Keep the lead even if the parse/tag/embedding pipeline throws — upload the resume file
  // first (that part must never be lost), then attempt the rest and degrade on failure.
  let noteBody = "Inbound: submitted via website candidate form.";
  try {
    await ingestResumeFile(candidate.id, input.resumeFile);
  } catch (e) {
    console.error("intakeCandidate: ingestResumeFile failed, attempting storage-only fallback", e);
    try {
      await storageOnlyUpload(candidate.id, input.resumeFile);
      noteBody += " Resume saved but auto-parse failed — open and re-run manually.";
    } catch (storageErr) {
      console.error("intakeCandidate: storage-only fallback also failed", storageErr);
      noteBody += " Resume upload failed entirely — ask the candidate to resend.";
    }
  }

  if (rawLinkedin && !cleanedLinkedin) {
    noteBody += ` Provided LinkedIn (unparsed): ${rawLinkedin}`;
  }

  await prisma.note.create({
    data: {
      candidateId: candidate.id,
      body: noteBody,
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
  const existingCompany = await prisma.company.findFirst({
    where: { name: { equals: input.companyName, mode: "insensitive" } },
  });
  const company = existingCompany ?? (await prisma.company.create({ data: { name: input.companyName } }));

  const existingContact = await prisma.contact.findFirst({
    where: { companyId: company.id, name: { equals: input.contactName, mode: "insensitive" } },
  });
  if (!existingContact) {
    await prisma.contact.create({
      data: { companyId: company.id, name: input.contactName, email: input.email },
    });
  }

  // Only the extract step decides extracted-vs-bare; a throw in embedding/matching must never
  // result in a second Job row (that used to happen because the whole block shared one catch).
  let title = input.roleTitle?.trim() || "Inbound search";
  let requirements: string | null = null;
  let matchText: string | null = null;
  try {
    const extract = await extractJobFromJD(input.jdText);
    // Prefer the client-supplied role title (they know what they're hiring for); fall back
    // to the AI-extracted title only when they didn't give one.
    title = input.roleTitle?.trim() || extract.title;
    requirements = extract.requirements;
    matchText = extract.matchText;
  } catch (e) {
    console.error("intakeJob: extract failed, saving bare job record", e);
  }

  const job = await prisma.job.create({
    data: {
      title,
      requirements,
      rawText: input.jdText,
      companyId: company.id,
      source: "website",
      isGtmOpportunity: false,
      externalId: null,
    },
  });

  if (matchText) {
    await setJobEmbedding(job.id, matchText).catch((e) => console.error("intakeJob: embedding failed", e));
    await matchCandidatesToJob(job.id).catch((e) => console.error("intakeJob: matching failed", e));
  }
}
