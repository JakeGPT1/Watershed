import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const errorDesc = searchParams.get("error_description");

  const supabase = await createClient();

  // PKCE flow — default Supabase email template lands here with ?code=
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/candidates", request.url));
    return fail(request, error.message);
  }

  // token_hash flow — used if the email template links {{ .TokenHash }} directly
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL("/candidates", request.url));
    return fail(request, error.message);
  }

  return fail(request, errorDesc ?? "Sign-in link invalid or expired.");
}

function fail(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL("/login?error=" + encodeURIComponent(message), request.url)
  );
}
