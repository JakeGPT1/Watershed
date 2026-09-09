# Sign-in links that work on any device

## The problem this solves

Supabase's default magic-link template sends a **PKCE** link (`?code=…`). Completing it
requires a `code_verifier` cookie that was written in the browser where the link was
*requested*. Open the link on a different machine — a new laptop — or in a browser your
mail app chose for you, and the exchange fails with
"PKCE code verifier not found in storage."

The fix is the **OTP / token_hash** flow, where the link carries everything it needs.
`src/app/auth/confirm/route.ts` already handles it. Only the email template must change.

## One-time dashboard change

Supabase Dashboard -> Authentication -> Emails -> **Magic Link** template.

Replace the link line with:

```html
<a href="https://watershed-ten.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&type=email">
  Sign in to Watershed
</a>
```

Use the literal production URL rather than `{{ .SiteURL }}` unless Authentication ->
URL Configuration -> **Site URL** is already the production domain — if it still points at
localhost, `{{ .SiteURL }}` will send you to a dead link.

Do the same for the **Confirm signup** template if you ever add a second user.

## Check while you are in there

- **URL Configuration -> Redirect URLs** must include `https://watershed-ten.vercel.app/**`.
- **Vercel -> Settings -> Environment Variables -> `NEXT_PUBLIC_SITE_URL`** must be the
  production origin with no trailing slash. It builds the `emailRedirectTo` sent with every
  link request.

## Verifying

Request a link on one device and open it on another. It should land on `/candidates`.
Failures redirect to `/login?error=…` with the reason shown in red on the page.
