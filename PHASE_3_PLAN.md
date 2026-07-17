# Execution plan — Phase 3: Companies, Contacts, manual JD matching, standard outreach

> **For the executing model (Sonnet):** Build in the order A → B → C, running `npm run build`
> and the per-part verification after EACH part before moving on. Read the referenced existing
> files first to confirm exact signatures — do not guess. No schema migration is needed
> (Company, Contact, Job, Match, Outreach all already exist). Match the established visual
> language (`rounded-xl border border-stone-200 bg-white` cards, `bg-stone-900` buttons, tag
> pills). Every server action starts with `await requireOwner()`.

## Why this phase
The BD engine currently only works for the 10 monitored GTM companies. This closes the loop so
ANY job — from a referral, a LinkedIn post, a call — gets the same match + outreach power, and
gives you real Companies + hiring-manager Contacts to address outreach to.

## Key facts / conventions to reuse
- Manual (pasted) jobs are discriminated from GTM jobs by `externalId`: **GTM jobs always have
  `externalId` set; manual jobs leave it `null`.** Use `externalId: null` to list "my jobs".
- Reliable structured AI output MUST use **forced tool-use** (`tools` + `tool_choice: {type:"tool"}`),
  NOT assistant prefill (Sonnet 5 rejects prefill — see `draftBlindOutreach` in `src/lib/ai.ts`
  for the working pattern to copy).
- Embedding helpers: `embed(text)` and `setJobEmbedding(jobId, matchText)` in `src/lib/embedding.ts`.
- Existing match logic lives PRIVATELY inside `src/lib/gtm/monitor.ts` as `autoMatchJob(jobId)`
  (pgvector cosine join, top 5, `matchRationale` per hit, upserts `Match`). Part B extracts it.

---

## PART A — Companies + Contacts CRUD

### A1. `src/app/(app)/companies/actions.ts` (new)
Server actions (each `await requireOwner()` first):
- `createCompany(formData)` — name (required), industry, website, notes → create → redirect `/companies/{id}`.
- `updateCompany(companyId, formData)` — same fields → revalidate.
- `addContact(companyId, formData)` — name (required), title, email → create Contact → revalidate `/companies/{companyId}`.
- `updateContact(contactId, companyId, formData)` — name/title/email → revalidate.
- `removeContact(contactId, companyId)` — delete → revalidate.

### A2. `src/app/(app)/companies/page.tsx` (replace stub)
List all companies: `prisma.company.findMany({ include: { _count: { select: { contacts: true, jobs: true, projects: true } } }, orderBy: { name: "asc" } })`.
Table/cards: name (link to detail), industry, contact count. "New Company" button → `/companies/new`.
Note: GTM-target companies created by the monitor appear here too (that's correct — they're real companies). Optionally show a small "GTM target" pill when `isGtmTarget`.

### A3. `src/app/(app)/companies/new/page.tsx` (new)
Form → `createCompany`: name, industry, website, notes. Same field styling as `/candidates/new`.

### A4. `src/app/(app)/companies/[id]/page.tsx` (new)
`const { id } = await props.params`. Load company with `contacts`, and its `jobs` + `projects`
(for context links). `notFound()` if missing.
- Editable company fields (a `<details>` "Edit company" with a form → `updateCompany`, like the
  project notes-edit pattern).
- **Contacts section**: list each contact (name, title, email) with an inline edit `<details>` +
  a remove button (`removeContact`). An "Add contact" form (name/title/email → `addContact`).
- Small linked lists of this company's Projects and Jobs (title → their detail pages).

**Verify A:** `npm run build` clean; then create a company, add/edit/remove a contact in the
browser (or a throwaway `scripts/verify-companies.mjs` mirroring the actions via prisma:
create company → add 2 contacts → update one → delete one → assert counts → cleanup).

---

## PART B — Manual JD paste + matching (completes Phase 2)

