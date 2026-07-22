import { createCandidateFromResume } from "../actions";
import { ErrorBanner } from "../../_components/ErrorBanner";

export default async function UploadResumePage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Upload resume</h1>
      <ErrorBanner error={error} clearHref="/candidates/upload" />
      <form
        action={createCandidateFromResume}
        encType="multipart/form-data"
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Resume (PDF or text) *</label>
          <input
            type="file"
            name="resume"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            required
            className="block w-full text-xs text-stone-600 file:mr-2 file:rounded-md file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs file:text-stone-700 hover:file:bg-stone-200"
          />
          <p className="mt-1 text-xs text-stone-500">
            AI reads the resume and creates the full candidate record — name, title, company, location, skills.
          </p>
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Create From Resume
        </button>
      </form>
    </div>
  );
}
