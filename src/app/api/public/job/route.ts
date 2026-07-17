import { prisma } from "@/lib/prisma";
import { intakeJob } from "@/lib/publicIntake";
import { corsHeaders, preflightResponse, isValidEmail } from "@/lib/publicCors";

export const maxDuration = 60;

const DAILY_LIMIT = 20;

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

  const honeypot = String(form.get("website") ?? "").trim();
  if (honeypot) return json({ ok: true }, 200, origin);

  const contactName = String(form.get("contactName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const companyName = String(form.get("companyName") ?? "").trim();
  const roleTitle = String(form.get("roleTitle") ?? "").trim();
  const jdText = String(form.get("jdText") ?? "").trim();

  if (!contactName || contactName.length > 200) return fail(400, "Please enter your name.");
  if (!isValidEmail(email)) return fail(400, "Please enter a valid email.");
  if (!companyName || companyName.length > 200) return fail(400, "Please enter your company.");
  if (roleTitle.length > 200) return fail(400, "That role title looks too long.");
  if (jdText.length < 100) return fail(400, "Tell us a bit more about the role (100 characters minimum).");
  if (jdText.length > 20000) return fail(400, "That's a lot — please trim it down a bit.");

  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const todayCount = await prisma.job.count({
      where: { source: "website", createdAt: { gte: since } },
    });
    if (todayCount >= DAILY_LIMIT) return fail(429, "We're catching up on submissions — please try again tomorrow.");

    await intakeJob({
      contactName,
      email,
      companyName,
      roleTitle: roleTitle || undefined,
      jdText,
    });

    return json({ ok: true }, 200, origin);
  } catch (e) {
    console.error("public job intake failed", e);
    return fail(500, "Something went wrong on our end. Please try again shortly.");
  }
}
