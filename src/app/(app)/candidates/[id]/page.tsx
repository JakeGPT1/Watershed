import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addNote,
  addTranscript,
  uploadResume,
  addManualTag,
  removeTag,
  getResumeSignedUrl,
  getTranscriptSignedUrl,
  deleteCandidate,
} from "../actions";
import { addCandidateToProjectFromCandidate } from "../../projects/actions";
import { ErrorBanner } from "../../_components/ErrorBanner";
import { DeleteCandidateButton } from "../_components/DeleteCandidateButton";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
const btn =
  "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700";

export default async function CandidatePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const c = await prisma.candidate.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      notes: { orderBy: { createdAt: "desc" } },
      transcripts: { orderBy: { callDate: "desc" } },
      interactions: { orderBy: { occurredAt: "desc" } },
      projects: { include: { project: true } },
    },
  });
  if (!c) notFound();

  const resumeLink = c.resumeUrl ? await getResumeSignedUrl(id) : null;
  const transcriptLinks = Object.fromEntries(
    await Promise.all(
      c.transcripts
        .filter((t) => t.fileUrl)
        .map(async (t) => [t.id, await getTranscriptSignedUrl(t.id)] as const)
    )
  );

  // Projects this candidate is not already in — for the "add to project" control.
  const memberProjectIds = c.projects.map((pc) => pc.projectId);
  const availableProjects = await prisma.project.findMany({
    where: { id: { notIn: memberProjectIds }, status: { not: "closed" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, company: { select: { name: true } } },
  });

  const timeline = [
    ...c.notes.map((n) => ({ kind: "note" as const, date: n.createdAt, note: n })),
    ...c.transcripts.map((t) => ({ kind: "transcript" as const, date: t.callDate, transcript: t })),
    ...c.interactions.map((i) => ({ kind: "interaction" as const, date: i.occurredAt, interaction: i })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="max-w-3xl">
      <ErrorBanner error={error} clearHref={`/candidates/${id}`} />
      {/* Header */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{c.name}</h1>
            <p className="mt-1 text-sm text-stone-600">
              {[
                c.currentTitle && c.currentCompany
                  ? `${c.currentTitle} @ ${c.currentCompany}`
                  : c.currentTitle || c.currentCompany,
                c.location,
              ]
                .filter(Boolean)
                .join(" · ") || "No details yet"}
            </p>
            {c.compExpect && (
              <p className="mt-1 text-sm text-stone-700">
                <span className="font-medium">Comp expectation:</span> {c.compExpect}
              </p>
            )}
            {c.summary && <p className="mt-2 text-sm text-stone-700">{c.summary}</p>}
            <div className="mt-3 flex gap-4 text-sm">
              {resumeLink && (
                <a href={resumeLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                  View resume ↗
                </a>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {c.linkedinUrl && (
              <a
                href={c.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
              >
                LinkedIn ↗
              </a>
            )}
            <Link href={`/candidates/${id}/edit`} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
              Edit
            </Link>
            <DeleteCandidateButton action={deleteCandidate.bind(null, id)} name={c.name} />
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {c.tags.map((ct) => (
            <form key={ct.tagId} action={removeTag.bind(null, id, ct.tagId)} className="group">
              <button
                className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700 hover:bg-red-50 hover:text-red-700"
                title={`${ct.tag.kind} · ${ct.source} — click to remove`}
              >
                {ct.tag.label} <span className="opacity-0 group-hover:opacity-100">×</span>
              </button>
            </form>
          ))}
          <form action={addManualTag.bind(null, id)} className="flex items-center gap-1">
            <input name="label" placeholder="add tag…" className="w-24 rounded-md border border-stone-200 px-2 py-0.5 text-xs outline-none focus:border-stone-400" />
            <input type="hidden" name="kind" value="other" />
          </form>
        </div>

        {/* In projects */}
        <div className="mt-4 border-t border-stone-100 pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">In projects</p>
          {c.projects.length > 0 ? (
            c.projects.map((pc) => (
              <div key={pc.projectId} className="text-sm text-stone-700">
                <Link href={`/projects/${pc.projectId}`} className="hover:underline">{pc.project.title}</Link>
                <span className="text-stone-400"> — {pc.stage}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-400">Not in any project yet.</p>
          )}

          {availableProjects.length > 0 ? (
            <form
              action={addCandidateToProjectFromCandidate.bind(null, id)}
              className="mt-2 flex items-center gap-2"
            >
              <select
                name="projectId"
                defaultValue=""
                required
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-stone-500"
              >
                <option value="" disabled>
                  Add to Project…
                </option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.company ? `${p.title} - ${p.company.name}` : p.title}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                Add
              </button>
            </form>
          ) : (
            <p className="mt-2 text-xs text-stone-400">
              {c.projects.length > 0 ? "In all open projects." : "No open projects yet — "}
              {c.projects.length === 0 && (
                <Link href="/projects/new" className="text-blue-700 hover:underline">
                  create one
                </Link>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Enrichment actions */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-stone-800">Upload resume</summary>
          <form action={uploadResume.bind(null, id)} className="mt-3 space-y-2">
            <input type="file" name="resume" accept=".pdf,.txt,.md,application/pdf,text/plain" required className="block w-full text-xs" />
            <button className={btn}>Upload &amp; Parse</button>
            <p className="text-xs text-stone-500">PDF or plain text. AI extracts title, location, skills.</p>
          </form>
        </details>

        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-stone-800">Upload transcript</summary>
          <form action={addTranscript.bind(null, id)} className="mt-3 space-y-2">
            <input type="file" name="transcript" accept=".pdf,.txt,.md,.vtt,application/pdf,text/plain" required className="block w-full text-xs" />
            <input type="date" name="callDate" className={field} />
            <button className={btn}>Upload &amp; Summarize</button>
            <p className="text-xs text-stone-500">PDF or text. AI summarizes and tags automatically.</p>
          </form>
        </details>
      </div>

      {/* Add note */}
      <form action={addNote.bind(null, id)} className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        <textarea name="body" rows={2} required placeholder="Add a note — AI tags it automatically…" className={field} />
        <button className={`mt-2 ${btn}`}>Add Note</button>
      </form>

      {/* Timeline */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">Timeline</h2>
      <div className="space-y-3">
        {timeline.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No activity yet.
          </p>
        )}
        {timeline.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {item.kind === "note" ? "Note" : item.kind === "transcript" ? "Call transcript" : "Interaction"}
              </span>
              <span className="text-xs text-stone-400">{item.date.toLocaleDateString()}</span>
            </div>
            {item.kind === "note" && <p className="whitespace-pre-wrap text-sm text-stone-700">{item.note.body}</p>}
            {item.kind === "transcript" && (
              <div>
                <p className="text-sm text-stone-700">{item.transcript.summary ?? "(no summary)"}</p>
                <div className="mt-2 flex items-center gap-3">
                  {item.transcript.rawText && (
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-700">Show full transcript</summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
                        {item.transcript.rawText}
                      </p>
                    </details>
                  )}
                  {transcriptLinks[item.transcript.id] && (
                    <a
                      href={transcriptLinks[item.transcript.id]!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Download transcript ↗
                    </a>
                  )}
                </div>
              </div>
            )}
            {item.kind === "interaction" && (
              <p className="text-sm text-stone-700">
                <span className="font-medium">{item.interaction.kind}</span>
                {item.interaction.summary ? ` — ${item.interaction.summary}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