### B1. Extract shared match logic → `src/lib/matching.ts` (new)
Move the body of `autoMatchJob` out of `src/lib/gtm/monitor.ts` into an EXPORTED
`matchCandidatesToJob(jobId: string, limit = 5): Promise<number>` (returns # matches written).
Update `monitor.ts` to import and call it (delete its private copy). Behavior byte-identical —
this is a refactor, not a change. Confirm the GTM monitor still works after (see Verify B).

### B2. `extractJobFromJD` in `src/lib/ai.ts` (new, forced tool-use)
Add a tool `submit_job_extract` with schema `{ title: string, requirements: string, matchText: string }`.
Prompt (mirror `analyzeJobDescription`'s style):
> Extract from this job description for a recruiter's matching system. title = the role title.
> requirements = bulleted must-haves, <=120 words. matchText = a dense, keyword-rich paragraph
> optimized for semantic similarity matching against candidate profiles. JD: {rawText}
Return via the tool. `max_tokens: 1024`, `tool_choice` forced. Copy the exact tool-use +
retry-once structure from `draftBlindOutreach`.

### B3. `src/app/(app)/jobs/actions.ts` — add `createManualJob` + `refreshJobMatches`
- `createManualJob(formData)`: rawText (required, the pasted JD), sourceUrl (optional),
  companyName (optional free-text → upsert Company by name like `createProject` does).
  Call `extractJobFromJD(rawText)` → create Job (`isGtmOpportunity: false`, `externalId: null`,
  title/requirements from extract, rawText, sourceUrl, companyId) → `setJobEmbedding(job.id, matchText)`
  → `matchCandidatesToJob(job.id)` → redirect `/jobs/{id}`.
- `refreshJobMatches(jobId)`: `await matchCandidatesToJob(jobId)` → revalidate `/jobs/{jobId}`.

### B4. `src/app/(app)/jobs/new/page.tsx` (new)
Form → `createManualJob`: big textarea for JD (required), source URL, company name. Explanatory
line: "Paste any job description — we'll extract it and rank your candidates against it."

### B5. `src/app/(app)/jobs/[id]/page.tsx` (new — shared detail page)
Works for ANY job (manual or GTM). Load job with company, `matches` (candidate + tags, score desc),
`outreach` (latest, `take: 1`), and the company's `contacts`. `notFound()` if missing.
- Header: title, company, source-URL link, GTM/leadership badges if applicable.
- Collapsible JD (`rawText`) + extracted `requirements`.
- **Matches section**: ranked candidate cards (name→candidate page, title, score %, rationale).
  A "Refresh Matches" button (`refreshJobMatches`). Empty state if none (e.g. no candidates have
  embeddings yet).
- **Outreach section**: Part C.

### B6. Update `src/app/(app)/jobs/page.tsx`
- Add a **"Paste a Job"** button (→ `/jobs/new`) next to "Run Monitor Now".
- Below the GTM opportunities, add a **"My Jobs"** section listing manual jobs
  (`where: { externalId: null }`, newest first): title, company, match count, link to `/jobs/{id}`.
- Leave the GTM opportunities section exactly as-is (don't break the working blind-email flow).

**Verify B:** `npm run build` clean. Then a `scripts/verify-manual-job.ts` (run via
`npx tsx --env-file=.env`, wrap in `async main()`): call the REAL `extractJobFromJD` on a sample
JD, create a Job, `setJobEmbedding`, `matchCandidatesToJob`, assert matches were written and the
extract has non-empty title/requirements/matchText; cleanup. ALSO run the existing GTM monitor
path once to confirm the B1 refactor didn't break it (reuse the approach from earlier monitor
verification — or just confirm `matchCandidatesToJob` is imported and monitor builds).

---

## PART C — Standard (named) outreach draft

Distinct from the existing BLIND email: standard outreach **names the candidates and their real
highlights** — for when you're pitching openly or already have the relationship. It addresses a
specific hiring-manager Contact.

### C1. `draftStandardOutreach` in `src/lib/ai.ts` (new, forced tool-use)
Tool `submit_outreach_draft` → `{ subject, body }`. Prompt:
> You are drafting a business-development email from a recruiter ("Jake" at the search firm
> "Watershed") to a hiring manager, pitching real candidates for their open role. This is NOT
> blind — you MAY name the candidates and cite their specific strengths. Reference the top
> matched candidate(s) by name with 1-2 concrete highlights each (title, skills, standout fit).
> Do not invent facts beyond what is provided. Concise, confident, <=180 words; address the
> contact by name if provided; end with a soft call to book a short call, signed "Best,\nJake\nWatershed".
> Role: {jobTitle} at {company}. Hiring manager: {contactName or "the team"}. Candidates:
> {for each: name, title, tags, summary, rationale}.
Same forced-tool + retry-once structure. `max_tokens: 1024`.

### C2. `draftOutreach(jobId, formData)` in `src/app/(app)/jobs/actions.ts`
- `await requireOwner()`. Read optional `contactId` from formData.
- Load job + company + top 3 matches (score desc) with candidates(+tags). If no matches →
  throw `"No matched candidates yet — run matching first"`.
- Load the chosen Contact (if `contactId`) for the greeting.
- Call `draftStandardOutreach`, persist `Outreach` (`jobId`, `contactId`, subject, body,
  `status: "draft"`) → revalidate `/jobs/{jobId}`.
- **No email is sent** — draft + display + copy only (same rule as the blind email).

### C3. Outreach UI on `/jobs/[id]/page.tsx`
- A "Draft Outreach" form: a `<select name="contactId">` of the company's contacts (plus a
  "— no specific contact —" option), and a submit button → `draftOutreach.bind(null, job.id)`.
- If `job.outreach[0]` exists, render it (subject bold, body `whitespace-pre-wrap`) with the
  existing `CopyButton` from `src/app/(app)/jobs/_components/CopyButton.tsx`.
- Only show this section when the job has ≥1 match.

**Verify C:** `npm run build` clean. `scripts/verify-standard-outreach.mjs` (mirror the
blind-email verify's forced-tool structure): generate a standard draft for a job with a synthetic
named candidate + a contact name; ASSERT the candidate's name IS present (opposite of blind),
the contact greeting appears, subject+body non-empty. Cleanup.

---

## Hard rules
- **Never send email** anywhere — all outreach is draft + copy only.
- Forced tool-use for ALL new AI JSON (no prefill, no bare "return JSON").
- `requireOwner()` first line of every action.
- Part B1 is a pure refactor — GTM monitor behavior must not change.
- No schema migration.

## Final report
After all three parts pass: summarize what was built, the per-part verification results, any
deviations, and note that Companies/Contacts/manual-JD/standard-outreach now complete Phase 3.
Then STOP for user acceptance.
