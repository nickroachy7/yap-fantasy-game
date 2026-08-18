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

## Notes

- Node is pinned to 22.x via `engines.node`; the local `.nvmrc` matches.
- `expo export` writes real HTML per route (`output: "static"` in `app.json`), so
  the deploy is a static site with no server runtime.
- `/preview` is the dev component gallery. It is emitted but inert outside
  development — guarded by `__DEV__`.
