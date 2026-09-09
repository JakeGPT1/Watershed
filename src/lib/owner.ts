/**
 * Who is allowed into this app.
 *
 * The allow-list is the union of OWNER_EMAIL and OWNER_EMAIL_ALT, each of which may
 * itself hold a comma-separated list. Two variables rather than one so an address can
 * be changed WITHOUT a lockout window: add the new address to OWNER_EMAIL_ALT, confirm
 * it signs in, then fold it into OWNER_EMAIL and clear the alt. Nothing here ever has
 * to be briefly empty or briefly wrong, which is the failure that locks you out of
 * your own ATS with no way back in but the Supabase dashboard.
 *
 * Matching is case-insensitive and trims whitespace — a stray space in a dashboard
 * env var should not be an outage.
 */
export function ownerEmails(): string[] {
  return [process.env.OWNER_EMAIL, process.env.OWNER_EMAIL_ALT]
    .filter(Boolean)
    .flatMap((v) => v!.split(","))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}
