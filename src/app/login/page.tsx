import { sendMagicLink } from "./actions";

export default async function LoginPage(props: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await props.searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">Watershed</h1>
        <p className="mt-1 text-sm text-stone-500">Recruiting ATS — owner sign-in</p>

        {sent ? (
          <p className="mt-6 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Magic link sent. Check your inbox and click the link to sign in.
          </p>
        ) : (
          <form action={sendMagicLink} className="mt-6 space-y-3">
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Send Magic Link
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
      </div>
    </main>
  );
}
