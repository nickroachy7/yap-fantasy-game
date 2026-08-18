import { Redirect } from 'expo-router';

/**
 * `/` has no screen of its own — Home was removed once the header took over
 * showing gems and account access. This keeps the bare path working: without
 * it, visiting the deployed domain root 404s, and every `<Redirect href="/" />`
 * in the auth flow lands nowhere.
 *
 * Hidden from the tab bar via `href: null` in the layout.
 */
export default function AppIndex() {
  return <Redirect href="/lineup" />;
}
