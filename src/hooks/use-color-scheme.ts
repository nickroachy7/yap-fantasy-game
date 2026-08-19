/**
 * The app's colour scheme. One value, on every platform: dark.
 *
 * This is a product decision rather than a limitation. The chrome was already
 * fixed dark in both schemes — the header band and the web rail are both
 * `#0E0F12` regardless of the device setting — so honouring a light device gave
 * a white page hanging off black navigation, and the two builds of the same
 * screen did not look like the same app. Card tiers are also drawn from a
 * palette tuned against a black surface (see TierColors.dark): the light set
 * exists, but the motifs and frames were designed on the dark one.
 *
 * It stays a hook, and every screen keeps calling it, because the shape is what
 * makes a future toggle a one-file change: swap the constant for state from a
 * provider and 60 call sites follow. Nothing reads `Colors.light` through this
 * today, but nothing has been deleted either.
 *
 * The web-specific copy this replaced returned 'light' until hydration to keep
 * static rendering consistent. A constant cannot mismatch, so the server and
 * the client now agree without the flash of a light first paint.
 */
export function useColorScheme(): 'dark' {
  return 'dark';
}
