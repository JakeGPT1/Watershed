import { createManualJob } from "../actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default function NewJobPage() {
  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold text-stone-900">Paste a Job</h1>
      <p className="mb-6 text-sm text-stone-500">
        Paste any job description — we&apos;ll extract it and rank your candidates against it.
      </p>
      <form action={createManualJob} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Job description *</label>
          <textarea name="rawText" rows={10} required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Company</label>
          <input name="companyName" placeholder="Acme Corp" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Source URL</label>
          <input name="sourceUrl" placeholder="https://…" className={field} />
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Extract &amp; Match
        </button>
      </form>
    </div>
  );
}
