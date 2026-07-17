import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addCandidatesToProject } from "../../actions";
import type { Prisma } from "@prisma/client";

export default async function AddCandidatesPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await props.params;
  const { q } = await props.searchParams;
  const query = q?.trim();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const searchFilter: Prisma.CandidateWhereInput[] = query
    ? [
        {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { currentTitle: { contains: query, mode: "insensitive" } },
            { tags: { some: { tag: { label: { contains: query.toLowerCase() } } } } },
          ],
        },
      ]
    : [];

  const candidates = await prisma.candidate.findMany({
    where: {
      AND: [...searchFilter, { NOT: { projects: { some: { projectId: id } } } }],
    },
    include: { tags: { include: { tag: true }, take: 6 } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-stone-900">Add candidates</h1>
      <p className="mb-6 text-sm text-stone-500">to {project.title}</p>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by name, title, or tag…"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
      </form>

      <form action={addCandidatesToProject.bind(null, id)}>
        {candidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500">
            No candidates found — try a different search, or everyone matching is already in this project.
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 hover:bg-stone-50"
              >
                <input type="checkbox" name="candidateIds" value={c.id} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900">{c.name}</p>
                  <p className="text-sm text-stone-600">{c.currentTitle ?? "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((ct) => (
                      <span key={ct.tagId} className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                        {ct.tag.label}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
        {candidates.length > 0 && (
          <button className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            Add Selected to Project
          </button>
        )}
      </form>
    </div>
  );
}
