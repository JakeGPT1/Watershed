// Ranks GTM opportunities by fit to Watershed's ideal clientele: a go-to-market search firm
// placing Sales & Marketing talent at companies scaling revenue, so the best BD targets are
// growth-stage companies hiring GTM leaders. Weights are heuristic and tunable.

type IcpJob = {
  isLeadershipRole: boolean;
  discoveredAt: Date | null;
  company: { fundingStage: string | null; icpBoost?: number } | null;
};

const STAGE_WEIGHT: Record<string, number> = {
  "series-b": 40,
  "series-a": 38,
  "series-c": 35,
  seed: 28,
  "series-d-plus": 25,
  bootstrapped: 18,
  "pre-seed": 15,
  public: 12,
  "pe-owned": 10,
  acquired: 8,
};

/** Higher = better fit for Watershed's ideal clientele. */
export function icpScore(job: IcpJob, now: number = Date.now()): number {
  const stage = job.company?.fundingStage ?? null;
  let score = stage ? STAGE_WEIGHT[stage] ?? 20 : 20; // unknown/unset = neutral 20
  if (job.isLeadershipRole) score += 20; // leadership placements = biggest BD value
  if (job.discoveredAt) {
    const days = (now - job.discoveredAt.getTime()) / 86_400_000;
    score += Math.max(0, 14 - days); // fresher postings edge ahead
  }
  // Learned weekly from the owner's wins/dismissals (clamped ±15-20 by the audit, so it
  // nudges ordering without ever dominating or hiding anything).
  score += job.company?.icpBoost ?? 0;
  return score;
}
