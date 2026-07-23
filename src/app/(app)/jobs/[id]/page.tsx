import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { refreshJobMatches, draftOutreach, generateRationale } from "../actions";
import { CopyButton } from "../_components/CopyButton";
import { ErrorBanner } from "../../_components/ErrorBanner";

export default async function JobPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      company: { include: { contacts: { orderBy: { name: "asc" } } } },
      matches: {
        orderBy: { score: "desc" },
        include: { candidate: { include: { tags: { include: { tag: true } } } } },
      },
      outreach: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!job) notFound();

  return (
    <div className="max-w-3xl">
      <ErrorBanner error={error} clearHref={`/jobs/${id}`} />
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-stone-900">{job.title}</h1>
          {job.isGtmOpportunity && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              GTM opportunity
            </span>
          )}
          {job.isLeadershipRole && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              Leadership hire
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {job.company ? (
            <Link href={`/companies/${job.company.id}`} className="hover:underline">
              {job.company.name}
            </Link>
          ) : (
            "No company"
          )}
          {[job.department, job.location].filter(Boolean).length > 0 &&
            ` · ${[job.department, job.location].filter(Boolean).join(" · ")}`}
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

        {job.requirements && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Requirements</p>
            <p className="whitespace-pre-wrap text-sm text-stone-700">{job.requirements}</p>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-stone-500">Show full job description</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            {job.rawText}
          </p>
        </details>
      </div>

      {/* Matches */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Matched candidates
          </p>
          <form action={refreshJobMatches.bind(null, job.id)}>
            <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
              Refresh Matches
            </button>
          </form>
        </div>

        {job.matches.length === 0 ? (
          <p className="text-sm text-stone-400">
            No matches yet — candidates need an embedding (add a resume, notes, or LinkedIn text
            to a candidate first), then click Refresh Matches.
          </p>
        ) : (
          <div className="space-y-2">
            {job.matches.map((m) => (
              <div key={m.candidateId} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <Link href={`/candidates/${m.candidateId}`} className="font-medium text-stone-900 hover:underline">
                    {m.candidate.name}
                  </Link>
                  <span className="text-stone-500"> — {m.candidate.currentTitle ?? "—"}</span>
                  {m.rationale ? (
                    <div className="mt-0.5 flex items-start gap-2">
                      <p className="text-xs text-stone-500">{m.rationale}</p>
                      <form action={generateRationale.bind(null, job.id, m.candidateId)}>
                        <button className="shrink-0 text-xs text-blue-700 hover:underline" title="Regenerate (uses one AI call)">
                          ↻
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={generateRationale.bind(null, job.id, m.candidateId)} className="mt-0.5">
                      <button className="rounded-md border border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-50">
                        Generate rationale
                      </button>
                    </form>
                  )}
                </div>
                <span className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                  {Math.round(m.score * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outreach */}
      {job.matches.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Draft outreach
          </p>
          <form action={draftOutreach.bind(null, job.id)} className="flex items-center gap-2">
            <select
              name="contactId"
              defaultValue=""
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-stone-500"
            >
              <option value="">— no specific contact —</option>
              {job.company?.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.title ? ` (${c.title})` : ""}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
              Draft Outreach
            </button>
          </form>

          {job.outreach[0] && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Draft</p>
                <CopyButton text={`${job.outreach[0].subject}\n\n${job.outreach[0].body}`} />
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="mb-1 text-sm font-medium text-stone-900">{job.outreach[0].subject}</p>
                <p className="whitespace-pre-wrap text-sm text-stone-700">{job.outreach[0].body}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
