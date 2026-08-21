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
   Domains. Vercel will show the exact records to create — take them from that
   screen rather than from memory. The apex is an `A` record; the `www` CNAME
   target is **per-project** (`<hash>.vercel-dns-0NN.com`), not a shared
   hostname, so a value copied from another project's docs will not verify.
3. **Replace the Railway records in Cloudflare.** What is there now:

   | Name | Type | Value |
   |---|---|---|
   | `yapfantasy.com` | A | `69.46.46.65` |
   | `www` | CNAME | `i48kee4g.up.railway.app` |

   Point both at the values Vercel gave you. **Set them to DNS-only (grey
   cloud), not proxied.** Vercel issues and renews the certificate itself, and
   an orange-cloud record in front of it means two CDNs and two certificates for
   one site — which fails as a redirect loop or an SSL handshake error, and does
   so intermittently, which is worse.
4. **Wait for Vercel to report both domains valid**, then load the site. TTLs
   here are short, so this is usually minutes.
5. **Update Supabase URL Configuration** to the new origin — see the section
   above. Easy to forget once the site itself is up, and sign-in is broken until
   it is done.
6. **Only then stop the old Railway service.** `yap-web` in the `sleeper-yap-bot`
   project. Leaving it running costs nothing and is the rollback: until the
   records are changed back it is simply unreachable.

   The `yap` service in that project is the **Discord bot, which stays**. It
   shares the project but not the domain, and it holds the only copy of the
   bot's Discord credentials. Do not delete the project to clean up the site.

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
