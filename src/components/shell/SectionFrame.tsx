/**
 * The chrome a SECTION owns, drawn once, above the navigator that swaps its
 * pages underneath.
 *
 * WHAT WAS WRONG
 *
 * Every page rendered its own `Screen` — which draws `AppHeader` — and its own
 * `SectionNav`. `SectionNav` moves between sub-pages with `router.replace`, and
 * a replace on a Stack UNMOUNTS the outgoing screen and mounts the incoming
 * one. So pressing "Leaders" from "Trend" tore down the header and the nav and
 * built new ones, every time. The nav is the control you just pressed: it must
 * not be the thing that disappears when you press it.
 *
 * It was visible in three separate ways, and all three have the same cause:
 *   - the strip blinked, because it was a new component in a new tree;
 *   - its horizontal SCROLL OFFSET reset, so on Collection — seven items, wider
 *     than a phone — pressing an item you had scrolled to snapped the bar back
 *     to the left;
 *   - the page under it flashed its loading state, because the incoming screen
 *     started from nothing.
 *
 * Only the third is about data (see `session-cache`). The first two are
 * structural, and no amount of caching fixes them: a component that is unmounted
 * has no state to preserve.
 *
 * THE FIX is to move the chrome ABOVE the navigator. The nav is rendered by the
 * section's `_layout`, so it sits outside every screen the Stack owns and is
 * mounted once for the whole section. `replace` then swaps only what is
 * genuinely page-specific. The nav cannot blink, cannot lose its scroll
 * position, and cannot re-run its mount effects, because as far as React is
 * concerned nothing happened to it.
 *
 * IT NO LONGER DRAWS THE MASTHEAD. `FantasyFrame`, one navigator up, draws it
 * once for the whole tab — which is what lets the header survive a move between
 * sections and not only a move within one. This frame announces the nav it drew
 * and inherits the rest; see `frame.tsx`.
 *
 * `Screen` learns about this through context rather than a prop, so the pages
 * did not have to be told which of them live inside a frame — a page moved into
 * or out of a section keeps working either way.
 *
 * WIDE WEB IS A PASS-THROUGH. The rail already lists every sub-page as a row,
 * so there is no nav to hoist; each page still draws its own heading via
 * `Screen`. The frame state is provided in both cases anyway — `Screen` only
 * consults it on narrow.
 */
import type { ReactNode } from 'react';

import { AppHeader } from '@/components/shell/AppHeader';
import { CollapsingSection } from '@/components/shell/collapse';
import { FrameProvider } from '@/components/shell/frame';
import { SectionNav } from '@/components/shell/SectionNav';
import { childrenOf } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';

export function SectionFrame({
  section,
  masthead = false,
  children,
}: {
  /** e.g. `/fantasy/collect`. The section whose sub-pages the nav lists. */
  section: string;
  /**
   * Draw the masthead above the nav, for a frame with nothing above it.
   *
   * A SECTION INSIDE YAP LEAVES THIS ALONE: `FantasyFrame` is already drawing
   * the masthead once for the whole tab, and a second one here would be two.
   * Every section is inside Yap today, so NOTHING PASSES THIS — Players was
   * the one that did, while it was a bottom tab with no frame above it, and it
   * stopped when it came back down to level 2 on 2026-08-24.
   *
   * It stays because the failure it fixes is not hypothetical and would come
   * back with the next root-level section: without it the page's own `Screen`
   * drew the masthead from inside the navigator, which put it BELOW the section
   * nav rather than above it and left the nav sitting under the status bar.
   *
   * It has to be the frame's rather than the page's for the same reason the nav
   * is: chrome rendered by a screen is torn down and rebuilt on every
   * navigation, and this bar sits directly above the control you just pressed.
   */
  masthead?: boolean;
  /** The section's navigator. */
  children: ReactNode;
}) {
  const wide = useIsWide();
  /* CLAIMED ONLY IF THERE IS ONE, and the test is the same one `SectionNav`
     makes: a section with no children draws no bar. `nav` tells the page below
     "something above me has already put a bar on top of you, so do not add your
     own gap" — and Collection and Sets have no children now (Packs moved onto
     their summary strip), so asserting it left both pages pressed up against
     the top nav's hairline with nothing between them. */
  const nav = !wide && childrenOf(section).length > 0;

  return (
    /* `header` is claimed only when this frame is the one drawing it —
       otherwise the flag stays inherited, because whether a masthead is on
       screen is the business of the frame above this one, and asserting it here
       would tell every page in the section there was no header the day this
       frame is used somewhere without one. */
    <FrameProvider value={masthead ? { header: !wide, nav } : { nav }}>
      {/* The nav and the navigator are ONE SLIDING BLOCK, and that is what
          `CollapsingSection` is for: the bar leaves by moving, not by shrinking,
          and the pages move with it so the space it was taking becomes theirs.
          Both halves have to be inside the same component because a transform
          on the bar alone would leave a hole where it used to be — see
          `collapse.tsx`. No background: the frame above already painted the
          page, and a second opaque layer here is a full-screen overdraw on
          every section. */}
      <CollapsingSection
        bar={
          <>
            {/* Above the nav, and only when asked. Wide draws neither: the rail
                is the navigation there and `WebHeader` is the masthead.

                INSIDE THE SLIDING BLOCK, so a frame that does draw one takes it
                with the bar rather than leaving a masthead hanging over a
                collapsed section. */}
            {masthead && !wide ? <AppHeader attached /> : null}
            {/* Renders nothing on wide — it decides that itself, see there.

                IT IS THE ONE PIECE OF CHROME THAT MOVES. Scrolling a page down
                slides it up out of the way and returning to the top brings it
                back, while the masthead and the board strip above stay put —
                see `collapse.tsx` for why this bar is the one that can afford
                to go.

                The nav's own padding travels with it, which is the point — a
                collapsed bar must leave NO gap behind, and the padding is part
                of the bar (see `SectionNav`, which owns all four sides). */}
            <SectionNav section={section} />
          </>
        }>
        {children}
      </CollapsingSection>
    </FrameProvider>
  );
}

