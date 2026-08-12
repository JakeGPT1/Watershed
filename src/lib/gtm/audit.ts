import { prisma } from "@/lib/prisma";
import { findOrCreateCompany } from "@/lib/companies";
import { suggestGtmCompanies } from "@/lib/ai";
import { discoverAts } from "./discover";
import { mapLimit } from "./monitor";
import { isLikelyIcpCompany } from "./icpFilter";

// Weekly self-improvement pass for the GTM monitor. Two goals: cover MORE companies, and
// rank them BETTER using the owner's own win/dismiss signals. Runs on the Monday cron only.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Quality learning — bounded so it only ever reorders, never hides.
const WIN_BOOST = 8;
const DISMISS_PENALTY = 5;
const BOOST_MIN = -15;
const BOOST_MAX = 20;

// Growth caps — keep the Monday monitor inside its 60s budget as coverage compounds.
const MAX_NEW_TARGETS_PER_WEEK = 10;
const MAX_TOTAL_TARGETS = 100;
const MAX_SUGGESTED_PER_WEEK = 10;

/**
 * Layer 1 (FREE): promote companies the ATS already collected — candidate employers from
 * resumes, client companies from website intake — into the monitored set. Pre-qualified by
 * reality: they employ GTM talent or asked us for a search. Cost: pure HTTP probes, $0.
 */
async function promoteExistingCompanies(): Promise<{ promoted: number; skipped: number }> {
  const currentTargets = await prisma.company.count({ where: { isGtmTarget: true } });
  const room = Math.min(MAX_NEW_TARGETS_PER_WEEK, MAX_TOTAL_TARGETS - currentTargets);
  if (room <= 0) return { promoted: 0, skipped: 0 };

  // Over-fetch, then ICP-filter, then take `room` survivors — otherwise a batch of junk
  // (consultancies, parse artifacts) would consume the whole weekly quota and starve real
  // candidates behind it.
  const pool = await prisma.company.findMany({
    where: { isGtmTarget: false },
    orderBy: { createdAt: "desc" },
    take: room * 5,
  });

  const eligible: typeof pool = [];
  let skipped = 0;
  for (const c of pool) {
    const verdict = isLikelyIcpCompany(c.name, c.fundingStage);
    if (!verdict.ok) {
      console.log(`audit: skipping "${c.name}" — ${verdict.reason}`);
      skipped++;
      continue;
    }
    if (eligible.length < room) eligible.push(c);
  }

  const results = await mapLimit(eligible, 4, async (c) => {
    const found = await discoverAts(c.name).catch(() => null);
    await prisma.company.update({
      where: { id: c.id },
      data: found
        ? { isGtmTarget: true, atsType: found.atsType, atsSlug: found.atsSlug }
        : // Still targeted, but marked unknown — the weekly self-heal re-probes these, so a
          // company that adopts a supported ATS later joins the monitor automatically.
          { isGtmTarget: true, atsType: "unknown" },
    });
    return found ? 1 : 0;
  });
  return { promoted: results.reduce<number>((a, b) => a + b, 0), skipped };
}

/**
 * Layer 2 (~2-3c/week): one capped AI call suggests companies we'd never otherwise encounter.
 * The free ATS probe is the verification gate — a hallucinated or irrelevant name can't resolve
 * a real job board, so it never enters the monitor.
 */
async function suggestNewCompanies(): Promise<number> {
  const currentTargets = await prisma.company.count({ where: { isGtmTarget: true } });
  // Short-circuit BEFORE the API call — a full roster costs nothing at all.
  if (currentTargets >= MAX_TOTAL_TARGETS) return 0;

  const existing = await prisma.company.findMany({
    where: { isGtmTarget: true },
    select: { name: true },
  });
  const names = await suggestGtmCompanies(existing.map((c) => c.name)).catch(() => [] as string[]);

  let added = 0;
  for (const raw of names.slice(0, MAX_SUGGESTED_PER_WEEK)) {
    const name = raw.trim();
    if (!name) continue;
    // Same ICP gate as Layer 1 — the model can suggest a consultancy or staffing firm.
    // Check BEFORE findOrCreateCompany so a rejected suggestion doesn't create a row at all.
    const verdict = isLikelyIcpCompany(name);
    if (!verdict.ok) {
      console.log(`audit: skipping suggestion "${name}" — ${verdict.reason}`);
      continue;
    }
    // Route through the shared fuzzy dedupe so "Vanta"/"Vanta Inc" don't split.
    const company = await findOrCreateCompany(name);
    if (company.isGtmTarget) continue; // already monitored

    const found = await discoverAts(company.name).catch(() => null); // THE GATE
    if (found) {
      await prisma.company.update({
        where: { id: company.id },
        data: { isGtmTarget: true, atsType: found.atsType, atsSlug: found.atsSlug },
      });
      added++;
    }
    // No board found -> leave isGtmTarget false. Speculative names don't accumulate as dead weight.
  }
  return added;
}

