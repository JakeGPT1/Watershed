import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCandidate } from "../../actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";

export default async function EditCandidatePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Edit {c.name}</h1>
      <form action={updateCandidate.bind(null, id)} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Name *</label>
          <input name="name" required defaultValue={c.name} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Current title</label>
          <input name="currentTitle" defaultValue={c.currentTitle ?? ""} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Location</label>
          <input name="location" defaultValue={c.location ?? ""} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Comp expectation</label>
          <input name="compExpect" defaultValue={c.compExpect ?? ""} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">LinkedIn URL</label>
          <input name="linkedinUrl" defaultValue={c.linkedinUrl ?? ""} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Summary</label>
          <textarea name="summary" rows={2} defaultValue={c.summary ?? ""} className={field} />
        </div>
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Save Changes
        </button>
      </form>
    </div>
  );
}
