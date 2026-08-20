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
 * THE FIX is to move the chrome ABOVE the navigator. The header and the nav are
 * rendered by the section's `_layout`, so they sit outside every screen the
 * Stack owns and are mounted once for the whole section. `replace` then swaps
 * only what is genuinely page-specific. The nav cannot blink, cannot lose its
 * scroll position, and cannot re-run its mount effects, because as far as React
 * is concerned nothing happened to it.
 *
 * `Screen` learns about this through context rather than a prop, so the pages
 * did not have to be told which of them live inside a frame — a page moved into
 * or out of a section keeps working either way.
 *
 * WIDE WEB IS A PASS-THROUGH. The rail already carries the wordmark, the
 * balance and every sub-page, so there is no header and no nav to hoist; each
 * page still draws its own heading via `Screen`. The context is provided in
 * both cases anyway — `Screen` only consults it on narrow.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { SectionNav } from '@/components/shell/SectionNav';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const Framed = createContext(false);

/**
 * True when a `SectionFrame` above this component has already drawn the header
 * and the section nav. `Screen` uses it to not draw them a second time.
 */
export function useSectionFramed(): boolean {
  return useContext(Framed);
}

export function SectionFrame({
  section,
  children,
}: {
  /** e.g. `/collection`. The section whose sub-pages the nav lists. */
  section: string;
  /** The section's navigator. */
  children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const wide = useIsWide();

  return (
    <Framed.Provider value={!wide}>
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {wide ? null : (
          <>
            <AppHeader />
            <SectionNav section={section} />
          </>
        )}
        {children}
      </View>
    </Framed.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
