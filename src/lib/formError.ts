import { redirect } from "next/navigation";

/** Redirect back to `path` with a user-visible error message (rendered by ErrorBanner). */
export function failTo(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
