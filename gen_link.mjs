import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.OWNER_EMAIL;
const site = "https://watershed-ten.vercel.app";

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) { console.error("ERROR:", error.message); process.exit(1); }

const hash = data.properties.hashed_token;
const link = `${site}/auth/confirm?token_hash=${hash}&type=magiclink`;
fs.writeFileSync("D:/Watershed/SIGN_IN_LINK.txt", link + "\n");
console.log("generated OK; length:", link.length);
