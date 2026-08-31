/**
 * How much room a scrolling page must leave under itself for the tab pill.
 *
 * ---------------------------------------------------------------------------
 * ONE PLACE, BECAUSE THE LAST ONE OF THESE WAS WRONG IN SIX FILES AT ONCE
 * ---------------------------------------------------------------------------
 *
 * The app had a `useTabBarInset()` once and deleted it, because the bar was a
 * SIBLING of the scene and a page already ended where the bar began — so every
 * list that reserved a tail was putting ~88pt of dead black under itself for
 * nothing. See the note on `TabPillHeight`.
 *
 * The pill is positioned absolutely, so that is no longer true: the scene runs
 * the full height of the screen and content really does pass under the glass.
 * The number is back, and it is computed here so the six lists that need it
 * cannot drift apart.
 *
 * ---------------------------------------------------------------------------
 * IT RETURNS 0 WHERE THERE IS NO BAR, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * Only the tab navigator has a pill. Packs, a card, a set, a contest and the
 * pull are pushed OVER the tabs and have none, so padding for one would leave
 * a hole at the bottom of every sheet in the app — which is exactly the bug
 * the old hook shipped.
 *
 * `useSegments` is what answers it. React Navigation's own
 * `BottomTabBarHeightContext` would too, but `@react-navigation/bottom-tabs`
 * is not a dependency of this app — expo-router owns it and re-exports the
 * navigators it wants us to use, so importing it directly would be reaching
 * past the router into its lockfile. The route's segments carry the group
 * names, so `(tabs)` being among them IS the question, asked in the router's
 * own vocabulary.
 *
 * The bar's reported height would not have helped anyway: it is the styled
 * height and knows nothing about the gap we float the pill by, so the
 * arithmetic below is ours either way.
 */
import { useSegments } from 'expo-router';

import { useIsWide } from '@/components/shell/useResponsive';
import { TabPillHeight, TabPillInset } from '@/constants/theme';

export function useTabBarSpace(): number {
  const segments = useSegments();
  const wide = useIsWide();
  const present = (segments as string[]).includes('(tabs)');

  /* Wide web has no pill at all — the rail is the navigation there, and the
     bar is `display: none`. */
  if (wide || !present) return 0;

  /* The capsule's own inset off the bottom, its height, and one more inset of
     clearance above it — without the last one the final row of a list stops
     flush against the glass, which reads as clipped rather than as finished.
     No safe-area term: the pill is placed from the screen's edge, so the
     indicator's reserve is already inside the bottom inset. */
  return TabPillInset * 2 + TabPillHeight;
}
