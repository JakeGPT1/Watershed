# Execution plan — Blind email v2: sender-forward, candidate-blind, harder sell

> **For Sonnet:** Two files: `src/lib/ai.ts` (prompt) and `src/app/(app)/jobs/actions.ts`
> (redaction backstop). No schema change, no UI change.

## What the user clarified
- The SENDER (Jake / Watershed) must be prominent — the email's end goal is relationship-
  building: "think of Watershed whenever you're hiring GTM talent." Never redact or soften
  the sender identity.
- Only the CANDIDATE is blind. And the pitch should sell them as hard as possible —
  compelling, specific-sounding achievements — while staying unguessable/uncontactable.
- Bug to fix: the `redactName` backstop strips every token of the candidate's name from the
  draft. When a candidate shares a name token with the sender (the current DB candidate is
  literally named "Jake Braunscheidel"), the signature "Best,\nJake" becomes "[redacted]".

## Change 1 — `redactName` in `src/app/(app)/jobs/actions.ts`
Add a protected-token set and skip them:
```ts
const PROTECTED_TOKENS = new Set(["jake", "watershed"]); // sender identity — never redact
```
In `redactName`, filter candidate-name tokens: skip any token whose lowercase form is in
`PROTECTED_TOKENS` (in addition to the existing length>=3 rule). Rationale comment: a
candidate sharing a first name with the sender must not nuke the signature; the surname
token still gets redacted if leaked.

## Change 2 — rewrite the prompt in `draftBlindOutreachOnce` (`src/lib/ai.ts`)
Keep the forced tool-use structure, retry wrapper, max_tokens, blinding rules. Replace the
prompt text with (verbatim, keeping the input interpolations at the end as today):

> You are drafting a business-development email for Jake, founder of the recruiting firm
> Watershed. Jake is writing directly to a hiring manager about their open role. TWO GOALS:
> (1) make the featured candidate sound as compelling as possible for THIS role, and
> (2) position Jake/Watershed memorably — the reader should come away thinking "I should
> talk to Watershed when I'm hiring GTM talent," even if this candidate isn't the one.
>
> SENDER IS NOT ANONYMOUS: write in Jake's first-person voice, reference Watershed by name
> once in the body (e.g. "at Watershed I focus on placing GTM leaders at AI companies"),
> and sign off "Best,\nJake\nFounder, Watershed".
>
> CANDIDATE IS BLIND: the subject and body MUST NOT contain the candidate's name or any part
> of it; names of their current/past employers; or any uniquely identifying, reverse-
> searchable detail (specific product names, unusual exact titles, personal URLs, exact
> tenure dates). Instead SELL them generically but vividly: seniority, years as a range,
> quantified wins kept generic ("grew a book 3x", "closed multiple 7-figure deals"), the
> TYPE of company they've worked at, general region, and precisely WHY they map to this
> role's needs. The reader should be intrigued enough to reply, and unable to find the
> candidate on their own.
>
> Do not invent facts beyond what is provided. Confident, direct, warm; <=170 words; end
> with a specific, low-friction call to action to book a 15-minute call.

(Keep the final line instructing the model to call submit_blind_draft.)

## Verification (one script, then delete)
`scripts/verify-blind-v2.mjs` — mirror the existing forced-tool harness in the old
verify-blind-email.mjs. TWO cases:
1. **Name-collision case (the reported bug):** synthetic candidate named
   "Jake Quackenbush" at "MoonjuiceRobotics". Generate, apply the UPDATED redactName
   (copy the new implementation incl. PROTECTED_TOKENS into the script). ASSERT:
   - body contains "Jake" (signature intact) and "Watershed";
   - body does NOT contain "Quackenbush" or "Moonjuice";
   - body signature line mentions "Founder, Watershed".
2. **Sell-quality smoke:** assert body length > 400 chars, mentions the target company,
   and contains at least one of the generic-win phrasings is NOT required — just print the
   draft for the user to eyeball tone.
Also re-run assertions that the real candidate name tokens (from the top ClickUp match)
would not appear — optional; skip if it costs another API call.

Then: `npm run build`, commit, push, confirm deploy Ready (standard monitor loop). Report:
what changed, the collision-case results, the printed sample draft, STOP.
