import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: buckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) throw listErr;

for (const name of ["resumes", "job-descriptions"]) {
  if (buckets.some((b) => b.name === name)) {
    console.log(`Bucket '${name}' already exists.`);
  } else {
    const { error } = await admin.storage.createBucket(name, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (error) throw error;
    console.log(`Created private bucket '${name}' (10MB limit).`);
  }
}
