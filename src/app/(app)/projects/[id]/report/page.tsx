import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/stages";
import { PrintButton } from "../../_components/PrintButton";

const CONTACT_EMAIL = "jake.braunscheidel@gmail.com";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const longDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default async function ProjectReportPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      company: true,
      candidates: {
        include: { candidate: true },
        orderBy: [{ rank: "asc" }, { addedAt: "asc" }],
      },
    },
  });
  if (!project) notFound();

  const byStage = new Map<string, typeof project.candidates>();
  for (const stage of STAGES) byStage.set(stage, []);
  for (const pc of project.candidates) {
    (byStage.get(pc.stage) ?? byStage.get("Pursuing")!).push(pc);
  }

  const activeStages = STAGES.filter((s) => s !== "Not Interested");
  const now = Date.now();
  const clientName = project.company?.name ?? "the client";

  return (
    <div className="min-h-screen bg-stone-50 print:bg-white">
      {/* Screen-only toolbar */}
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-6 print:hidden">
        <Link href={`/projects/${id}`} className="text-sm text-stone-500 hover:underline">
          ← Back to project
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400">Use &quot;Save as PDF&quot; in the print dialog.</span>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        {/* Header band */}
        <div className="mb-6 flex items-start justify-between border-b border-stone-200 pb-4">
          <div className="text-2xl font-semibold text-stone-900">Watershed</div>
          <div className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium tracking-wide text-stone-500">
            CONFIDENTIAL
          </div>
        </div>
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-stone-900">Candidate Status Report</h1>
          <p className="mt-1 text-lg text-stone-800">{project.title}</p>
          <p className="text-sm text-stone-600">Prepared for {clientName}</p>
          <p className="mt-1 text-xs text-stone-500">
            Prepared {longDate(new Date())} · Watershed · GTM Search
          </p>
        </div>

        {/* Search summary strip */}
        <div className="mb-8 flex flex-wrap gap-4 rounded-xl border border-stone-200 bg-white p-4 print:bg-white">
          <div className="pr-4">
            <div className="text-xs uppercase tracking-wide text-stone-400">Total Candidates</div>
            <div className="text-lg font-semibold text-stone-900">{project.candidates.length}</div>
          </div>
          {activeStages.map((stage) => {
            const rows = byStage.get(stage) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={stage} className="pr-4">
                <div className="text-xs uppercase tracking-wide text-stone-400">{stage}</div>
                <div className="text-lg font-semibold text-stone-900">{rows.length}</div>
              </div>
            );
          })}
          <div className="pr-4">
            <div className="text-xs uppercase tracking-wide text-stone-400">Search Opened</div>
            <div className="text-sm font-medium text-stone-700">{longDate(project.createdAt)}</div>
          </div>
        </div>

        {/* Stage sections */}
        <div className="space-y-8">
          {[...activeStages, "Not Interested" as const].map((stage) => {
            const rows = byStage.get(stage) ?? [];
            if (rows.length === 0) return null;
            const muted = stage === "Not Interested";

            return (
              <div key={stage} className={muted ? "opacity-60" : undefined}>
                <h2 className="mb-3 break-inside-avoid text-sm font-medium uppercase tracking-wide text-stone-500">
                  {muted ? "No Longer in Process" : stage} <span className="text-stone-400">· {rows.length}</span>
                </h2>
                <div className="space-y-3">
                  {rows.map((pc, i) => {
                    const isNew = now - pc.addedAt.getTime() < SEVEN_DAYS_MS;
                    const metaParts = [pc.candidate.location, pc.candidate.compExpect].filter(Boolean);
                    return (
                      <div
                        key={pc.candidateId}
                        className="break-inside-avoid rounded-xl border border-stone-200 bg-white p-4 print:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-stone-900">
                              #{i + 1} {pc.candidate.name}
                              {isNew && (
                                <span className="ml-2 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 print:border print:border-stone-300 print:bg-white">
                                  New this week
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-stone-600">
                              {pc.candidate.currentTitle ?? "—"}
                              {pc.candidate.currentCompany ? `, ${pc.candidate.currentCompany}` : ""}
                            </p>
                            {metaParts.length > 0 && (
                              <p className="mt-0.5 text-xs text-stone-500">{metaParts.join(" · ")}</p>
                            )}
                          </div>
                        </div>
                        {pc.note && <p className="mt-2 text-sm text-stone-700">{pc.note}</p>}
                        <p className="mt-2 text-xs text-stone-400">
                          Presented by Watershed on {longDate(pc.addedAt)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ownership & confidentiality footer */}
        <div className="mt-10 break-inside-avoid rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-500 print:bg-white">
          <p>
            The candidates presented in this report were identified, screened, and introduced to {clientName} by
            Watershed. Each candidate remains represented by Watershed with respect to this search. This document is
            confidential — please do not forward candidate details outside your hiring team, and direct all
            candidate contact through Watershed.
          </p>
          <p className="mt-2">Jake · Watershed · {CONTACT_EMAIL}</p>
        </div>
      </div>
    </div>
  );
}
