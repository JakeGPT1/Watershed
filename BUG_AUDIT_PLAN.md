# Execution plan — Bug audit + fixes

> **For Sonnet:** These are SPECIFIC suspected bugs found by code reasoning — confirm each
> with a quick test/inspection, fix, and verify. Work top-down (ordered by severity). One
> commit per fix or one combined commit at the end; push once at the end; confirm deploy
> Ready via the usual monitor loop.

## BUG 1 (HIGH, money-path) — `isUsLocation` state-abbrev false positives on common words
`US_STATE_ABBR_RE` in `src/lib/gtm/filter.ts` matches lowercase 2-letter tokens like
`in` (Indiana), `or` (Oregon), `me`, `hi`, `ok`, `de`, `la`, `ca` as whole words. Location
strings like **"Hybrid in London"** ("in"), **"London or Dublin"** ("or"), **"Toronto, CA"**
("ca") classify as US — the US-signal tier runs BEFORE the non-US city blocklist, so the
blocklist never gets a chance.
**Confirm:** `isUsLocation("Hybrid in London")` — expect the buggy `true`.
**Fix:** make the abbreviation check CASE-SENSITIVE against the ORIGINAL (non-lowercased)
string, uppercase-only abbreviations, and require the abbrev to be preceded by a comma
(optionally with space) or start-of-string: pattern like
`/(^|,\s*)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(\s|,|$)/`
applied to the raw `location` (keep everything else lowercase-based). "Austin, TX" still
passes; "Hybrid in London" no longer does (then the city blocklist catches London).
**Test rows to add to the verify script:** "Hybrid in London"→false, "London or Dublin"→false,
"Toronto, CA"→false (toronto is in the city blocklist — verify order still catches it),
"Austin, TX"→true, "Boston, MA"→true, "Salem, OR"→true.

## BUG 2 (HIGH, crash) — Winning the same opportunity twice crashes
`Project.jobId` is `@unique`; `winOpportunity` (`src/app/(app)/jobs/actions.ts`) always
`prisma.project.create(...)` with the jobId. Clicking "Win → Create Project" on a job that
already has a project throws P2002 → error overlay.
**Fix:** first `prisma.project.findUnique({ where: { jobId } })`; if it exists, just
`redirect(/projects/{existing.id})` (idempotent win). No schema change.

## BUG 3 (MEDIUM, product logic) — Dismissed opportunities resurrect on the next monitor run
`dismissOpportunity` sets `isGtmOpportunity: false`, but `runGtmMonitor` re-picks the same
posting by `externalId` next run and flips it back to `true`. Weekly cron will resurrect
everything the user dismissed.
**Fix (small migration):** add `dismissedAt DateTime?` to Job (hand-written migration file +
`npx prisma migrate deploy` + `npx prisma generate` — stop the dev server first if EPERM,
and run migrate BEFORE pushing code, same order as prior migrations).
- `dismissOpportunity` sets `dismissedAt: new Date()` alongside `isGtmOpportunity: false`.
- In `runGtmMonitor`, when the picked posting's existing job has `dismissedAt` set, DON'T
  re-promote it — instead pick the next-best qualifying posting for that company
  (restructure `pickBestPosting` to return the sorted list; walk it until a posting whose
  existing job isn't dismissed, checking `externalId` lookups; cap the walk at ~5 lookups).
- Manual "Refresh Matches"/matching is unaffected.

## BUG 4 (MEDIUM, prod timeout risk) — Candidate-save actions now do heavy AI work with default serverless timeout
`recomputeCandidateEmbedding` re-matches all live GTM opportunities (rationale calls for new
top-5 entrants). A transcript upload = Claude summarize + tagging + embedding + up to
4 jobs × rationale — can exceed Vercel's DEFAULT function duration even though the cron
route sets `maxDuration = 60`.
**Fix:** add `export const maxDuration = 60;` to the route-segment files whose server
actions do AI work: the pages under `src/app/(app)/candidates/**`, `src/app/(app)/jobs/**`,
and `src/app/(app)/projects/**` that define or invoke those actions (Next applies segment
config to actions invoked from that segment — verify placement compiles; if segment config
on a page doesn't cover its actions in this Next version, place it in the layout).
**Verify:** `npm run build` shows no segment-config errors.

## BUG 5 (LOW, correctness) — `ensureCompaniesResolved` redundant condition
`if (!company.atsType && company.atsType !== "unknown")` — the second clause is dead
(if atsType is falsy it can't equal "unknown"). Harmless but confusing; simplify to
`if (!company.atsType)`. Comment stays.

## Sweep A (bounded) — every server action starts with `requireOwner()`
`grep -n "export async function" src/app/**/actions.ts` and confirm each body's first
statement is `await requireOwner();` (login/signOut actions exempt). Report any misses and
fix them.

## Sweep B (bounded) — unhandled thrown Errors that users can trigger from forms
Actions throw raw `Error` for validation (e.g. LinkedIn URL shape, empty transcript). That
surfaces as Next's error overlay — ugly but functional. DO NOT redesign error handling now;
just LIST the user-triggerable throw sites in the final report so the user can decide later.

## Verification
1. Rules unit script (tsx, throwaway): BUG 1 rows above + re-run the 23-row table from the
   US-cities work (recreate it inline; the old script was deleted).
2. BUG 2: script — create project for a live opp's jobId, call the same logic again, assert
   redirect-to-existing behavior (or that no P2002 escapes); clean up test project.
3. BUG 3: script — dismiss a live opp (set dismissedAt via the action logic), run
   `runGtmMonitor()`, assert that job stays `isGtmOpportunity: false` and (if the company
   has another qualifying US GTM posting) a different posting was promoted; then undo:
   clear dismissedAt and re-run monitor to restore the real board.
4. `npm run build` clean; commit; push; deploy Ready; `curl` prod 307.
5. Final report: per-bug confirm/fix/verify status, Sweep A result, Sweep B list. STOP.
