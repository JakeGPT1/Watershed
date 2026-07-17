// Verifies JD file storage: upload to bucket, path persisted, signed URL retrievable + downloadable.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const BUCKET = "job-descriptions";

const project = await prisma.project.create({ data: { title: "__verify_jd_storage__" } });

// Upload a fake JD
const content = Buffer.from("Senior Backend Engineer — test JD content.");
const path = `${project.id}/${Date.now()}-test-jd.txt`;
const { error: upErr } = await admin.storage.from(BUCKET).upload(path, content, { contentType: "text/plain" });
if (upErr) throw upErr;
console.log("1. File uploaded to bucket:", path);

// Persist path
await prisma.project.update({ where: { id: project.id }, data: { jdFileUrl: path, jdFileName: "test-jd.txt" } });
const p = await prisma.project.findUnique({ where: { id: project.id } });
console.log("2. Path persisted on project:", p.jdFileUrl === path && p.jdFileName === "test-jd.txt");

// Signed URL + download
const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
const res = await fetch(signed.signedUrl);
const downloaded = await res.text();
console.log("3. Signed URL downloads original:", downloaded === "Senior Backend Engineer — test JD content.");

// Cleanup
await admin.storage.from(BUCKET).remove([path]);
await prisma.project.delete({ where: { id: project.id } });
console.log("Cleanup done.");
console.log(
  p.jdFileUrl === path && downloaded.startsWith("Senior Backend")
    ? "JD STORAGE VERIFIED."
    : "VERIFICATION FAILED."
);
await prisma.$disconnect();
