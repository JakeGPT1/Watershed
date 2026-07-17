"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { runGtmMonitor } from "@/lib/gtm/monitor";
import { draftBlindOutreach, draftStandardOutreach, extractJobFromJD } from "@/lib/ai";
import { setJobEmbedding } from "@/lib/embedding";
import { matchCandidatesToJob } from "@/lib/matching";

export async function runMonitor(): Promise<void> {
  await requireOwner();
  await runGtmMonitor();
  revalidatePath("/jobs");
}

/** Win an opportunity: create a Project linked to this Job, seeded with its matched candidates. */
export async function winOpportunity(jobId: string) {
  await requireOwner();

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { company: true, matches: true },
  });

  const project = await prisma.project.create({
    data: {
      title: job.company ? `${job.company.name} — ${job.title}` : job.title,
      companyId: job.companyId,
      jobId: job.id,
    },
  });

  if (job.matches.length > 0) {
    await prisma.projectCandidate.createMany({
      data: job.matches.map((m) => ({
        projectId: project.id,
        candidateId: m.candidateId,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/jobs");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

/** Server-side backstop: redact any leaked token of the candidate's real name. */
// Sender identity — never redact, even if a candidate happens to share a name token with
// it (e.g. a candidate literally named "Jake ..." must not blank out the email's own
// signature "Best, Jake / Founder, Watershed").
const PROTECTED_TOKENS = new Set(["jake", "watershed"]);

function redactName(text: string, candidateName: string): string {
  const tokens = candidateName
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PROTECTED_TOKENS.has(t.toLowerCase()));
  let result = text;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return result;
}

/** Draft a blind BD email pitching the top-matched candidate for this opportunity. */
export async function draftBlindEmail(jobId: string) {
  await requireOwner();

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      company: true,
      matches: {
        orderBy: { score: "desc" },
        take: 1,
        include: { candidate: { include: { tags: { include: { tag: true } } } } },
      },
    },
  });

  const top = job.matches[0];
  if (!top) throw new Error("No matched candidate to feature yet");
  const candidate = top.candidate;

  const skills = candidate.tags.map((t) => t.tag.label).join(", ");
  if (!candidate.summary && !skills && !candidate.currentTitle) {
    throw new Error(
      "Top candidate has no profile data yet — add a resume, notes, or LinkedIn text first"
    );
  }

  const draft = await draftBlindOutreach({
    targetCompany: job.company?.name ?? "the company",
    roleTitle: job.title,
    roleContext: `${job.department ?? ""} ${job.rawText.slice(0, 1500)}`.trim(),
    candidateSummary:
      candidate.summary || "(no summary on file — describe only from skills/title/location provided)",
    candidateSeniority: candidate.currentTitle || "(not specified)",
    candidateSkills: skills || "(none listed)",
    candidateLocation: candidate.location || "(not specified)",
  });

  const subject = redactName(draft.subject, candidate.name);
  const body = redactName(draft.body, candidate.name);

  await prisma.outreach.create({
    data: { jobId, subject, body, status: "draft", contactId: null },
  });

  revalidatePath("/jobs");
}

export async function dismissOpportunity(jobId: string) {
  await requireOwner();
  await prisma.job.update({ where: { id: jobId }, data: { isGtmOpportunity: false } });
  revalidatePath("/jobs");
}

/** Paste any job description (not from a monitored GTM company) and match it now. */
export async function createManualJob(formData: FormData) {
  await requireOwner();
  const rawText = String(formData.get("rawText") ?? "").trim();
  if (rawText.length < 40) throw new Error("Paste the full job description");

  const companyName = String(formData.get("companyName") ?? "").trim();
  let companyId: string | undefined;
  if (companyName) {
    const existing = await prisma.company.findFirst({ where: { name: companyName } });
    const company = existing ?? (await prisma.company.create({ data: { name: companyName } }));
    companyId = company.id;
  }

  const extract = await extractJobFromJD(rawText);

  const job = await prisma.job.create({
    data: {
      title: extract.title,
      requirements: extract.requirements,
      rawText,
      companyId,
      sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || null,
      isGtmOpportunity: false,
      externalId: null,
    },
  });

  await setJobEmbedding(job.id, extract.matchText);
  await matchCandidatesToJob(job.id);

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function refreshJobMatches(jobId: string) {
  await requireOwner();
  await matchCandidatesToJob(jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

/** Draft a standard (named) outreach email for a job, optionally addressed to a contact. */
export async function draftOutreach(jobId: string, formData: FormData) {
  await requireOwner();
  const contactId = String(formData.get("contactId") ?? "").trim() || null;

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      company: true,
      matches: {
        orderBy: { score: "desc" },
        take: 3,
        include: { candidate: { include: { tags: { include: { tag: true } } } } },
      },
    },
  });

  if (job.matches.length === 0) {
    throw new Error("No matched candidates yet — run matching first");
  }

  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;

  const draft = await draftStandardOutreach({
    jobTitle: job.title,
    company: job.company?.name ?? "the company",
    contactName: contact?.name ?? null,
    candidates: job.matches.map((m) => ({
      name: m.candidate.name,
      title: m.candidate.currentTitle ?? "",
      skills: m.candidate.tags.map((t) => t.tag.label).join(", "),
      summary: m.candidate.summary ?? "",
      rationale: m.rationale ?? "",
    })),
  });

  await prisma.outreach.create({
    data: { jobId, contactId, subject: draft.subject, body: draft.body, status: "draft" },
  });

  revalidatePath(`/jobs/${jobId}`);
}
