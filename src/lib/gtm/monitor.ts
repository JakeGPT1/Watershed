import { prisma } from "@/lib/prisma";
import { embed } from "@/lib/embedding";
import { matchCandidatesToJob } from "@/lib/matching";
import { GTM_SEED_COMPANIES } from "./companies";
import { discoverAts } from "./discover";
import { fetchPostings, type NormalizedPosting } from "./fetchPostings";
import { isGtmRole, isLeadershipGtmRole, isUsLocation, hasNonUsRegionMarker, GTM_US_ONLY } from "./filter";

export interface MonitorRunResult {
  companiesChecked: number;
  companiesResolved: number;
  newlyDiscoveredCompanies: string[]; // resolved this run via slug discovery
  opportunityJobIds: string[]; // the curated top-N, one per company
}

// Bounded-concurrency map — parallelizes the monitor's external I/O (ATS discovery + posting
// fetches) so a large seed list finishes well under the serverless function timeout instead of
// running dozens of sequential HTTP round-trips (which pushed the run past 60s and crashed it).
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return results;
}

/** Ensure every seed company exists as a GTM-target Company row, resolving unknown ATS slugs. */
async function ensureCompaniesResolved(): Promise<string[]> {
  // Parallelize discovery — probing ATS slugs for a large seed list one-at-a-time is the
  // biggest first-run cost. Each seed is independent (distinct name), so this is race-free.
  const resolved = await mapLimit(GTM_SEED_COMPANIES, 6, async (seed) => {
    let company = await prisma.company.findFirst({ where: { name: seed.name } });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: seed.name,
          isGtmTarget: true,
          atsType: seed.atsType ?? null,
          atsSlug: seed.atsSlug ?? null,
        },
      });
    } else if (!company.isGtmTarget) {
      company = await prisma.company.update({
        where: { id: company.id },
        data: { isGtmTarget: true, atsType: company.atsType ?? seed.atsType ?? null, atsSlug: company.atsSlug ?? seed.atsSlug ?? null },
      });
    }

    // Resolve ATS only if not yet known — cache the result so we never re-probe a resolved company.
    if (!company.atsType) {
      const discovered = await discoverAts(seed.name).catch(() => null);
      if (discovered) {
        await prisma.company.update({
          where: { id: company.id },
          data: { atsType: discovered.atsType, atsSlug: discovered.atsSlug },
        });
        return seed.name; // newly resolved this run
      }
      // Mark unknown so we never re-probe — per spec, don't build scrapers for these in v1.
      await prisma.company.update({ where: { id: company.id }, data: { atsType: "unknown" } });
    }
    return null;
  });

  return resolved.filter((n): n is string => n !== null);
}

/** GTM+US-qualifying postings for a company, best (leadership, then most recent) first. */
function rankQualifyingPostings(postings: NormalizedPosting[]): NormalizedPosting[] {
  const gtm = postings.filter((p) => {
    if (!isGtmRole(p.title, p.department)) return false;
    if (!GTM_US_ONLY) return true;
    // Title/department can name a non-US region even when the bare location string
    // collides with a US place name (e.g. "Eastern Europe" role based in "Warsaw").
    if (hasNonUsRegionMarker(p.title) || hasNonUsRegionMarker(p.department ?? "")) return false;
    return isUsLocation(p.location);
  });
  // Leadership hires first (strongest buying signal), then most recent.
  gtm.sort((a, b) => {
    const aLead = isLeadershipGtmRole(a.title) ? 1 : 0;
    const bLead = isLeadershipGtmRole(b.title) ? 1 : 0;
    if (aLead !== bLead) return bLead - aLead;
    const aTime = a.postedAt?.getTime() ?? 0;
    const bTime = b.postedAt?.getTime() ?? 0;
    return bTime - aTime;
  });
  return gtm;
}

const MAX_DISMISSED_SKIPS = 5;

