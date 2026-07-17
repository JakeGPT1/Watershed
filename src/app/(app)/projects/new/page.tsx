import { createProject } from "../actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default function NewProjectPage() {
  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">New project</h1>
      <form action={createProject} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Title *</label>
          <input name="title" required placeholder="Acme — Senior Backend Engineer" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Company</label>
          <input name="companyName" placeholder="Acme Corp" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Notes</label>
          <textarea name="notes" rows={3} className={field} />
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Create Project
        </button>
      </form>
    </div>
  );
}
