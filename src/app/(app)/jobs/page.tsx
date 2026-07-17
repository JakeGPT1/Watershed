import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runMonitor, winOpportunity, dismissOpportunity, draftBlindEmail, refreshJobMatches } from "./actions";
import { CopyButton } from "./_components/CopyButton";
import { ErrorBanner } from "../_components/ErrorBanner";

export default async function JobsPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const opportunities = await prisma.job.findMany({
    where: { isGtmOpportunity: true },
    include: {
      company: true,
      matches: {
        include: { candidate: true },
        orderBy: { score: "desc" },
      },
      outreach: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ isLeadershipRole: "desc" }, { discoveredAt: "desc" }],
  });

  const unresolvedCount = await prisma.company.count({
    where: { isGtmTarget: true, atsType: "unknown" },
  });
  const pendingCount = await prisma.company.count({
    where: { isGtmTarget: true, atsType: null },
  });

  const myJobs = await prisma.job.findMany({
    where: { externalId: null },
    include: { company: true, _count: { select: { matches: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-3xl">
      <ErrorBanner error={error} clearHref="/jobs" />
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">GTM Opportunities</h1>
        <div className="flex gap-2">
          <Link
            href="/jobs/new"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
          >
            Paste a Job
          </Link>
          <form action={runMonitor}>
            <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Run Monitor Now
            </button>
          </form>
        </div>
      </div>
      <p className="mb-6 text-sm text-stone-500">
        Top GTM hiring signal across your target companies — new/leadership sales &amp; marketing
        postings, auto-matched against your candidate database.
        {pendingCount > 0 && ` ${pendingCount} companies not yet checked.`}
        {unresolvedCount > 0 && ` ${unresolvedCount} companies have no known job board (skipped).`}
      </p>

      {opportunities.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500">
          No opportunities yet — click "Run Monitor Now" to check your target companies.
        </p>
      ) : (
        <div className="space-y-4">
          {opportunities.map((job) => (
            <div key={job.id} className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-stone-900">{job.company?.name ?? "Unknown company"}</h2>
                    {job.isLeadershipRole && (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        Leadership hire
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-700">{job.title}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[job.department, job.location].filter(Boolean).join(" · ") || "—"}
                    {job.postedAt && ` · posted ${job.postedAt.toLocaleDateString()}`}
                  </p>
                  {job.sourceUrl && (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                    >
                      View posting ↗
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={winOpportunity.bind(null, job.id)}>
                    <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
                      Win → Create Project
                    </button>
                  </form>
                  <form action={refreshJobMatches.bind(null, job.id)}>
                    <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
                      Refresh Matches
                    </button>
                  </form>
                  {job.matches.length > 0 && (
                    <form action={draftBlindEmail.bind(null, job.id)}>
                      <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
                        Draft Blind Email
                      </button>
                    </form>
                  )}
                  <form action={dismissOpportunity.bind(null, job.id)}>
                    <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>

              {job.matches.length > 0 && (
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                    Matched candidates
                  </p>
                  <div className="space-y-2">
                    {job.matches.map((m) => (
                      <div key={m.candidateId} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <Link href={`/candidates/${m.candidateId}`} className="font-medium text-stone-900 hover:underline">
                            {m.candidate.name}
                          </Link>
                          <span className="text-stone-500"> — {m.candidate.currentTitle ?? "—"}</span>
                          {m.rationale && <p className="text-xs text-stone-500">{m.rationale}</p>}
                        </div>
                        <span className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                          {Math.round(m.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {job.outreach[0] && (
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                      Blind email draft
                    </p>
                    <CopyButton text={`${job.outreach[0].subject}\n\n${job.outreach[0].body}`} />
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <p className="mb-1 text-sm font-medium text-stone-900">{job.outreach[0].subject}</p>
                    <p className="whitespace-pre-wrap text-sm text-stone-700">{job.outreach[0].body}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-10 text-lg font-medium text-stone-900">My Jobs</h2>
      <p className="mb-4 text-sm text-stone-500">
        Jobs you&apos;ve pasted manually — from referrals, LinkedIn, or anywhere outside your
        monitored GTM companies.
      </p>

      {myJobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          No manual jobs yet — click "Paste a Job" above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Matches</th>
              </tr>
            </thead>
            <tbody>
              {myJobs.map((job) => (
                <tr key={job.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-stone-900 hover:underline">
                      {job.title}
                    </Link>
                    {job.source === "website" && (
                      <span className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        Inbound
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{job.company?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-stone-600">{job._count.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
