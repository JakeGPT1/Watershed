# Execution plan — Restrict GTM opportunities to US-based jobs only

> **For the executing model (Sonnet):** Read the referenced files first. This adds a
> location filter so the GTM monitor only ever surfaces US-based roles. Scope is the GTM
> monitor ONLY — manually pasted jobs (`/jobs/new`) are intentionally exempt (the user chose
> those deliberately). No schema change (Job/posting already carry `location`).

## Why / what changes
Location strings from Greenhouse/Lever/Ashby are freeform and messy. Real examples seen live:
- US: `San Francisco`, `Austin, TX`, `Remote within US`, `Southern California`
- NON-US: `Abu Dhabi`, `Ireland - Dublin Office`, `London, England, United Kingdom`
As of now the board has 3 non-US opportunities that MUST disappear after this ships.

## Core piece — `isUsLocation` in `src/lib/gtm/filter.ts`
Add an exported `isUsLocation(location: string | null): boolean` next to `isGtmRole`.
Also export a kill-switch constant `export const GTM_US_ONLY = true;` (flip to false to
restore all-locations behavior).

**Classification, in THIS strict order (order matters — it resolves the "Dublin, OH" vs
"Dublin, Ireland" ambiguity):**
1. If `!location` (null/empty) → return `false`. (US-only means *confirmed* US; unknown can't be confirmed.)
2. Lowercase the string. If it contains any **country/region non-US marker** → `false`.
   Markers (non-exhaustive, include at least): `united kingdom`, `\buk\b`, `england`, `scotland`,
   `wales`, `ireland`, `canada`, `germany`, `france`, `spain`, `italy`, `netherlands`, `poland`,
   `portugal`, `sweden`, `switzerland`, `india`, `singapore`, `australia`, `japan`, `china`,
   `hong kong`, `brazil`, `mexico`, `argentina`, `israel`, `united arab emirates`, `\buae\b`,
   `saudi`, `qatar`, `\bemea\b`, `\bapac\b`, `\blatam\b`, `middle east`, `\beurope\b`, `\basia\b`,
   `eastern europe`, `nato`.
3. If it contains a **US signal** → `true`:
   - `united states`, `\busa\b`, `u.s.a`, `u.s.`, `\bus\b`
   - any full US state name (all 50 + `district of columbia` / `washington dc`)
   - any US state 2-letter abbreviation matched at a word boundary, e.g. `/(^|[,\s])(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)([,\s]|$)/i`
4. If it contains a **city-only non-US marker** → `false` (reached only when no US signal above):
   `london`, `dublin`, `toronto`, `vancouver`, `berlin`, `munich`, `paris`, `madrid`, `barcelona`,
   `amsterdam`, `bangalore`, `bengaluru`, `sydney`, `melbourne`, `tokyo`, `tel aviv`, `abu dhabi`,
   `dubai`, `são paulo`, `sao paulo`, `mexico city`.
   (Ordering note: `Dublin, OH` hits the US-abbrev signal in step 3 first → stays US; `Ireland -
   Dublin Office` is caught by `ireland` in step 2 → non-US. Verify both in tests.)
5. If it matches `/\bremote\b/` → `true`. (Bare "remote" at these US-HQ companies means US-remote;
   any non-US-qualified remote like "Remote - EMEA" was already excluded in step 2/4.)
   **DECISION FLAG:** if the user would rather bare "Remote" be excluded, delete this step —
   note it in the final report as the one judgment call.
6. Else → `false`.

## Wire into the monitor — `src/lib/gtm/monitor.ts`
1. Import `isUsLocation, GTM_US_ONLY` from `./filter`.
2. In `pickBestPosting`, change the GTM filter line to also require US location when the switch
   is on:
   ```ts
   const gtm = postings.filter(
     (p) => isGtmRole(p.title, p.department) && (!GTM_US_ONLY || isUsLocation(p.location))
   );
   ```
   Now each company's chosen opportunity is its best *US* GTM role, or none if it has no US GTM role.
3. **Stale-cleanup sweep (REQUIRED — without it, existing non-US opportunities linger).**
   The loop only demotes a company's other opportunities when it picks a NEW one; a company
   whose only GTM roles are non-US now yields `null` and its stale non-US opportunity would stay
   `isGtmOpportunity: true`. So at the END of `runGtmMonitor`, before the return, add:
   ```ts
   if (GTM_US_ONLY) {
     const current = await prisma.job.findMany({
       where: { isGtmOpportunity: true },
       select: { id: true, location: true },
     });
     for (const j of current) {
       if (!isUsLocation(j.location)) {
         await prisma.job.update({ where: { id: j.id }, data: { isGtmOpportunity: false } });
       }
     }
   }
   ```
   (Manual jobs are `isGtmOpportunity: false` already, so this never touches them.)

## Verification (all required)
1. **Unit table** — `scripts/verify-us-filter.ts` (run `npx tsx --env-file=.env`, async main),
   import the REAL `isUsLocation` from `../src/lib/gtm/filter` and assert this table exactly:
   | input | expected |
   |---|---|
   | `Abu Dhabi` | false |
   | `Ireland - Dublin Office` | false |
   | `London, England, United Kingdom` | false |
   | `San Francisco` | true |
   | `Austin, TX` | true |
   | `Remote within US` | true |
   | `Southern California` | true |
   | `Dublin, OH` | true |
   | `Remote` | true |
   | `Remote - EMEA` | false |
   | `null` | false |
   Print PASS/FAIL per row; nonzero exit on any FAIL.
2. **`npm run build`** — zero type errors.
3. **Live monitor run** — run `runGtmMonitor()` (same async-main tsx harness pattern used in
   prior verifications), then query `prisma.job.findMany({ where: { isGtmOpportunity: true }})`
   and assert EVERY surviving opportunity's `location` passes `isUsLocation`. Print each
   opportunity's company + location + US verdict. The known non-US ones (Abu Dhabi / Dublin /
   London) MUST be gone; any US role a company has should appear in their place.
4. Delete the throwaway scripts. Commit + push (auto-deploys). Confirm the deploy reaches Ready
   and, optionally, hit the cron endpoint with the secret to confirm a clean US-only run in prod.

## Hard rules
- GTM monitor only; do not filter manual `/jobs/new` jobs.
- `GTM_US_ONLY` kill-switch must cleanly restore old behavior when false (both the pick filter
  and the sweep are gated on it).
- Blocklist-before-US-signal-before-cityblocklist ordering is load-bearing — don't reorder.
- No schema change.

## Final report
Summarize the filter logic, the verification table results, the before/after opportunity board
(what got dropped), the one bare-"Remote" judgment call, then STOP.