export async function runWeeklyAudit(): Promise<void> {
  // Idempotency: at most one audit per calendar day (crons can retry).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const already = await prisma.gtmAudit.findFirst({ where: { runAt: { gte: startOfDay } } });
  if (already) return;

  const since = new Date(Date.now() - WEEK_MS);

  // (1) COVERAGE SELF-HEAL — re-probe companies stuck at "unknown"; some adopt a supported ATS
  // over time. Newly resolved ones get monitored from the next run.
  const unknown = await prisma.company.findMany({
    where: { isGtmTarget: true, atsType: "unknown" },
  });
  const recoveries = await mapLimit(unknown, 4, async (c) => {
    const found = await discoverAts(c.name).catch(() => null);
    if (!found) return 0;
    await prisma.company.update({
      where: { id: c.id },
      data: { atsType: found.atsType, atsSlug: found.atsSlug },
    });
    return 1;
  });
  const recovered = recoveries.reduce<number>((a, b) => a + b, 0);

  // (2) NEW-COMPANY DISCOVERY — free pipeline harvest first, then the capped AI suggestion.
  const promotion = await promoteExistingCompanies().catch((e) => {
    console.error("audit: promoteExistingCompanies failed", e);
    return { promoted: 0, skipped: 0 };
  });
  const promotedFromDb = promotion.promoted;
  const suggestedAdded = await suggestNewCompanies().catch((e) => {
    console.error("audit: suggestNewCompanies failed", e);
    return 0;
  });

  // (3) QUALITY LEARNING — the owner's own signals. A won opportunity (job with a linked
  // Project created this week) raises its company's icpBoost; a dismissal lowers it.
  const wonProjects = await prisma.project.findMany({
    where: { createdAt: { gte: since }, jobId: { not: null } },
    select: { job: { select: { companyId: true } } },
  });
  const dismissed = await prisma.job.findMany({
    where: { dismissedAt: { gte: since }, companyId: { not: null } },
    select: { companyId: true },
  });

  const delta = new Map<string, number>();
  for (const p of wonProjects) {
    const id = p.job?.companyId;
    if (id) delta.set(id, (delta.get(id) ?? 0) + WIN_BOOST);
  }
  for (const j of dismissed) {
    if (j.companyId) delta.set(j.companyId, (delta.get(j.companyId) ?? 0) - DISMISS_PENALTY);
  }

  for (const [companyId, d] of delta) {
    const co = await prisma.company.findUnique({
      where: { id: companyId },
      select: { icpBoost: true },
    });
    if (!co) continue;
    const next = Math.max(BOOST_MIN, Math.min(BOOST_MAX, (co.icpBoost ?? 0) + d));
    await prisma.company.update({ where: { id: companyId }, data: { icpBoost: next } });
  }

  // (4) SNAPSHOT — record the week so improvement is measurable and surfaceable.
  const companiesTotal = await prisma.company.count({ where: { isGtmTarget: true } });
  const companiesResolved = await prisma.company.count({
    where: { isGtmTarget: true, atsType: { notIn: ["unknown"] }, NOT: { atsType: null } },
  });
  const companiesUnknown = await prisma.company.count({
    where: { isGtmTarget: true, atsType: "unknown" },
  });
  const opportunities = await prisma.job.count({ where: { isGtmOpportunity: true } });

  await prisma.gtmAudit.create({
    data: {
      companiesTotal,
      companiesResolved,
      companiesUnknown,
      recoveredThisRun: recovered,
      promotedFromDb,
      suggestedAdded,
      opportunities,
      winsLastWeek: wonProjects.length,
      dismissalsLastWeek: dismissed.length,
      notes:
        `Recovered ${recovered} ATS; promoted ${promotedFromDb} from pipeline ` +
        `(${promotion.skipped} skipped as non-ICP); added ${suggestedAdded} suggested; ` +
        `adjusted ${delta.size} companies' icpBoost ` +
        `(${wonProjects.length} wins, ${dismissed.length} dismissals).`,
    },
  });
}
