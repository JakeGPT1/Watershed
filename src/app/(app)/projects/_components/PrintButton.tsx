"use client";
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 print:hidden"
    >
      Download PDF
    </button>
  );
}
