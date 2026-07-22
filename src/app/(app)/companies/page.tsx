import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    include: { _count: { select: { contacts: true, jobs: true, projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Companies</h1>
        <Link
          href="/companies/new"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          New Company
        </Link>
      </div>

      {companies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500">
          No companies yet — add your first, or one will appear automatically when you create a
          project or run the GTM monitor.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Funding</th>
                <th className="px-4 py-3">Contacts</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/companies/${c.id}`} className="font-medium text-stone-900 hover:underline">
                        {c.name}
                      </Link>
                      {c.isGtmTarget && (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          GTM target
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.fundingStage ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        {c.fundingStage}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c._count.contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
