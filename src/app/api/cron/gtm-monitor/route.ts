import { NextRequest, NextResponse } from "next/server";
import { runGtmMonitor } from "@/lib/gtm/monitor";
import { runWeeklyAudit } from "@/lib/gtm/audit";

// Vercel Cron invokes this on schedule (see vercel.json), sending
// Authorization: Bearer $CRON_SECRET automatically. Reject anything else —
// this endpoint has no Supabase session, so CRON_SECRET is the only gate.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runGtmMonitor();
    // Weekly self-improvement pass — runs only on this Monday cron, never on manual
    // "Run Monitor Now". Non-fatal: a failed audit must not fail the monitor run.
    await runWeeklyAudit().catch((e) => console.error("weekly audit failed (non-fatal)", e));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
