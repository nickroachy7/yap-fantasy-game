/**
 * The root HTML every web page is rendered into. Web-only, and it runs in
 * Node during `expo export`, never in a browser — so there is no DOM here, and
 * global CSS must not be imported (the root layout owns that).
 *
 * IT EXISTS FOR THE HEAD. Without this file the export emits a document with no
 * title, no description and no share card: a link to the app pasted into a
 * group chat unfurled as a bare URL, which is precisely the moment the app is
 * being handed to someone.
 *
 * THE TAGS ARE STATIC AND SITE-WIDE ON PURPOSE. Expo's guidance is to set
 * per-page metadata with `<Head />` inside the route, and that is right for
 * pages that have their own identity. Every route here is the same app behind
 * a sign-in wall, so a per-route title would be seven ways of writing "Yap
 * Fantasy" and seven chances for one of them to go stale.
 *
 * ABSOLUTE URLS FOR THE CARD IMAGE. Scrapers do not resolve relative paths —
 * Discord and iMessage both fetch `og:image` as given, so a `/og.png` here
 * unfurls as nothing at all. `SITE` is the deployed origin and has to stay in
 * step with the custom domain; it is the one value in this file that a domain
 * change would invalidate.
 *
 * The image itself is built by `npm run brand` from the same vector the app
 * draws its logo from. It is served out of `public/`, which the export copies
 * to the site root verbatim.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

const SITE = 'https://yapfantasy.com';
const TITLE = 'Yap Fantasy';
const DESCRIPTION = 'Open packs. Set your lineup. Win the week.';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/**
         * `viewport-fit=cover` IS WHAT MAKES THE SAFE AREA EXIST ON WEB.
         *
         * Without it iOS Safari lays the page out inside the safe area and
         * reports every `env(safe-area-inset-*)` as 0. `useSafeAreaInsets()`
         * reads those variables on web, so it returned 0 at the bottom, and the
         * tab bar — which sizes itself `TabBarContentHeight + insets.bottom`
         * and pads by the same amount, exactly so it can reach the edge —
         * had nothing to reach into. The bar stopped short and the strip under
         * it, where the home indicator sits, was left showing the page.
         *
         * The bar was never wrong. It was told the inset was zero.
         *
         * This opts the page into the full window, which means content CAN now
         * pass under the notch and the indicator. That is safe here because the
         * chrome already asks for the insets rather than assuming them: the
         * masthead pads by `insets.top`, the tab bar by `insets.bottom`, and
         * the sheets by their own. Turning this on without those would put the
         * wordmark under the clock.
         */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />

        {/* The browser chrome the app is opened in. `theme-color` is what stops
            Safari on iOS drawing a white bar above a black app. */}
        <meta name="theme-color" content="#080808" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={TITLE} />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={TITLE} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={SITE} />
        <meta property="og:image" content={`${SITE}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={`${SITE}/og.png`} />

        {/* Keeps a root ScrollView behaving the way it does on native. */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
