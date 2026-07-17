import { createCompany } from "../actions";
import { ErrorBanner } from "../../_components/ErrorBanner";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default async function NewCompanyPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">New Company</h1>
      <ErrorBanner error={error} clearHref="/companies/new" />
      <form action={createCompany} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Name *</label>
          <input name="name" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Industry</label>
          <input name="industry" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Website</label>
          <input name="website" placeholder="https://…" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
          <textarea name="notes" rows={3} className={field} />
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Create Company
        </button>
      </form>
    </div>
  );
}
