import { createCandidate } from "../actions";
import { ErrorBanner } from "../../_components/ErrorBanner";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default async function NewCandidatePage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Add candidate</h1>
      <ErrorBanner error={error} clearHref="/candidates/new" />
      <form
        action={createCandidate}
        encType="multipart/form-data"
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"
      >
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
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Resume (optional)</label>
          <input
            type="file"
            name="resume"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="block w-full text-xs text-stone-600 file:mr-2 file:rounded-md file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs file:text-stone-700 hover:file:bg-stone-200"
          />
          <p className="mt-1 text-xs text-stone-500">
            Attach a PDF and AI fills in title, location, and skills automatically.
          </p>
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Create Candidate
        </button>
      </form>
      <p className="mt-3 text-xs text-stone-500">
        Attach a resume above, or add one later from the candidate page — AI fills in the rest either way.
      </p>
    </div>
  );
}
