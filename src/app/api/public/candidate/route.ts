import { prisma } from "@/lib/prisma";
import { intakeCandidate } from "@/lib/publicIntake";
import { corsHeaders, preflightResponse, isValidEmail } from "@/lib/publicCors";

export const maxDuration = 60;

const DAILY_LIMIT = 20;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function OPTIONS(req: Request) {
  return preflightResponse(req.headers.get("origin"));
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const fail = (status: number, error: string) => json({ ok: false, error }, status, origin);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Malformed submission.");
  }

  // Honeypot: bots fill every field, humans never see this one. Silent drop.
  const honeypot = String(form.get("website") ?? "").trim();
  if (honeypot) return json({ ok: true }, 200, origin);

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const linkedinUrl = String(form.get("linkedinUrl") ?? "").trim();
  const file = form.get("resume") as File | null;

  if (!name || name.length > 200) return fail(400, "Please enter your name.");
  if (!isValidEmail(email)) return fail(400, "Please enter a valid email.");
  if (linkedinUrl.length > 300) return fail(400, "That LinkedIn URL looks too long.");
  if (!file || file.size === 0) return fail(400, "Please attach your resume.");
  if (file.size > MAX_FILE_BYTES) return fail(400, "Resume must be under 8MB.");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return fail(400, "Please upload your resume as a PDF.");

  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const todayCount = await prisma.candidate.count({
      where: { source: "website", createdAt: { gte: since } },
    });
    if (todayCount >= DAILY_LIMIT) return fail(429, "We're catching up on submissions — please try again tomorrow.");

    const buffer = Buffer.from(await file.arrayBuffer());
    await intakeCandidate({
      name,
      email,
      linkedinUrl: linkedinUrl || undefined,
      resumeFile: { buffer, type: file.type, name: file.name },
    });

    return json({ ok: true }, 200, origin);
  } catch (e) {
    console.error("public candidate intake failed", e);
    return fail(500, "Something went wrong on our end. Please try again shortly.");
  }
}
