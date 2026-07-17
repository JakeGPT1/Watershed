import Link from "next/link";

export function ErrorBanner({ error, clearHref }: { error?: string; clearHref: string }) {
  if (!error) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <p>{error}</p>
      <Link href={clearHref} className="shrink-0 text-xs text-red-700 hover:underline">
        Dismiss
      </Link>
    </div>
  );
}
