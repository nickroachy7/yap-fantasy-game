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
import { StyleSheet, View } from 'react-native';

import { FrameProvider } from '@/components/shell/frame';
import { SectionNav } from '@/components/shell/SectionNav';
import { useIsWide } from '@/components/shell/useResponsive';

export function SectionFrame({
  section,
  children,
}: {
  /** e.g. `/fantasy/collection`. The section whose sub-pages the nav lists. */
  section: string;
  /** The section's navigator. */
  children: ReactNode;
}) {
  const wide = useIsWide();

  return (
    /* Only `nav` is claimed. Whether a masthead is on screen is the business of
       the frame above this one, and a provider that asserted it here would tell
       every page in the section there was no header the day this frame is used
       somewhere without one. */
    <FrameProvider value={{ nav: !wide }}>
      {/* The nav and the navigator are a column, and this is what makes them
          one: the navigator below takes the rest of the height rather than
          measuring to its content. No background — the frame above already
          painted the page, and a second opaque layer here is a full-screen
          overdraw on every section. */}
      <View style={styles.fill}>
        {/* Renders nothing on wide — it decides that itself, see there. */}
        <SectionNav section={section} />
        {children}
      </View>
    </FrameProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
