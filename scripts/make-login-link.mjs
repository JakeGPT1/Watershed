// Generates an owner sign-in link via the admin API — bypasses email (and its rate limit).
// Usage: node --env-file=.env scripts/make-login-link.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const email = process.env.OWNER_EMAIL;
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

const tokenHash = data.properties.hashed_token;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
console.log("\nOpen this URL in your browser to sign in:\n");
console.log(`${site}/auth/confirm?token_hash=${tokenHash}&type=magiclink\n`);
console.log("(Valid for one use, expires in ~1 hour.)");
