import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/stages";
import {
  renameProject,
  updateProjectStatus,
  setStage,
  setProjectCandidateNote,
  removeFromProject,
  uploadJobDescription,
  setProjectNotes,
  getJdSignedUrl,
} from "../actions";
import { AutoSubmitSelect } from "../_components/AutoSubmitSelect";
import { ErrorBanner } from "../../_components/ErrorBanner";

const selectField = "rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-stone-500";

export default async function ProjectPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      company: true,
      candidates: {
        include: { candidate: { include: { tags: { include: { tag: true }, take: 4 } } } },
      },
    },
  });
  if (!project) notFound();

  const jdLink = project.jdFileUrl ? await getJdSignedUrl(id) : null;

  const byStage = new Map<string, typeof project.candidates>();
  for (const stage of STAGES) byStage.set(stage, []);
  for (const pc of project.candidates) {
    (byStage.get(pc.stage) ?? byStage.get("Pursuing")!).push(pc);
  }

  return (
    <div className="max-w-3xl">
      <ErrorBanner error={error} clearHref={`/projects/${id}`} />
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{project.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-stone-600">
            <span>{project.company?.name ?? "No company"}</span>
            <span>·</span>
            <form action={updateProjectStatus.bind(null, id)}>
              <AutoSubmitSelect name="status" defaultValue={project.status} className={selectField}>
                <option value="open">open</option>
                <option value="filled">filled</option>
                <option value="closed">closed</option>
              </AutoSubmitSelect>
            </form>
            <span>·</span>
            <span>{project.candidates.length} candidates</span>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-stone-500">Rename project</summary>
            <form action={renameProject.bind(null, id)} className="mt-2 flex flex-wrap items-center gap-2">
              <input
                name="title"
                defaultValue={project.title}
                required
                placeholder="Title"
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-stone-500"
              />
              <input
                name="companyName"
                defaultValue={project.company?.name ?? ""}
                placeholder="Company"
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-stone-500"
              />
              <button className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                Save
              </button>
            </form>
          </details>
        </div>
        <Link
          href={`/projects/${id}/add`}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Add Candidates
        </Link>
      </div>

      {/* Notes + job description */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">Notes</h2>
            {jdLink && (
              <a
                href={jdLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-700 hover:underline"
                title={project.jdFileName ?? "Job description"}
              >
                View JD ↗
              </a>
            )}
          </div>
          <form action={uploadJobDescription.bind(null, id)} className="flex items-center gap-2">
            <input
              type="file"
              name="jd"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              required
              className="block max-w-[220px] text-xs text-stone-600 file:mr-2 file:rounded-md file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs file:text-stone-700 hover:file:bg-stone-200"
            />
            <button className="whitespace-nowrap rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
              Analyze JD
            </button>
          </form>
        </div>

        {project.notes ? (
          <p className="whitespace-pre-wrap text-sm text-stone-700">{project.notes}</p>
        ) : (
          <p className="text-sm text-stone-400">
            No notes yet — drop a job description file above to auto-populate, or edit manually.
          </p>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-stone-500">Edit notes</summary>
          <form action={setProjectNotes.bind(null, id)} className="mt-2">
            <textarea
              name="notes"
              defaultValue={project.notes ?? ""}
              rows={8}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
            <button className="mt-2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
              Save Notes
            </button>
          </form>
        </details>
      </div>

      <div className="space-y-6">
        {STAGES.map((stage) => {
          const rows = byStage.get(stage) ?? [];
          if (rows.length === 0 && stage !== "Pursuing") return null;
          const muted = stage === "Not Interested";

          return (
            <div key={stage} className={muted ? "opacity-60" : undefined}>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">
                {stage} <span className="text-stone-400">· {rows.length}</span>
              </h2>
              {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-400">
                  No candidates in this stage.
                </p>
              ) : (
                <div className="space-y-2">
                  {rows.map((pc) => (
                    <div key={pc.candidateId} className="rounded-xl border border-stone-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/candidates/${pc.candidateId}`}
                            className="font-medium text-stone-900 hover:underline"
                          >
                            {pc.candidate.name}
                          </Link>
                          <p className="text-sm text-stone-600">{pc.candidate.currentTitle ?? "—"}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {pc.candidate.tags.map((ct) => (
                              <span key={ct.tagId} className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                                {ct.tag.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <form action={setStage.bind(null, id, pc.candidateId)}>
                            <AutoSubmitSelect name="stage" defaultValue={pc.stage} className={selectField}>
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </AutoSubmitSelect>
                          </form>
                          <form action={removeFromProject.bind(null, id, pc.candidateId)}>
                            <button
                              className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-700"
                              title="Remove from project"
                            >
                              ×
                            </button>
                          </form>
                        </div>
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-stone-500">
                          {pc.note ? pc.note.slice(0, 80) : "Add search note"}
                        </summary>
                        <form
                          action={setProjectCandidateNote.bind(null, id, pc.candidateId)}
                          className="mt-2 flex gap-2"
                        >
                          <textarea
                            name="note"
                            defaultValue={pc.note ?? ""}
                            rows={2}
                            className="flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-stone-500"
                          />
                          <button className="self-start rounded-lg bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                            Save
                          </button>
                        </form>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
