"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Owner-only lockdown: never even send a link to any other address.
  if (!isOwnerEmail(email)) {
    redirect(`/login?error=${encodeURIComponent("This app is private.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?sent=1");
}

/**
 * Sign in with a one-time code instead of a link.
 *
 * A sign-in URL is fragile in a way that has nothing to do with the token: browsers
 * (and mail scanners) prefetch URLs, and a prefetch SPENDS a single-use token, so the
 * real navigation arrives with a token that was already redeemed and reports itself as
 * expired. A code typed into a form is never prefetched by anything.
 */
export async function signInWithCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");

  if (!isOwnerEmail(email)) {
    redirect(`/login?error=${encodeURIComponent("This app is private.")}`);
  }
  if (!token) {
    redirect(`/login?error=${encodeURIComponent("Enter the code.")}`);
  }

  const supabase = await createClient();
  // A magic-link code verifies as "magiclink"; a first-ever sign-up code as "email".
  // Try both rather than making the person care which one they were sent.
  let lastError = "";
  for (const type of ["magiclink", "email"] as const) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (!error) redirect("/candidates");
    lastError = error.message;
  }
  redirect(`/login?error=${encodeURIComponent(lastError)}`);
}
