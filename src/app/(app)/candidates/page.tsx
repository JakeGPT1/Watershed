import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function CandidatesPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await props.searchParams;
  const query = q?.trim();

  const candidates = await prisma.candidate.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { currentTitle: { contains: query, mode: "insensitive" } },
            { tags: { some: { tag: { label: { contains: query.toLowerCase() } } } } },
          ],
        }
      : undefined,
    include: {
      tags: { include: { tag: true }, take: 6 },
      notes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Candidates</h1>
        <Link
          href="/candidates/new"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Add Candidate
        </Link>
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by name, title, or tag…"
          className="w-full max-w-md rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
      </form>

      {candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500">
          {query ? "No candidates match that search." : "No candidates yet — add your first."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Tags</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${c.id}`} className="font-medium text-stone-900 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c.currentTitle ?? "—"}</td>
                  <td className="px-4 py-3 text-stone-600">{c.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t.tagId} className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                          {t.tag.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
