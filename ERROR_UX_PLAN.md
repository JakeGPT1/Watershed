# Execution plan — Replace raw error overlays with inline error banners (Sweep B fix-all)

> **For Sonnet:** Fixes all user-triggerable `throw new Error` sites found in the bug audit.
> Pattern to use is ALREADY IN THE CODEBASE: the login page redirects with `?error=` and
> renders the message (`src/app/login/page.tsx` + `actions.ts`). Extend that same pattern
> app-wide. NO client components, NO useActionState, NO schema change. Success-path behavior
> must stay byte-identical.

## Architecture (one helper + one component, then mechanical conversion)

### 1. Helper — `src/lib/formError.ts` (new)
```ts
import { redirect } from "next/navigation";

/** Redirect back to `path` with a user-visible error message (rendered by ErrorBanner). */
export function failTo(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
```

### 2. Component — `src/app/(app)/_components/ErrorBanner.tsx` (new, server component)
Props: `{ error?: string; clearHref: string }`. Renders nothing when no error; otherwise a
red-tinted card (`rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700`)
showing the message with a small "Dismiss" link to `clearHref` (the same path without the
query). Place at the TOP of each page's JSX, right under the h1.

### 3. Conversion rule (apply to EVERY user-triggerable throw in the four actions files)
- Validation throws → `failTo(<page the form lives on>, <same message>)`.
- AI/storage calls that can throw (`extractJobFromJD`, `draftBlindOutreach`,
  `draftStandardOutreach`, `analyzeJobDescription`, `parseResume`, `parseLinkedIn`,
  `summarizeTranscript`, storage upload errors) → wrap the await in try/catch inside the
  ACTION; catch → `failTo(page, err.message)`. IMPORTANT: `redirect()` throws NEXT_REDIRECT —
  never call `failTo` inside the same try block that catches it; catch the AI error, then
  call failTo AFTER/OUTSIDE, or rethrow if `err.digest?.startsWith("NEXT_REDIRECT")`.
  Simplest safe shape:
  ```ts
  let extract;
  try { extract = await extractJobFromJD(rawText); }
  catch (e) { failTo("/jobs/new", e instanceof Error ? e.message : "Extraction failed"); }
  ```
- Leave UNCHANGED: `requireOwner()` throws (middleware is the real gate; this is a backstop),
  `getResumeSignedUrl`/`getJdSignedUrl` (render-time data fetchers, not form posts), and all
  throws inside `src/lib/*` (they're translated at the action layer now).

### 4. Redirect targets per action (the mechanical map)
| actions.ts | action | failTo target |
|---|---|---|
| candidates | createCandidate (name, linkedin shape) | `/candidates/new` |
| candidates | updateCandidate (name, linkedin shape) | `/candidates/{id}/edit` |
| candidates | uploadResume (file checks, storage, parse) | `/candidates/{id}` |
| candidates | pasteLinkedIn (length, parse) | `/candidates/{id}` |
| candidates | addNote (empty) | `/candidates/{id}` |
| candidates | addTranscript (length, summarize) | `/candidates/{id}` |
| companies | createCompany (name) | `/companies/new` |
| companies | updateCompany / addContact / updateContact (name) | `/companies/{companyId}` |
| jobs | draftBlindEmail (no match, no profile data, AI) | `/jobs` |
| jobs | createManualJob (length, extract) | `/jobs/new` |
| jobs | draftOutreach (no matches, AI) | `/jobs/{jobId}` |
| projects | createProject (title) | `/projects/new` |
| projects | updateProjectStatus (invalid status) | `/projects/{projectId}` |
| projects | uploadJobDescription (file checks, storage, analyze) | `/projects/{projectId}` |
| projects | addCandidateToProjectFromCandidate (no project picked) | `/candidates/{candidateId}` |
| projects | setStage (invalid stage) | `/projects/{projectId}` |

Note `cleanLinkedInUrl` throws from a helper — have it return an error string (or throw) and
translate in the two callers with failTo.

### 5. Pages that must render ErrorBanner (add `searchParams: Promise<{ error?: string }>`)
`/candidates/new`, `/candidates/[id]` (already has searchParams? add), `/candidates/[id]/edit`,
`/companies/new`, `/companies/[id]`, `/jobs` (already has none — add), `/jobs/new`,
`/jobs/[id]`, `/projects/new`, `/projects/[id]`.
`clearHref` = the page's own path. Watch Next 16: searchParams is a Promise — `await` it.

## Verification
1. `npm run build` — zero type errors.
2. Behavioral spot-checks via curl are impractical (auth); instead do a code review pass:
   `grep -n "throw new Error" src/app/**/actions.ts` — the ONLY remaining throws should be
   `requireOwner` backstops and none that a form submit can reach. List the leftovers in the
   report with justification.
3. One live browser-less check: run a tiny tsx script calling the (exported) `createProject`
   logic? NO — server actions need request context; skip runtime testing of redirects.
   Instead verify one page renders the banner: add `?error=Test%20message` manually — tell
   the user to eyeball `/candidates/new?error=Test%20message` after sign-in (include a fresh
   login link via scripts/make-login-link.mjs).
4. Commit, push, deploy Ready via the usual monitor, curl prod 307.
5. Report: conversion table with done-status, remaining intentional throws, the test URL for
   eyeballing, STOP.

## Hard rules
- Success paths unchanged (same revalidates/redirects).
- No client components; banner is server-rendered from searchParams.
- Never wrap `redirect()`/`failTo()` in a try that swallows NEXT_REDIRECT.
- Messages shown to the user are the SAME strings as today (they're already written well).
