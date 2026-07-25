"use client";
import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";

export function SubmitButton({
  children,
  className,
  pendingLabel = "Saving…",
  savedLabel = "Saved ✓",
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  savedLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(pending);

  useEffect(() => {
    // Fire only on the pending -> not-pending transition (action just completed).
    if (wasPending.current && !pending) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      wasPending.current = pending;
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <button className={className} disabled={pending} aria-live="polite">
      {pending ? pendingLabel : justSaved ? savedLabel : children}
    </button>
  );
}
