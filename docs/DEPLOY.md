# Deploying the web build

The web build is the plan's "kickoff insurance": it ships regardless of Apple
Developer enrolment or App Review, and it hosts the two URLs App Store Connect
requires (`/legal/privacy`, `/legal/support`).

## Vercel

`vercel.json` already sets everything except the secrets, so connecting the repo
is the only manual step.

1. vercel.com/new → import `nickroachy7/yap-fantasy-game`
2. Leave the build settings alone — `vercel.json` supplies them:
   - build: `npx expo export --platform web`
   - output: `dist`
   - `cleanUrls: true` so `/legal/privacy` resolves from `legal/privacy.html`
3. **Add both environment variables before the first deploy** (Settings →
   Environment Variables), for Production *and* Preview:

   | Name | Value |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://ygrmsleanavyewfbhlth.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key |

   Both are client-safe by design — they ship in the browser bundle either way.
   The balldontlie key must **never** be added here; it lives only in Supabase
   Edge Function secrets.

   Without these the build fails immediately at the Metro step with
   `Missing EXPO_PUBLIC_SUPABASE_URL…`. That is deliberate — a site that builds
   without a backend would be worse.

## After the first successful deploy

Add the deployed origin to Supabase → Authentication → URL Configuration:

- **Site URL**: the production domain
- **Redirect URLs**: `https://<domain>/**`, plus `yapfantasy://**` for iOS

Until the domain is allow-listed, a magic link verifies and then bounces to the
old Site URL instead of returning to the app.

## Moving yapfantasy.com off the old project

The domain served `sleeper-yap-bot` — a Next.js site on Railway — until this app
took it. Three systems have to agree, and the order below is the order that
never leaves the domain pointing at nothing.

**Who owns what.** The registrar is Squarespace Domains, but it does not serve
the DNS: the nameservers are Cloudflare's (`cleo`/`perla.ns.cloudflare.com`), so
every record below is edited in the **Cloudflare** dashboard. Squarespace is
only where the registration is renewed.

1. **Deploy to Vercel first and check the `.vercel.app` URL.** Nothing about the
   domain moves until the new site is known-good on its own hostname.
2. **Add both `yapfantasy.com` and `www.yapfantasy.com`** in Vercel → Settings →
   Domains. Both are already added and already show `verified: true` — Vercel
   confirms ownership as soon as no other Vercel account holds the name, so the
   only thing outstanding is where the records point.
3. **Repoint the two Cloudflare records.** The zone holds exactly two, and both
   were CNAMEs to Railway — *not* A records:

   | Name | Type | Was | Now |
   |---|---|---|---|
   | `yapfantasy.com` | CNAME | `sfwxzp6e.up.railway.app` | `79fc71ab70bfc9e0.vercel-dns-017.com` |
   | `www` | CNAME | `i48kee4g.up.railway.app` | `79fc71ab70bfc9e0.vercel-dns-017.com` |

   Both stay **DNS-only (grey cloud)**, which is how they already were. Vercel
   issues and renews the certificate itself, and an orange-cloud record in front
   of it means two CDNs and two certificates for one site — which fails as a
   redirect loop or an SSL handshake error, and does so intermittently, which is
   worse than failing outright.

   **A CNAME at the apex is deliberate.** Normally that is illegal and Vercel
   asks for an `A` to `216.198.79.1` instead — but Cloudflare flattens apex
   CNAMEs, so the record is legal here and is the better of the two: it follows
   Vercel's edge IPs when they change, where a hardcoded A record silently rots.
   `dig` reports the flattened A values, which is why the apex *looks* like an
   A record from outside and is why the pre-cutover reading of this zone was
   wrong.

   The CNAME target is **per-project**. `cname.vercel-dns.com` also works and is
   what most guides print, but the hashed hostname is what this project was
   issued.

   Expect a **few minutes of intermittent SSL errors** right after the switch
   while Vercel issues the certificate — the domain answers, some requests fail
   the handshake, and then it settles. Measured here: 10/12 requests good five
   minutes in, 11/11 shortly after. Do not go changing records during that
   window; it resolves itself.
4. **Wait for Vercel to report both domains valid**, then load the site. TTLs
   here are short, so this is usually minutes.
5. **Update Supabase URL Configuration** to the new origin — see the section
   above. Easy to forget once the site itself is up, and sign-in is broken until
   it is done.
6. **Only then stop the old Railway service.** `railway down --service yap-web`
   in the `sleeper-yap-bot` project removes its deployment; the service and its
   config stay, so `railway redeploy --service yap-web` puts it back.

   The `yap` service in that project is the **Discord bot, which stays running**.
   It shares the project but not the domain, and it holds the only copy of the
   bot's Discord credentials. Never `railway delete` the project to tidy up the
   site — that takes the bot with it.

## Rolling back

The old site is a removed deployment, not a deleted one, so the way back is:

1. `railway redeploy --service yap-web`
2. Point the two Cloudflare CNAMEs at `sfwxzp6e.up.railway.app` (apex) and
   `i48kee4g.up.railway.app` (`www`).

Railway still holds `yapfantasy.com` on that service, so nothing has to be
re-added there.

Note that the old site ran against a **different Supabase project**
(`yxtnocecnqutcvltptya`) from this one (`ygrmsleanavyewfbhlth`). No accounts,
leagues or claims carry over, and nothing needs migrating — the two were never
the same product.

## Notes

- Node is pinned to 22.x via `engines.node`; the local `.nvmrc` matches.
- `expo export` writes real HTML per route (`output: "static"` in `app.json`), so
  the deploy is a static site with no server runtime.
- `/preview` is the dev component gallery. It is emitted but inert outside
  development — guarded by `__DEV__`.

## Dynamic routes need a rewrite

`expo export` writes one HTML file per route, and a dynamic route becomes a file
with the brackets still in the name: `dist/set/[code].html`, `player/[id].html`,
`card/[id].html`. Nothing on a static host maps `/set/team-buf-2026` onto that
file, so every one of those URLs answered **404 from Vercel** — not from the app.

That is only invisible while the app is doing its own client-side routing.
Opening a set from the list works, because no request is made; the moment a
reader refreshes the page, opens a link someone sent them, or restores a tab,
they get Vercel's 404 instead of the sheet.

The `rewrites` block in `vercel.json` maps each pattern onto its bracketed file.
The app reads the parameter out of the URL as it always did — the rewrite is
invisible to it, and the browser's address bar keeps the real path.

**Add a rewrite whenever a dynamic route is added.** There is no lint for this
and the failure only shows on a hard load, which is not the way the route gets
tested during development.
