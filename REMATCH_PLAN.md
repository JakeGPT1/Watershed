# Execution plan — Matches always reflect the current best candidates

> **For Sonnet:** Small, surgical change. Read `src/lib/matching.ts` and
> `src/lib/embedding.ts` first. No schema change, no new deps, no UI redesign.

## Problem
Matches are computed only when the monitor runs (weekly) or via the job-detail Refresh
button. Adding/enriching a candidate does NOT re-rank existing opportunities, and stale
Match rows are never pruned — so a new best-fit candidate (e.g. for the ClickUp job)
doesn't appear until a manual refresh, and old weaker matches linger below the top-5.

## Changes (3, in order)

### 1. `src/lib/matching.ts` — prune stale + skip redundant rationale calls
In `matchCandidatesToJob(jobId, limit)`:
- After computing `hits`, DELETE Match rows for this job whose candidateId is NOT in the
  new hit list: `prisma.match.deleteMany({ where: { jobId, candidateId: { notIn: hits.map(h => h.id) } } })`.
- Token efficiency: before the per-hit loop, load existing matches for the job into a Map.
  For a hit whose existing row has a rationale AND `Math.abs(existing.score - hit.score) < 0.02`,
  upsert the score WITHOUT calling `matchRationale` (reuse the stored rationale). Only new
  candidates or materially-moved scores pay for a Claude call.

### 2. `src/lib/embedding.ts` — re-match live opportunities when a candidate changes
At the END of `recomputeCandidateEmbedding` (after the embedding write), add:
```ts
const liveOpps = await prisma.job.findMany({
  where: { isGtmOpportunity: true },
  select: { id: true },
});
for (const j of liveOpps) {
  await matchCandidatesToJob(j.id).catch(console.error);
}
```
Import from `@/lib/matching`. **Check for circular imports:** matching.ts must not import
embedding.ts (it doesn't today — it uses the stored pgvector columns). Thanks to change #1,
these re-runs are cheap: unchanged pairs reuse rationales; typically only the new/edited
candidate triggers one rationale call per job it newly cracks the top-5 of.
This makes every candidate add/enrich (resume, note, transcript, LinkedIn — they all call
recomputeCandidateEmbedding) instantly re-rank the GTM board.

### 3. `src/app/(app)/jobs/page.tsx` — Refresh button on GTM cards
The GTM opportunity cards have no refresh control (only `/jobs/[id]` does). Add a small
"Refresh Matches" button next to Dismiss, form-bound to the EXISTING `refreshJobMatches`
action — but that action revalidates only `/jobs/{jobId}`; add `revalidatePath("/jobs")`
to it so the list page updates too.

## Verification (keep it cheap — one script, one run)
1. `npm run build` — zero type errors.
2. `scripts/verify-rematch.ts` (tsx --env-file=.env, async main, then DELETE it):
   - Create a synthetic candidate whose summary closely mirrors the ClickUp opportunity's
     text ("mid market account executive, expansion sales, SaaS quota..."), then call
     `recomputeCandidateEmbedding(candidate.id)` — the REAL code path.
   - Assert: a Match row now exists for (ClickUp job, synthetic candidate) and its score is
     the highest for that job (top of `orderBy score desc`).
   - Assert: `prisma.match.count({ where: { jobId } })` ≤ 5 (prune works).
   - Re-run `matchCandidatesToJob(jobId)` once more and confirm it completes without new
     rationale calls for unchanged pairs (log from the reuse branch or just assert rationales
     unchanged by comparing before/after strings).
   - Cleanup: delete the synthetic candidate's matches + candidate, then re-run
     `matchCandidatesToJob` for the touched jobs so the real board re-settles.
3. Commit + push (auto-deploys). No prod poke needed — the user will see their real new
   candidate appear on the ClickUp card after one click of the new Refresh button (or
   automatically the next time they edit that candidate).

## Hard rules
- Reuse the existing `matchRationale` — no new AI functions.
- Fire-and-forget failures in the embedding hook must not break candidate saves
  (`.catch(console.error)`, same as existing calls).
- Keep `MAX`/limit at 5. No schema change.
