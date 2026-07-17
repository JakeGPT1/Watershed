# Execution plan — Blind BD email draft on GTM opportunities

> **For the executing model (Sonnet):** Follow this exactly. This adds a "Draft Blind
> Email" button to each GTM opportunity card (`/jobs`). It generates a business-development
> email pitching the opportunity's TOP-matched candidate to the hiring manager, with the
> candidate fully anonymized, then displays the draft in-app with a copy button.
> **No email is sent** — draft-and-copy only (stays within BUILD_SPEC's draft-only rule).
> Do not add SMTP, Resend, nodemailer, or any email transport.

## Context
- App root: `C:\Users\jdbra\OneDrive\Desktop\Watershed\watershed` (Next.js 16, TS, Tailwind, Prisma 6).
- Every server action starts with `await requireOwner()` from `@/lib/supabase/server`.
- The `Outreach` model already exists (`jobId`, `contactId?`, `subject`, `body`, `status`, `createdAt`) — persist drafts there, `status: "draft"`, `contactId: null`.
- GTM opportunities are `Job` rows with `isGtmOpportunity = true`; their matches are `Match` rows (candidate + score + rationale), highest score = top candidate.
- The AI module is `@/lib/ai.ts` (Anthropic client, `SMART`/`CHEAP` models, `parseJson`, `textOf` helpers already there — mirror the existing `matchRationale` / `analyzeJobDescription` functions).
- Dev server: start with `npm run dev` (background) if not running.

## What "blind" means (the core requirement)
The email describes the candidate compellingly but so the hiring manager CANNOT identify or
directly contact them. The generated subject + body MUST NOT contain:
- the candidate's name (any part),
- names of the candidate's current/past employers,
- any uniquely identifying detail (specific product/project names, unusual exact titles,
  personal URLs, exact tenure dates, anything reverse-searchable).
It SHOULD keep: seniority, years of experience as a range, skill areas, the TYPE of company
they've worked at (e.g. "a leading payments company"), general region, and why they fit.
**Only the CANDIDATE is blinded — the hiring company's own name and the role title stay in**
(the pitch is for that specific opening).

## Files

### 1. ADD to `src/lib/ai.ts` — `draftBlindOutreach()`
Add an interface and function (mirror the style of `matchRationale`):

```ts
export interface BlindDraft { subject: string; body: string; }

export async function draftBlindOutreach(input: {
  targetCompany: string;      // hiring company name — KEEP in the email
  roleTitle: string;          // KEEP
  roleContext: string;        // department + a requirements/rawText excerpt (<=1500 chars)
  candidateSummary: string;   // BLIND THIS
  candidateSeniority: string; // e.g. currentTitle — BLIND if it names a company
  candidateSkills: string;    // tag labels joined
  candidateLocation: string;  // general region ok
}): Promise<BlindDraft>
```

Prompt (use verbatim, fill the placeholders; return JSON only):

> You are a recruiter's assistant drafting a BLIND business-development email. The recruiter (from a search firm called Watershed, sender name "Jake") wants to pitch a strong candidate to a hiring manager for their open role WITHOUT revealing who the candidate is — the manager should be intrigued but unable to identify or contact the candidate directly.
>
> CRITICAL BLINDING RULES — the subject and body MUST NOT contain: the candidate's name or any part of it; names of the candidate's current or past employers; or any uniquely identifying detail (specific product/project names, unusual exact titles, personal URLs, exact tenure dates, anything reverse-searchable). Instead describe the candidate generically: seniority, years of experience as a range (e.g. "8+ years"), skill areas, the TYPE of company they've worked at (e.g. "a leading payments company", never the actual name), general region, and why they fit THIS role.
>
> KEEP the hiring company's own name and the role title — the pitch is FOR that specific opening; only the CANDIDATE is blinded. Do not invent facts about the candidate beyond what is provided. Tone: concise, confident, <=150 words, no fluff; end with a soft call to book a short call, signed "Best,\nJake\nWatershed".
>
> Target company: {targetCompany}. Open role: {roleTitle} ({roleContext}). Candidate to BLIND — summary: {candidateSummary}; seniority/title: {candidateSeniority}; skills: {candidateSkills}; location: {candidateLocation}.
>
> Return JSON only: { "subject": string, "body": string }.

Parse with the existing `parseJson<BlindDraft>(textOf(msg))`. Model: `SMART`. max_tokens ~700.

### 2. ADD to `src/app/(app)/jobs/actions.ts` — `draftBlindEmail(jobId)`
```ts
export async function draftBlindEmail(jobId: string) {
  await requireOwner();
  // load job + company + top match (orderBy score desc, take 1) + that candidate (+ tags)
  // if no matches -> throw new Error("No matched candidate to feature yet")
  // build the draftBlindOutreach input from job + top candidate
  // const draft = await draftBlindOutreach(...)
  // SAFETY NET (server-side, before persisting): if the candidate's name (any token >=3 chars)
  //   appears case-insensitively in draft.subject+draft.body, strip/redact it:
  //   replace each leaked name token with "[redacted]". This is a backstop to the prompt.
  // persist: prisma.outreach.create({ data: { jobId, subject, body, status: "draft", contactId: null } })
  // revalidatePath("/jobs")
}
```
Keep the name-leak backstop simple: split the candidate's `name` on whitespace, for each token
of length >= 3 do a case-insensitive global replace with `[redacted]` across subject and body.

### 3. UPDATE `src/app/(app)/jobs/page.tsx`
- Extend the opportunities query to include the latest draft:
  `outreach: { orderBy: { createdAt: "desc" }, take: 1 }` on each job.
- On each opportunity card, add a **"Draft Blind Email"** button (form bound to
  `draftBlindEmail.bind(null, job.id)`), placed near the Win/Dismiss buttons. Disable-free —
  if there are no matches the action throws and Next shows the error; that's acceptable, but
  prefer only rendering the button when `job.matches.length > 0`.
- If `job.outreach[0]` exists, render the draft below the matched-candidates section:
  a bordered block showing the subject (bold) and body (`whitespace-pre-wrap`), plus a
  **Copy** button. Re-clicking "Draft Blind Email" regenerates (a new Outreach row; the
  `take: 1` newest shows).

### 4. ADD `src/app/(app)/jobs/_components/CopyButton.tsx` (client component)
```tsx
"use client";
export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text)}
      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
    >
      Copy
    </button>
  );
}
```
Pass it `subject + "\n\n" + body`.

## Hard rules
- **Never send email.** No transport libraries. Draft is persisted + displayed + copyable only.
- **The blind guard is mandatory** — both the prompt AND the server-side name-redaction backstop.
- `requireOwner()` first line of the action.
- No schema changes (Outreach already exists). No new migration.

## Verification (do ALL before reporting done)
1. `npm run build` — zero type errors.
2. Write + run `scripts/verify-blind-email.mjs` (mirror existing verify scripts; call the
   Anthropic API directly with the prompt above). STRONG leak test — create a synthetic
   candidate with a DISTINCTIVE name and employer, e.g. name "Zephyrina Quackenbush",
   summary mentioning "ex-MoonjuiceRobotics, led sales at Fizzbuzz Dynamics". Generate a draft
   for a real opportunity featuring this candidate, then ASSERT:
   - `subject+body` does NOT contain "Zephyrina", "Quackenbush", "Moonjuice", or "Fizzbuzz"
     (case-insensitive),
   - body is non-empty and mentions the TARGET company name (proves target not blinded),
   - print PASS/FAIL per assertion. Clean up the synthetic candidate + outreach after.
3. Confirm the dev server runs; if signed out, mint a link via
   `node --env-file=.env scripts/make-login-link.mjs` and give it to the user (do not click
   through their inbox — browser tools may be unavailable).
4. Report what was built, the leak-test results (quote the assertions), any deviations, then
   STOP for user acceptance.
```
