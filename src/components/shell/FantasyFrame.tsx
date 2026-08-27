/**
 * The chrome the FANTASY TAB owns, drawn once above the navigator that swaps its
 * four boards underneath.
 *
 * It is `SectionFrame` one level up, for the same reason and against the same
 * failure: the top nav navigates with `replace`, a replace unmounts the
 * outgoing screen, and a control that is rendered by the screen it replaces is
 * a control that disappears the moment you press it. Rendered by the tab's
 * `_layout` it sits outside every screen the Stack owns and is mounted once for
 * the whole tab, so flipping between Lineup and Collection cannot blink it,
 * cannot reset its state and cannot re-run its mount effects.
 *
 * `attached` ON THE MASTHEAD IS NOT COSMETIC. The header's bottom padding and
 * the strip's top padding are two components paying for one gap, and left alone
 * they stack to 27pt of dead air between the wordmark and the tab labels. The
 * header stands down to 4 and the strip's 12 does the rest. Anything else
 * mounted between these two would have to make the same arrangement.
 *
 * MASTHEAD, THEN STRIP, ON EVERY SCREEN OF THE TAB — no conditions and no
 * landing page in front of them. A hub page was built here, with the strip
 * appearing only once you had left it, and cut before either shipped; see
 * `fantasy/index.tsx` for why that door was a tax rather than a room. With it
 * gone the header has nothing to go back TO, which is the point: the four
 * boards are peers, and a back arrow among peers has to invent a home for
 * itself.
 *
 * WIDE WEB IS A PASS-THROUGH. The rail already carries the wordmark, the
 * balance and all four boards, so there is no header and no strip to hoist;
 * each page still draws its own heading via `Screen`. The frame state is
 * provided in both cases anyway — `Screen` only consults it on narrow.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { FantasyTopNav } from '@/components/shell/FantasyTopNav';
import { FrameProvider } from '@/components/shell/frame';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function FantasyFrame({ children }: { /** The tab's navigator. */ children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const wide = useIsWide();

  return (
    /* `nav: false`, even though the top nav IS directly above the page. It is a
       rule under a word, not a bar of controls, and it carries no padding of
       its own below it — so unlike `SectionNav` it does not supply the gap
       between the chrome and the content, and the page must keep its own. See
       `frame.tsx` for why these are two flags. */
    <FrameProvider value={{ header: !wide, nav: false }}>
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {wide ? null : (
          <>
            {/* NEITHER OF THESE MOVES ON SCROLL, and that is a decision rather
                than an omission. Between them they carry the only way OUT of
                the board you are on and the balance every price on the screen
                is measured against. A reader twenty rows down should not have
                to scroll back up to find out where they are or what they can
                afford. Nothing in the app's chrome moves on scroll now; the
                summary strips that once did are inside their lists. */}
            <AppHeader attached />
            <FantasyTopNav />
          </>
        )}
        {children}
      </View>
    </FrameProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
