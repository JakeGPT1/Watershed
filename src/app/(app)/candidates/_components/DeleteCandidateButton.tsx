"use client";
import { useState } from "react";

export function DeleteCandidateButton({ action, name }: { action: () => void; name: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <form action={action}>
      {armed ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-700">Delete {name}?</span>
          <button className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">
            Confirm
          </button>
          <button type="button" onClick={() => setArmed(false)} className="text-xs text-stone-500 hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      )}
    </form>
  );
}
