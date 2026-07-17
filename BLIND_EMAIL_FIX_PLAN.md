# Fix plan — "No JSON in model response" on Draft Blind Email

> **For the executing model (Sonnet):** Follow in order. Step 0 diagnoses with real data;
> steps 1–4 are the fix. The fix should be applied regardless of what step 0 shows —
> it makes the JSON contract structurally guaranteed instead of prompt-hoped.

## Symptom
Clicking "Draft Blind Email" on `/jobs` throws `No JSON in model response` from
`parseJson` (`src/lib/ai.ts:17`) via `draftBlindOutreach`. The standalone leak-test
script passed with a rich synthetic candidate; the button fails with the real DB
candidate. Likely: sparse candidate fields (empty summary/skills) → model responds
with prose instead of JSON. Possible secondary: `max_tokens: 700` truncation (no
closing `}`).

## Step 0 — Reproduce and capture the raw output (diagnosis, ~5 min)
Write a throwaway `scripts/debug-blind-raw.mjs`:
- Load the real top opportunity + its top-matched candidate from the DB (same query as
  `draftBlindEmail` in `src/app/(app)/jobs/actions.ts`).
- Print the exact input object that would be passed to `draftBlindOutreach`
  (summary/seniority/skills/location — note which are empty).
- Call the API with the same prompt and print RAW response text + `stop_reason`.
Run with `node --env-file=.env scripts/debug-blind-raw.mjs`. Note the failure mode in
your final report (prose refusal vs truncation vs something else). Delete the script after.

## Step 1 — Force the JSON shape with assistant prefill (the core fix)
In `src/lib/ai.ts` → `draftBlindOutreach`:
- Add an assistant prefill message so the model MUST continue a JSON object:
  ```ts
  messages: [
    { role: "user", content: /* existing prompt */ },
    { role: "assistant", content: "{" },
  ],
  ```
- The returned text now LACKS the leading `{` — parse `"{" + textOf(msg)`.
- Raise `max_tokens` to 1024.
- After the call, check `msg.stop_reason === "max_tokens"` → throw a clear error
  (`"Blind draft truncated — retry"`) instead of letting parseJson fail cryptically.

## Step 2 — Retry once on parse failure
Still in `draftBlindOutreach`: wrap the call+parse in a small helper — on ANY error
(parse or truncation), retry ONCE (a second API call). If the retry also fails, throw
`new Error("Could not generate blind draft: " + first 200 chars of raw response)` so the
UI error is actionable. No retry loops beyond 1.

## Step 3 — Harden the inputs for sparse candidates
In `src/app/(app)/jobs/actions.ts` → `draftBlindEmail`, before calling `draftBlindOutreach`:
- Substitute explicit placeholders for empty fields:
  `candidateSummary: candidate.summary || "(no summary on file — describe only from skills/title/location provided)"`,
  `candidateSeniority: candidate.currentTitle || "(not specified)"`,
  `candidateSkills: tags.join(", ") || "(none listed)"`,
  `candidateLocation: candidate.location || "(not specified)"`.
- If summary AND skills AND title are ALL empty, throw
  `new Error("Top candidate has no profile data yet — add a resume, notes, or LinkedIn text first")`
  (a truthful, actionable message instead of a garbage AI draft).

## Step 4 — Friendlier failure surface (small)
`draftBlindEmail` currently lets errors bubble as a Next.js error overlay. Keep the throw
(acceptable per earlier decisions) but ensure the message is the actionable one from
steps 1–3, not `No JSON in model response`.

## Verification (all required)
1. `npm run build` — zero type errors.
2. Re-run the EXISTING `scripts/verify-blind-email.mjs` — must still be ALL PASS
   (update it to mirror the prefill approach so it tests the same code path shape).
3. NEW: extend `verify-blind-email.mjs` with a SPARSE-candidate case — summary/skills
   empty, only title "Engineer" + location — assert it still returns valid JSON
   subject+body (this reproduces the original failure condition).
4. Trigger the real code path end-to-end: a throwaway script that imports nothing from
   the app but replicates `draftBlindEmail`'s exact query + calls, OR (better) use
   `npx tsx --env-file=.env` with a small wrapper importing the REAL
   `draftBlindOutreach` from `../src/lib/ai` (wrap in async main() — tsx CJS mode
   rejects top-level await) and the REAL top candidate from the DB. Must produce a
   parseable draft with the real data that previously failed. Clean up test Outreach rows.
5. Report: root cause found in step 0, what changed, verification output, then STOP.
