import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCompany, deleteCompany, addContact, updateContact, removeContact } from "../actions";
import { ErrorBanner } from "../../_components/ErrorBanner";
import { DeleteCompanyButton } from "../_components/DeleteCompanyButton";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
const btn =
  "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700";

export default async function CompanyPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await props.params;
  const { error } = await props.searchParams;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 20 },
      projects: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!company) notFound();

  return (
    <div className="max-w-3xl">
      <ErrorBanner error={error} clearHref={`/companies/${id}`} />
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-stone-900">{company.name}</h1>
              {company.isGtmTarget && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  GTM target
                </span>
              )}
              {company.fundingStage && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  {company.fundingStage}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-stone-600">{company.industry ?? "No industry set"}</p>
            {company.fundingStage && (
              <p className="mt-1 text-xs text-stone-400">
                {company.fundingBasis}
                {company.fundingCheckedAt && ` · checked ${company.fundingCheckedAt.toLocaleDateString()}`}
              </p>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-blue-700 hover:underline"
              >
                {company.website} ↗
              </a>
            )}
            {company.notes && <p className="mt-2 text-sm text-stone-700">{company.notes}</p>}
          </div>
          <DeleteCompanyButton action={deleteCompany.bind(null, id)} name={company.name} />
        </div>

        <details className="mt-4 border-t border-stone-100 pt-3">
          <summary className="cursor-pointer text-sm text-stone-500">Edit company</summary>
          <form action={updateCompany.bind(null, id)} className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Name *</label>
              <input name="name" required defaultValue={company.name} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Industry</label>
              <input name="industry" defaultValue={company.industry ?? ""} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Website</label>
              <input name="website" defaultValue={company.website ?? ""} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Funding stage</label>
              <select name="fundingStage" defaultValue={company.fundingStage ?? ""} className={field}>
                <option value="">Not set</option>
                <option value="pre-seed">pre-seed</option>
                <option value="seed">seed</option>
                <option value="series-a">series-a</option>
                <option value="series-b">series-b</option>
                <option value="series-c">series-c</option>
                <option value="series-d-plus">series-d-plus</option>
                <option value="public">public</option>
                <option value="bootstrapped">bootstrapped</option>
                <option value="pe-owned">pe-owned</option>
                <option value="acquired">acquired</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Notes</label>
              <textarea name="notes" rows={3} defaultValue={company.notes ?? ""} className={field} />
            </div>
            <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
              Save Changes
            </button>
          </form>
        </details>
      </div>

      {/* Contacts */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-500">
          Hiring manager contacts
        </h2>

        {company.contacts.length === 0 ? (
          <p className="mb-3 text-sm text-stone-400">No contacts yet.</p>
        ) : (
          <div className="mb-3 space-y-2">
            {company.contacts.map((contact) => (
              <div key={contact.id} className="rounded-lg border border-stone-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{contact.name}</p>
                    <p className="text-xs text-stone-500">
                      {[contact.title, contact.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <form action={removeContact.bind(null, contact.id, id)}>
                    <button
                      className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-700"
                      title="Remove contact"
                    >
                      ×
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-stone-500">Edit</summary>
                  <form
                    action={updateContact.bind(null, contact.id, id)}
                    className="mt-2 grid grid-cols-3 gap-2"
                  >
                    <input name="name" required defaultValue={contact.name} placeholder="Name" className={field} />
                    <input name="title" defaultValue={contact.title ?? ""} placeholder="Title" className={field} />
                    <input name="email" defaultValue={contact.email ?? ""} placeholder="Email" className={field} />
                    <button className="col-span-3 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
                      Save
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm text-stone-500">Add contact</summary>
          <form action={addContact.bind(null, id)} className="mt-2 grid grid-cols-3 gap-2">
            <input name="name" required placeholder="Name" className={field} />
            <input name="title" placeholder="Title" className={field} />
            <input name="email" placeholder="Email" className={field} />
            <button className={`col-span-3 ${btn}`}>Add Contact</button>
          </form>
        </details>
      </div>

      {/* Linked projects + jobs */}
      {(company.projects.length > 0 || company.jobs.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {company.projects.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Projects</p>
              <div className="space-y-1">
                {company.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block text-sm text-stone-700 hover:underline">
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {company.jobs.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Jobs</p>
              <div className="space-y-1">
                {company.jobs.map((j) => (
                  <Link key={j.id} href={`/jobs/${j.id}`} className="block text-sm text-stone-700 hover:underline">
                    {j.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
