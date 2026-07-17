# Phase 1.5 execution plan — Projects (engaged searches + pipeline)

> **For the executing model (Sonnet):** Follow this plan exactly. The spec of record is
> `../BUILD_SPEC.md` (Phase 1.5 section). All schema/tables already exist — `Project` and
> `ProjectCandidate` were migrated in the init migration. **No new migrations are needed.**
> Do not touch Phase 1 code except where this plan says to.

## Context you need
- App root: `C:\Users\jdbra\OneDrive\Desktop\Watershed\watershed` (Next.js 16 App Router, TS, Tailwind 4, Prisma 6).
- Auth: every server action starts with `await requireOwner()` from `@/lib/supabase/server`. Middleware already gates pages.
- Stage list: import `STAGES` from `@/lib/stages` — NEVER hardcode stage strings anywhere.
- Visual language: match existing pages — `rounded-xl border border-stone-200 bg-white` cards, `bg-stone-900` primary buttons, tag pills `bg-stone-100 text-xs`.
- Dev server: if not running, start with `npm run dev` (background) from the app root. `.claude/launch.json` exists (config name `watershed`).

## Files to create/modify

### 1. CREATE `src/app/(app)/projects/actions.ts`
Server actions, each beginning with `await requireOwner()`:

- `createProject(formData)` — fields: `title` (required), `companyId` (optional select), `notes` (optional). Create via prisma, then `redirect(/projects/{id})`.
  - Company linking: if formData `companyName` (free text) is non-empty, upsert a `Company` by name (findFirst by exact name, create if missing) and connect it. (There is no Companies UI until Phase 3 — free-text create is the v1 path.)
- `updateProjectStatus(projectId, formData)` — set `status` to one of `"open" | "filled" | "closed"` (validate against that list).
- `addCandidatesToProject(projectId, formData)` — formData contains `candidateIds` (multiple values, use `formData.getAll("candidateIds")`). For each id: `prisma.projectCandidate.upsert` (skip if exists) at default stage. `revalidatePath(/projects/{projectId})`.
- `setStage(projectId, candidateId, formData)` — read `stage`, validate it is in `STAGES`, update the `ProjectCandidate`. Revalidate the project page.
- `setProjectCandidateNote(projectId, candidateId, formData)` — update the per-search `note` field. Revalidate.
- `removeFromProject(projectId, candidateId)` — delete the `ProjectCandidate` row. Revalidate.

### 2. REPLACE `src/app/(app)/projects/page.tsx` (currently a stub)
Projects list:
- Header row: `h1` "Projects" + link-button "New project" → `/projects/new`.
- Query: `prisma.project.findMany({ include: { company: true, _count: { select: { candidates: true } } }, orderBy: { createdAt: "desc" } })`.
- Card/table list: title (link to `/projects/{id}`), company name or "—", status badge (`open` green tint / `filled` blue tint / `closed` stone), candidate count.
- Empty state matching the app's dashed-border pattern.

### 3. CREATE `src/app/(app)/projects/new/page.tsx`
Form (server action `createProject`): title (required), companyName (free text, optional), notes (textarea, optional). Same field styling as `/candidates/new`.

### 4. CREATE `src/app/(app)/projects/[id]/page.tsx` — the pipeline board
This is the core screen. `params` is a Promise — `const { id } = await props.params`.

Query the project with:
```ts
prisma.project.findUnique({
  where: { id },
  include: {
    company: true,
    candidates: {
      include: { candidate: { include: { tags: { include: { tag: true }, take: 4 } } } },
    },
  },
})
```
`notFound()` if missing.

Layout:
- Header: project title, company · status (with a small `<select>` bound to `updateProjectStatus` that auto-submits — see auto-submit pattern below) · "{n} candidates". Right side: "Add candidates" link-button → `/projects/{id}/add`.
- **Pipeline grouped by stage:** iterate `STAGES` in order; for each stage with ≥1 candidate (ALWAYS render "Pursuing" even when empty, as the landing group), render a section header `{stage} · {count}` and the candidate rows in that group. "Not Interested" renders last with `opacity-60`.
- Each row (card): candidate name (link to `/candidates/{id}`), currentTitle, up to 4 tag pills, then:
  - **Stage dropdown**: a `<select name="stage" defaultValue={pc.stage}>` with options from `STAGES`, inside a form bound to `setStage`. Auto-submit on change.
  - Per-search note: a `<details>` with a small form (`textarea name="note"` defaultValue existing note + save button) bound to `setProjectCandidateNote`. If a note exists, show its first ~80 chars inline as muted text.
  - Remove button (small ×, `removeFromProject`).

**Auto-submit pattern (only client component in this phase):** create `src/app/(app)/projects/_components/AutoSubmitSelect.tsx`:
```tsx
"use client";
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
```
Use it for both the stage dropdown and status select. Server forms otherwise.

### 5. CREATE `src/app/(app)/projects/[id]/add/page.tsx` — candidate picker
- Search box (GET form, `?q=` like the candidates list) reusing the same `where` filter logic as `/candidates/page.tsx` (name/title/tag contains).
- Results as a checkbox list (`<input type="checkbox" name="candidateIds" value={c.id}>`) with name, title, tags — inside ONE form bound to `addCandidatesToProject`, submit button "Add selected to project".
- Exclude candidates already in the project (`where: { NOT: { projects: { some: { projectId: id } } } }` merged into the search filter).
- After submit the action redirects back to `/projects/{id}`.

### 6. Candidate detail cross-link — ALREADY DONE
`src/app/(app)/candidates/[id]/page.tsx` already renders the "In projects" section. Do not modify it.

## Hard rules
- Validate every `stage` value against `STAGES` server-side; reject anything else.
- `requireOwner()` first line of every action.
- No drag-and-drop, no kanban columns — grouped list + dropdown per the owner's decision.
- No new npm packages. No schema changes.

## Verification (do all before reporting done)
1. `npm run build` — must compile with zero type errors.
2. Write + run a throwaway script `scripts/verify-phase15.mjs` (pattern-match `scripts/verify-phase1.mjs`): create project, add 2 candidates via prisma, move one through `Pursuing → Screen` by updating stage, assert grouping query returns them, set + read a per-search note, then clean up. Print PASS lines.
3. Browser: with the dev server running, sign-in state may exist already; if signed out, generate a link via `node --env-file=.env scripts/make-login-link.mjs` and give it to the user — do NOT try to click through their inbox.
4. Walk the flow in the browser pane: create a project, add candidates from the picker, change a stage via dropdown (confirm the row moves groups after reload), add a per-search note, remove a candidate.
5. Report: what was built, verification results, any deviations — then STOP for user acceptance before Phase 2.
