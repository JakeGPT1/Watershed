# Execution plan — Robust US-city recognition via a static Census dataset (NO AI)

> **For the executing model (Sonnet):** Read `src/lib/gtm/filter.ts` first. This replaces
> the hardcoded 31-city allowlist with a comprehensive static set of US place names from
> the US Census Bureau, committed to the repo as JSON. No AI calls, no new services, no
> schema change, no migration.

## Problem
The current rules fail CLOSED for any bare US city not on the 31-name allowlist — a
"Sr. AE — Carlsbad" posting at a San Diego company is silently excluded. The fix is a
complete US place-name set, checked as a tier in the existing ordering.

## Design

### 1. One-time dataset build — `scripts/build-us-cities.mjs`
Source: **US Census Bureau Gazetteer Files** (public domain). Current national "Places" file:
`https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteers/2024_Gaz_place_national.zip`
(if 2024 404s, try 2023 in the same path pattern; the format is stable).
The zip contains one tab-separated .txt with a `NAME` column like `Carlsbad city`,
`Boulder city`, `St. Louis city`.

Script behavior (run once, commit the OUTPUT, the script itself, and never run at build time):
1. Download + unzip (Node has no unzip built-in: fetch the zip, then extract via PowerShell
   `Expand-Archive` from the script with `execFileSync`, or simpler — download to a temp dir
   and shell out. Keep it simple; this is a one-time generator.)
2. Parse rows; strip the trailing legal-type descriptor from NAME
   (` city`, ` town`, ` village`, ` borough`, ` CDP`, ` municipality`, ` corporation`, etc. —
   strip the LAST word only when it matches that list, case-sensitively as Census writes them).
3. Normalize: lowercase, trim, collapse whitespace.
4. **Drop names shorter than 4 characters** (avoids absurd substring/word collisions like
   "Roy", "Ada") and **drop a small manual exclusion list** of US place names that are
   overwhelmingly more famous as foreign cities or common words, at minimum:
   `london, dublin, paris, berlin, munich, madrid, barcelona, amsterdam, toronto, vancouver,
   sydney, melbourne, tokyo, manila, moscow, athens, rome, milan, naples, florence, venice,
   geneva, oxford, cambridge, mobile, normal, home, hurricane, remote, industry, cosmopolis`.
   (`mobile`/`normal`/etc. are real US cities but also ordinary words that appear in job
   location strings for other reasons; the state-abbrev tier still catches "Mobile, AL".)
5. Dedupe; sort; write `src/lib/gtm/us-places.json` as a flat string array.
   Expect roughly 15–20k names, a few hundred KB — fine to commit.
6. Print the count and 5 sample names.

### 2. Filter change — `src/lib/gtm/filter.ts`
1. `import usPlaces from "./us-places.json"` and build once at module load:
   `const US_PLACES = new Set<string>(usPlaces);`
   (Confirm `tsconfig.json` has `resolveJsonModule` — Next's default does.)
2. Matching helper: the location string, lowercased, is split on delimiters
   (`,`, `-`, `/`, `|`, `(`, `)`) into segments; each segment trimmed/whitespace-collapsed.
   A segment counts as a US city if the WHOLE segment is in the Set (segment-exact match, not
   substring — "New Berlin" the segment would need to be in the set itself, which it is;
   substring matching would wrongly fire on fragments).
3. **Insert as a new tier in this exact order (ordering is load-bearing):**
   1. null/empty → false
   2. non-US country/region markers → false          (unchanged)
   3. US phrase / state name / state abbrev → true    (unchanged)
   4. non-US city blocklist → false                   (unchanged — MUST stay before the big set
      so bare "London"/"Dublin" resolve non-US even though they're also US place names;
      they're in the dataset exclusion list anyway — belt and braces)
   5. **NEW: segment-exact match against US_PLACES → true**
   6. `\bremote\b` → true                             (unchanged)
   7. else → false
4. The old 31-name `US_CITY_MARKERS` array becomes redundant — REMOVE it and its check
   (the dataset covers all of them; verify "san francisco", "new york", "salt lake city"
   are present in the generated JSON before removing).
5. `isUsLocation` signature and the `GTM_US_ONLY` kill switch are unchanged; monitor.ts
   needs NO changes.

## Verification (all required)
1. Run the generator; confirm count printed (expect 15k–20k) and that the JSON contains
   `carlsbad`, `boulder`, `el segundo`, `san francisco`, `salt lake city`, and does NOT
   contain `london`, `dublin`, `paris`, `toronto`.
2. `npm run build` — zero type errors (also proves the JSON import bundles fine).
3. `scripts/verify-us-cities.ts` (tsx, async main) — assert:
   - The original 11-row table from US_FILTER_PLAN.md ALL still pass (regression).
   - NEW rows: `Carlsbad` → true, `Boulder` → true, `El Segundo` → true, `Irvine` → true,
     `Carlsbad, CA` → true, `Kitchener` → false, `Winnipeg` → false, `London` → false,
     `Paris` → false, `Berlin` → false, `Mumbai` → false, `Springfield` → true.
   - Print PASS/FAIL per row, nonzero exit on any FAIL.
4. Live monitor run (same tsx harness as before): board before/after, assert every surviving
   opportunity passes `isUsLocation`.
5. Delete the throwaway verify script (KEEP `build-us-cities.mjs` — it's the documented
   regenerator). Commit (code + JSON + generator), push, confirm auto-deploy reaches Ready.

## Hard rules
- NO AI calls anywhere in this feature.
- Segment-exact matching against the set — never substring.
- Tier ordering above is exact; the non-US city blocklist stays ahead of the dataset check.
- No schema change, no new npm dependencies.
- Fail closed: a location that matches nothing is non-US.

## Final report
Dataset source + count, exclusion-list rationale, verification table results, before/after
board, note that `build-us-cities.mjs` regenerates the JSON if Census updates. STOP.
