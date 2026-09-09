import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Two sign-in link shapes land here:
 *
 *  - ?token_hash=…&type=…  — the OTP flow. Device-INDEPENDENT: the link carries
 *    everything needed, so it works when the mail app opens it in a different
 *    browser or on a different machine than the one that requested it. This is
 *    what the Supabase email template should send (see AUTH_SETUP.md).
 *
 *  - ?code=…  — the PKCE flow (Supabase's default {{ .ConfirmationURL }}). The
 *    exchange also needs a code_verifier cookie written when the link was
 *    REQUESTED, so the link only works in that same browser. Kept as a fallback
 *    for links already in the inbox; the failure is translated below into an
 *    explanation rather than raw SDK text.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const code = searchParams.get("code");
  const errorDesc = searchParams.get("error_description");

  const supabase = await createClient();

  // Preferred: device-independent OTP verification.
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL("/candidates", request.url));
    return fail(request, error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/candidates", request.url));
    return fail(request, explain(error.message));
  }

  return fail(request, errorDesc ?? "Sign-in link invalid or expired.");
}

/** Turn the SDK's PKCE storage error into something actionable. */
function explain(message: string): string {
  if (/code verifier/i.test(message)) {
    return "This link was opened in a different browser or device than the one that requested it. Send yourself a new link below and open it in this browser.";
  }
  if (/expired|invalid/i.test(message)) {
    return "That sign-in link has expired or was already used. Send yourself a new one below.";
  }
  return message;
}

function fail(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL("/login?error=" + encodeURIComponent(message), request.url)
  );
}
