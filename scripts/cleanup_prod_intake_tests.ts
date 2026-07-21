import { prisma } from "@/lib/prisma";
import { createAdminClient, RESUMES_BUCKET } from "@/lib/supabase/admin";

async function main() {
  const deleted: string[] = [];

  const candidate = await prisma.candidate.findFirst({
    where: { source: "website", email: "test+prodintake@example.com" },
  });
  if (candidate) {
    if (candidate.resumeUrl) {
      const admin = createAdminClient();
      const { error } = await admin.storage.from(RESUMES_BUCKET).remove([candidate.resumeUrl]);
      deleted.push(`storage:${candidate.resumeUrl}${error ? ` (error: ${error.message})` : ""}`);
    }
    await prisma.candidateTag.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.note.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.transcript.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.interaction.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.match.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.projectCandidate.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.candidate.delete({ where: { id: candidate.id } });
    deleted.push(`candidate:${candidate.id} (${candidate.name})`);
  }

  const job = await prisma.job.findFirst({
    where: { source: "website", title: { contains: "VP of Sales" } },
  });
  if (job) {
    await prisma.match.deleteMany({ where: { jobId: job.id } });
    await prisma.outreach.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    deleted.push(`job:${job.id} (${job.title})`);
  }

  const company = await prisma.company.findFirst({ where: { name: "Prod Test Intake Co" } });
  if (company) {
    await prisma.contact.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    deleted.push(`company:${company.id} (Prod Test Intake Co, + its contacts)`);
  }

  console.log(deleted.length ? deleted.join("\n") : "Nothing to clean up.");
}
main().finally(() => prisma.$disconnect());
