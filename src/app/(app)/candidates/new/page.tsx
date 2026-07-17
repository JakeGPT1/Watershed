import { createCandidate } from "../actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default function NewCandidatePage() {
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Add candidate</h1>
      <form action={createCandidate} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Name *</label>
          <input name="name" required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Current title</label>
          <input name="currentTitle" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Location</label>
          <input name="location" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Comp expectation</label>
          <input name="compExpect" placeholder="$150-170k" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">LinkedIn URL</label>
          <input name="linkedinUrl" placeholder="https://linkedin.com/in/…" className={field} />
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Create Candidate
        </button>
      </form>
      <p className="mt-3 text-xs text-stone-500">
        After creating, upload a resume or paste LinkedIn/transcript text from the candidate page — AI fills in the rest.
      </p>
    </div>
  );
}