export async function runGtmMonitor(): Promise<MonitorRunResult> {
  const newlyDiscoveredCompanies = await ensureCompaniesResolved();

  const targets = await prisma.company.findMany({
    where: { isGtmTarget: true, atsType: { not: "unknown" }, NOT: { atsType: null } },
  });

  const opportunityJobIds: string[] = [];

  // Fetch every company's postings in parallel first (the slowest, most variable external I/O),
  // then process the results sequentially so the DB writes / embeds stay simple and ordered.
  const fetched = await mapLimit(targets, 6, async (company) => {
    if (!company.atsType || !company.atsSlug || company.atsType === "unknown") {
      return { company, postings: null as NormalizedPosting[] | null };
    }
    const postings = await fetchPostings(
      company.atsType as "greenhouse" | "lever" | "ashby",
      company.atsSlug
    ).catch(() => null);
    return { company, postings };
  });

  for (const { company, postings } of fetched) {
    if (!postings || postings.length === 0) continue;

    const ranked = rankQualifyingPostings(postings);
    if (ranked.length === 0) continue;

    // Walk the ranked list, skipping any posting the user already dismissed — otherwise
    // the monitor would silently resurrect it on the very next run.
    let best: NormalizedPosting | null = null;
    let existing: Awaited<ReturnType<typeof prisma.job.findUnique>> = null;
    for (const candidate of ranked.slice(0, MAX_DISMISSED_SKIPS)) {
      const found = await prisma.job.findUnique({ where: { externalId: candidate.externalId } });
      if (found?.dismissedAt) continue;
      best = candidate;
      existing = found;
      break;
    }
    if (!best) continue;

    const matchText = `${best.title}\n${best.department ?? ""}\n${best.description}`.slice(0, 24000);
    const vector = JSON.stringify(await embed(matchText));

    let job;
    if (existing) {
      job = await prisma.job.update({
        where: { id: existing.id },
        data: {
          title: best.title,
          department: best.department,
          location: best.location,
          postedAt: best.postedAt,
          sourceUrl: best.url,
          rawText: best.description,
          isGtmOpportunity: true,
          isLeadershipRole: isLeadershipGtmRole(best.title),
          discoveredAt: new Date(),
        },
      });
    } else {
      job = await prisma.job.create({
        data: {
          title: best.title,
          companyId: company.id,
          sourceUrl: best.url,
          rawText: best.description,
          externalId: best.externalId,
          department: best.department,
          location: best.location,
          postedAt: best.postedAt,
          isGtmOpportunity: true,
          isLeadershipRole: isLeadershipGtmRole(best.title),
          discoveredAt: new Date(),
        },
      });
    }
    await prisma.$executeRaw`update "Job" set embedding = ${vector}::vector where id = ${job.id}`;

    // Any GTM posting NOT chosen as the top pick for this run no longer counts as
    // the live opportunity for this company (only one opportunity per company at a time).
    await prisma.job.updateMany({
      where: { companyId: company.id, isGtmOpportunity: true, id: { not: job.id } },
      data: { isGtmOpportunity: false },
    });

    opportunityJobIds.push(job.id);
  }

  // Stale-cleanup: a company whose only GTM roles are non-US now picks nothing new
  // this run, so its previously-surfaced non-US opportunity would otherwise linger.
  if (GTM_US_ONLY) {
    const current = await prisma.job.findMany({
      where: { isGtmOpportunity: true },
      select: { id: true, title: true, department: true, location: true },
    });
    for (const j of current) {
      const isUs =
        !hasNonUsRegionMarker(j.title) &&
        !hasNonUsRegionMarker(j.department ?? "") &&
        isUsLocation(j.location);
      if (!isUs) {
        await prisma.job.update({ where: { id: j.id }, data: { isGtmOpportunity: false } });
      }
    }
  }

  // Auto-match candidates against every current opportunity (not just those surfaced this
  // run), so the displayed top-3 always have fresh matches. Ranking is pgvector-only/cost-free.
  const liveOpps = await prisma.job.findMany({
    where: { isGtmOpportunity: true },
    select: { id: true },
  });
  for (const { id } of liveOpps) {
    await matchCandidatesToJob(id);
  }

  return {
    companiesChecked: GTM_SEED_COMPANIES.length,
    companiesResolved: targets.length,
    newlyDiscoveredCompanies,
    opportunityJobIds,
  };
}
