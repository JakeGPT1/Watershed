import Link from "next/link";
import { signOut } from "./actions";

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
