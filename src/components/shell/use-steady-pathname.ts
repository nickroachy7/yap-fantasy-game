/**
 * The path a page should call itself while something is presented OVER it.
 *
 * `usePathname` reports the top of the router's stack, and it is not scoped to
 * the screen that asks — expo-router's `useRouteInfo` reads one global store
 * through `useSyncExternalStore`, so every component in the tree gets the same
 * string. The sheets are mounted above the tab navigator with the page beneath
 * still rendered and still visible (a page sheet is inset and drags away; a web
 * `transparentModal` paints nothing at all), so while one is open the page
 * underneath asks "where am I?" and is told "/card/abc".
 *
 * Everything that derives from the route then changes behind the sheet: the
 * heading, the view tabs, and — the case this was extracted for — the nav's
 * active mark. `FantasyTopNav` matches four section prefixes and `Sidebar`
 * matches the rail's rows; a sheet's path matches neither, so both go from
 * "COMPETE, underlined in the accent" to nothing at all, and the accent
 * appears to drain out of the app as you pull a profile back down.
 *
 * WHY A HOOK AND NOT THREE COPIES. `Screen` has had this fix since the wide
 * heading started deriving from the route; the two navs never got it. That is
 * the shape of bug `sections.ts` warns about in `isWebNavActive` — "two
 * implementations of 'which row am I on' is how the rail and the page heading
 * come to disagree about it" — so the rule is stated once here and the
 * differences between callers are pushed into `isOverlaid`, which is the one
 * thing they genuinely disagree about. See `isOverlayPath` and `isSheetPath`.
 *
 * STATE SET DURING RENDER, which is React's own pattern for "something from the
 * previous render" and not the mistake it looks like: React discards the output
 * and re-runs this component immediately, before committing or touching the
 * DOM, so the extra pass costs one render at the moment a sheet opens. A ref
 * adjusted in place would be cheaper and is what `Screen`'s version was first
 * written as — `react-hooks/refs` rejects it, correctly: a ref read during
 * render is invisible to React, so nothing guarantees a re-render when the
 * value changes back.
 */
import { useState } from 'react';

export function useSteadyPathname(
  /** The resolved path, after any gallery override. */
  routed: string,
  /** Whether that path is something presented over a page rather than a page. */
  isOverlaid: (pathname: string) => boolean,
): string {
  const [lastPage, setLastPage] = useState(routed);
  const overlaid = isOverlaid(routed);
  if (!overlaid && routed !== lastPage) setLastPage(routed);
  return overlaid ? lastPage : routed;
}
