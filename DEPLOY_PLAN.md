# Execution plan — Deploy Watershed to Vercel

> **For the executing model (Sonnet):** Follow in order. Two steps REQUIRE the user to act
> (GitHub/Vercel auth, Supabase dashboard) — stop and ask at those points, don't guess or
> work around them. Never print secret values into chat; read them from `.env` with scripts.

## Current state (verified facts, don't re-derive)
- App root: `C:\Users\jdbra\OneDrive\Desktop\Watershed\watershed` (Next.js 16.2.10, Prisma 6, Tailwind 4).
- NOT yet a git repository. `.gitignore` already covers `.env*` — verify before first commit anyway.
- All env values live in `watershed/.env`. `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000` and must be the prod URL in Vercel.
- `DATABASE_URL` (pooler :6543, `?pgbouncer=true`) and `DIRECT_URL` (pooler :5432) both use
  `aws-1-us-west-2.pooler.supabase.com` — copy VERBATIM into Vercel; do not "fix" them.
- 5 migrations exist in `prisma/migrations` and are all applied to the live DB.
- The dev machine's Node is v24 LTS; `npx` works after the PATH-refresh prefix used all session.

## Step 1 — Pre-flight repo hygiene
1. `cd` the app root. Confirm `.gitignore` contains `.env*` (grep it). Also append these if
   missing: `PHASE_1_5_PLAN.md`-style plan files are FINE to commit; but ensure `node_modules`,
   `.next` are ignored (create-next-app default covers both).
2. `git init -b main`, `git add -A`, then `git status --short` and EYEBALL that no `.env` file
   is staged. If any secret file appears staged, STOP and fix `.gitignore` first.
3. Commit: `git commit -m "Watershed ATS — initial commit (phases 1-3 + GTM monitor)"` with the
   standard Co-Authored-By trailer.

## Step 2 — Make the build Vercel-ready (small code changes)
1. `package.json` scripts:
   - `"build": "prisma generate && next build"` (Vercel caches node_modules; generate must run).
   - Add `"postinstall": "prisma generate"` as belt-and-braces.
   - Do NOT put `migrate deploy` in the build (it would run on every preview build). Instead
     add a script `"db:deploy": "prisma migrate deploy"` — migrations are already applied; future
     ones get run manually via `npm run db:deploy` (documented in README step below).
2. `npm run build` locally to confirm the script change still builds clean.
3. Commit the change.

## Step 3 — GitHub (USER CHECKPOINT)
1. Check `gh --version` and `gh auth status`. 
   - If gh is missing: `winget install GitHub.cli --silent`, then re-check.
   - If not authenticated: tell the user to run `gh auth login` in their own terminal (browser
     flow) OR offer the fully-manual path (user creates an empty private repo named `watershed`
     on github.com and pastes the remote URL). WAIT for the user.
2. Once authed: `gh repo create watershed --private --source . --push` (from the app root).
3. Verify: `git remote -v` and `gh repo view --json url`.

## Step 4 — Vercel project (USER CHECKPOINT)
Preferred path — Vercel CLI:
1. `npx vercel --version` (installs on demand). Then `npx vercel login` — this needs the user
   to confirm via email/browser. Tell them what to expect and WAIT.
2. From the app root: `npx vercel link --yes` (creates the project), then set env vars
   non-interactively by piping values from `.env` (never echo them to chat):
   For each of: DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, EMBEDDINGS_API_KEY, EMBEDDINGS_MODEL,
   CLAUDE_MODEL_SMART, CLAUDE_MODEL_CHEAP, OWNER_EMAIL →
   `npx vercel env add <NAME> production` reading the value from a small node one-liner that
   pipes it in (e.g. `node -e "..."` | `vercel env add`). PowerShell piping to vercel works;
   if it fights you, fall back to telling the user to paste them in the Vercel dashboard
   (Settings → Environment Variables) and WAIT.
   - Set `NEXT_PUBLIC_SITE_URL` LAST — you won't know the prod URL until after first deploy;
     set it to the placeholder prod URL Vercel reports from `vercel link` (project name → 
     `https://<project>.vercel.app`), and correct it after step 5 if different.
3. `npx vercel --prod` to deploy. Capture the production URL from output.

Fallback path (if CLI auth is a mess): user imports the GitHub repo at vercel.com/new,
pastes env vars in the dashboard, clicks Deploy. Give them the exact list of names + where
each value lives (their `.env`), then WAIT and verify the deployment URL they report.

## Step 5 — Supabase auth allowlist (USER CHECKPOINT)
Magic links must redirect to prod. The user must (can't be done by script without a
management token):
1. Supabase dashboard → Authentication → URL Configuration:
   - Site URL: `https://<prod-url>`
   - Additional Redirect URLs: add `https://<prod-url>/auth/confirm` (keep the localhost ones
     for continued local dev).
Tell them exactly this and WAIT for confirmation.

## Step 6 — Verify production end-to-end
1. `curl -s -o /dev/null -w "%{http_code}" https://<prod-url>` → expect 307 (auth redirect).
2. `curl https://<prod-url>/login` → expect 200.
3. Update Vercel env `NEXT_PUBLIC_SITE_URL` to the final prod URL if it differs; redeploy
   (`npx vercel --prod`) if changed.
4. Generate a PROD sign-in link locally:
   `NEXT_PUBLIC_SITE_URL` override — run `node --env-file=.env -e` variant of
   `scripts/make-login-link.mjs` with the prod URL (or temporarily set the env var inline).
   Simplest: add an optional CLI arg to `make-login-link.mjs`: `node scripts/make-login-link.mjs https://<prod-url>`
   that overrides the site URL. Give the user the prod link; have them confirm sign-in works
   and `/candidates` loads WITH data (proves prod → Supabase connectivity).
5. Have the user click around: candidates list, a project, GTM opportunities page. Confirm.

## Step 7 — Post-deploy notes (report to user)
- Local `npm run dev` still works unchanged; prod and local share the SAME database.
- Future schema changes: run `npx prisma migrate dev` locally, commit, push (auto-deploys),
  then `npm run db:deploy` — document this in the final report.
- Email magic links now work to the prod URL, still rate-limited (~2-4/hr on built-in email);
  `scripts/make-login-link.mjs <prod-url>` is the bypass.
- GTM monitor still manual-trigger; a Vercel Cron for it is a separate future task.
- Vercel serverless function timeout (Hobby: ~10s-60s depending on plan/config): the GTM
  monitor run and blind-draft actions call external APIs and may need `export const maxDuration = 60`
  on the relevant route/page if timeouts appear — only add if the user reports failures.

## Hard rules
- Never print secret values to chat or commit `.env`.
- STOP and wait at every USER CHECKPOINT — do not fabricate URLs or skip auth.
- No schema changes, no feature changes — deploy exactly what exists.
