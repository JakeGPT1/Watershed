import Link from "next/link";
import { signOut } from "./actions";

// Applies to every server action invoked from a page under this layout (candidates, jobs,
// projects, companies). Several of these actions now chain multiple AI calls — resume
// parsing, transcript summarization, embedding, and (since the auto-rematch hook) up to
// several match-rationale calls per candidate save — which can exceed the platform default
// duration. The cron route sets its own maxDuration separately.
export const maxDuration = 60;

// This is a live, single-owner ATS — every page under here must always reflect current DB
// state, never a build-time snapshot. A list page with no dynamic input (no search params,
// no cookies read in the page itself) gets statically prerendered by default and then serves
// a frozen snapshot from the last deploy forever after — confirmed live: a company created via
// resume ingest after deploy was invisible on /companies until this was added. Forcing the
// whole authenticated app dynamic closes this for every current AND future list page.
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/candidates", label: "Candidates" },
  { href: "/projects", label: "Projects" },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      <aside className="fixed inset-y-0 w-52 border-r border-stone-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-semibold text-stone-900">Watershed</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="absolute bottom-4 left-4 right-4">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 hover:bg-stone-100">
            Sign Out
          </button>
        </form>
      </aside>
      <main className="ml-52 flex-1 p-8">{children}</main>
    </div>
  );
}
