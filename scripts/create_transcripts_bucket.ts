import { createAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const admin = createAdminClient();
  const { data: existing } = await admin.storage.listBuckets();
  if (existing?.some((b) => b.name === "transcripts")) {
    console.log("Bucket 'transcripts' already exists.");
    return;
  }
  const { error } = await admin.storage.createBucket("transcripts", { public: false });
  if (error) {
    console.error("Failed to create bucket:", error.message);
    process.exit(1);
  }
  console.log("Created bucket 'transcripts'.");
}

main();
