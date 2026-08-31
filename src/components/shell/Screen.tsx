/**
 * Standard page frame: header, then content, with consistent horizontal gutters
 * and a max width so the web build does not sprawl on a desktop monitor.
 *
 * Every tab uses this so the chrome cannot drift between screens.
 */
import { usePathname } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { useFrame } from '@/components/shell/frame';
import { isOverlayPath, webSectionOf } from '@/components/shell/sections';
import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { useIsWide } from '@/components/shell/useResponsive';
import { WebPageTabs } from '@/components/shell/WebPageTabs';
import { Colors, ContentMeasure, Spacing, type Measure } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  /**
   * Page name, e.g. "Leaderboard". Rendered as the page heading on wide web.
   *
   * OVERRIDDEN ON WIDE WEB FOR A FOLDED BOARD, and that is the one piece of
   * magic in this component. Inventory passes "Inventory" and Sets passes
   * "Sets" because on a phone those ARE the two pages. On web they are two
   * views of Collection reached from one rail row, so the heading names the
   * board and the tabs beneath it name the view — printing "Inventory" above a
   * row whose first tab also says "Inventory" would say the same word twice
   * and leave the board itself unnamed anywhere on the screen.
   *
   * `webSectionOf` decides, from the path alone, so no page had to be told it
   * had been folded; a page moved between sections keeps working either way,
   * exactly as with `useFrame`.
   */
  title?: string;
  /**
   * How wide this screen's content wants to be. A grid of cards and a settings
   * form are not the same kind of page and should not share a measure — see
   * ContentMeasure. Defaults to `grid`, the widest, so a screen that says
   * nothing gets the window rather than a reading measure.
   */
  measure?: Measure;
  /* Also overridden on wide for a folded board — see `WebNavSpec.measure`. The
     views of one board have to agree about how wide the page is, or switching
     tabs looks like the layout breaking. */
  /**
   * Secondary line under the page heading, e.g. "Preseason · Week 3".
   *
   * WIDE ONLY. The narrow header is a fixed masthead — wordmark and balance,
   * nothing that changes per screen — so there is no heading on a phone for
   * this to sit under, and it used to hang off the wordmark instead. Screens
   * still pass it unconditionally; it simply has no narrow presentation.
   */
  context?: string;
  /**
   * A full-bleed band pinned between the chrome and the page, outside the
   * scroll. NARROW ONLY.
   *
   * It is a slot on the frame rather than the first child of `children`
   * because of where it has to sit, and that is not expressible from inside
   * the content box: FLUSH against the bottom of the masthead, with no page
   * gutter and no content gap. Passed as content it inherited
   * `styles.content`'s 16pt padding and 14pt gap, so it floated below the
   * header with a stripe of page background above it and read as the first
   * item on the page rather than as part of the chrome.
   *
   * Outside the ScrollView on purpose: a band here is the state of the week,
   * so it must not scroll away from the decision it is context for.
   *
   * THERE WAS A WIDE PRESENTATION AND IT IS DELETED. It put the band across
   * the top of the page above the heading, bleeding past the frame's wide
   * gutter and the `maxWidth` measure so it read as a ticker rather than as
   * another boxed panel. That was right while the top of a browser window was
   * empty. It is not any more: `WebHeader` puts a permanent score band there,
   * so anything in this slot landed directly underneath another full-bleed
   * band — which the shell gallery demonstrated by drawing the ticker twice,
   * one under the other, the day the header shipped.
   *
   * A wide band is still a reasonable thing to want. It belongs beside the
   * header in `(tabs)/_layout`, where it can be mounted once for the session
   * and can sit ABOVE or beside the scoreboard rather than being a second
   * stripe under it. Do not restore this branch to get one.
   *
   * NOTHING IN THE PRODUCT PASSES ONE TODAY. `ScoreStrip` was the band this
   * slot was built for and the scoreboard has its own tab; the shell gallery
   * is the only caller left.
   */
  banner?: ReactNode;
  children: ReactNode;
  /** Set false when the screen owns its own list (FlatList virtualises itself). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Dev galleries only, and the third of these in the shell — `Sidebar` and
   * `FantasyTopNav` carry the same prop for the same reason.
   *
   * The wide heading now depends on the ROUTE (see `title`), and a gallery
   * route matches no nav href, so the folded-board case — the heading naming
   * the board with its views as tabs beneath — was the one arrangement in the
   * shell that could not be looked at. Product code passes nothing and uses
   * the real router.
   */
  pathnameOverride?: string;
  /**
   * Draw the masthead above this page. True everywhere except the tabs that
   * are not the YAP experience.
   *
   * THE MASTHEAD IS NOT APP CHROME, IT IS THE YAP TAB'S CHROME. It carries the
   * run's hearts and the gem balance, and neither is universal: Leagues,
   * Scores and Profile are separate experiences with no hearts riding and
   * nothing priced in gems, so a bar stating both above them is answering a
   * question those screens never ask. It read as app-wide furniture only
   * because every page happened to be drawn by this component.
   *
   * The YAP tab itself never passes this — `FantasyFrame` draws the masthead
   * above the whole navigator and sets `frame.header`, so the flag below is
   * already false there. This is for the pages that draw their own, which is
   * the three other tabs and every pushed YAP screen (packs, contests, a card,
   * a set), and only the first group turns it off.
   *
   * TURNING IT OFF MOVES THE SAFE-AREA INSET. `AppHeader` owns the top inset —
   * it is the first thing on the screen, so it pads for the notch. With no
   * masthead nothing else does, and the page runs under the status bar. See
   * `paddingTop` on the narrow branch.
   */
  masthead?: boolean;
};

export function Screen({
  title,
  measure = 'grid',
  context,
  banner,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  pathnameOverride,
  masthead = true,
}: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // The sidebar already shows the wordmark, balance and account on wide web;
  // rendering the header too would say all of it twice.
  const isWide = useIsWide();

  /**
   * What the frames above this page have already drawn — see `frame.tsx`.
   *
   * Two consequences, and they are separate, which is why they are two flags.
   * A masthead already on screen is simply not drawn again. And a NAV BAR
   * directly above the page takes over the gap between the chrome and the
   * content, exactly as it did when it was the first child of this box, so the
   * content gives up its top padding — leaving both in would put 16 above the
   * bar and another 16 below it.
   *
   * The lineup is the case that needs them apart: a masthead and the top nav
   * above it, but no action bar — so it keeps its padding.
   */
  const frame = useFrame();
  const flush = frame.nav && !isWide;

  /* WHOEVER IS FIRST ON THE SCREEN PADS FOR THE NOTCH. Normally that is the
     masthead, which owns the inset itself. Without one this box is the first
     thing on the page, so it takes the inset over — otherwise the content
     starts under the status bar. Nothing to do on wide, where there is no
     notch and the rail is the first column. */
  const top = useSafeAreaInsets().top;
  const bare = !isWide && !frame.header && !masthead;

  /* ROOM FOR THE PILL, which floats over this page rather than sitting under
     it. Every scrolling page in the app comes through here, so this is the one
     line that covers all of them; the handful of screens that own their own
     virtualised list call the same hook. Zero off the tab navigator. */
  const tabSpace = useTabBarSpace();

  /* Null on a page that is a page in its own right, and on every phone: the
     narrow build still navigates these with the action bar and has no heading
     for tabs to sit under. */
  const realPathname = usePathname();
  const routed = pathnameOverride ?? realPathname;

  /**
   * The last path that was a PAGE, so a sheet opened over this one cannot
   * change what this one says it is.
   *
   * `usePathname` reports the top of the stack, and the sheets are mounted
   * above the tab navigator with the page beneath still rendered — so opening
   * Packs from Players re-titled the page behind the dialog from "Players" to
   * "Trend", dropped its view tabs and re-measured it, then put all three back
   * on close. See `isOverlayPath`, which is also where the rail's opposite and
   * correct behaviour is argued.
   *
   * State set DURING RENDER, which is React's own pattern for "something from
   * the previous render" and not the mistake it looks like: React discards the
   * output and re-runs this component immediately, before committing or
   * touching the DOM, so the extra pass costs one render of one component at
   * the moment a sheet opens. A ref adjusted in place would be cheaper and is
   * what this was first written as — `react-hooks/refs` rejects it, correctly:
   * a ref read during render is invisible to React, so nothing guarantees the
   * page re-renders when the value changes back.
   */
  const [lastPage, setLastPage] = useState(routed);
  const overlaid = isOverlayPath(routed);
  if (!overlaid && routed !== lastPage) setLastPage(routed);
  const pathname = overlaid ? lastPage : routed;
  /* Memoised on the path: this returns a fresh object with a fresh `tabs`
     array every call, and `Screen` re-renders once a second on the lineup
     while the lock counts down. */
  const section = useMemo(
    () => (isWide ? webSectionOf(pathname) : null),
    [isWide, pathname],
  );
  /** The board's name where there is one, else the page's own. See `title`. */
  const heading = section?.label ?? title;
  /** The board's width where there is one, else the page's own. See `measure`. */
  const maxWidth = ContentMeasure[section?.measure ?? measure];

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        flush && styles.flushTop,
        { maxWidth, paddingBottom: Spacing.three + tabSpace },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    // A virtualised list must own the scroll container, so only gutters here.
    <View style={[styles.flexContent, flush && styles.flushTop, { maxWidth }]}>{children}</View>
  );

  return (
    /* The wide gutter is on the frame, not on each box inside it: capping the
     * content at 1180 leaves only 12pt beside a 236pt rail on a 1440pt window,
     * so the page reads as pressed up against the navigation. A gutter here
     * holds regardless of what the cap works out to at a given width. */
    <View
      style={[
        styles.fill,
        isWide && styles.wideGutter,
        { backgroundColor: c.background },
        bare && { paddingTop: top },
      ]}>
      {isWide ? (
        <>
          {/* No `banner` here — the slot is narrow-only, see the prop. */}
          {/* Dropping AppHeader on wide is right — the rail already carries the
           * wordmark, balance and account. But what replaced it was a 12pt grey
           * context line and nothing else, so web pages had no heading at all and
           * "Leaderboard" appeared only on a segmented control. The rail says
           * which section you are in; the page should still say what it is. */}
          <View style={[styles.pageHeader, { maxWidth }]}>
            <View style={styles.titleBlock}>
              {heading ? (
                <Text style={[styles.title, { color: c.text }]}>{heading}</Text>
              ) : null}
              {context ? (
                <Text style={[styles.context, { color: c.textSecondary }]}>{context}</Text>
              ) : null}
            </View>
            {/* Under the heading rather than beside it. Beside it was tried and
                puts a control on the optical centre line of a 26pt title, which
                reads as part of the title; under it the tabs sit on the page's
                own baseline and the hairline they carry becomes the edge
                between the chrome and the content. */}
            {section ? <WebPageTabs tabs={section.tabs} pathname={pathname} /> : null}
          </View>
        </>
      ) : (
        <>
          {/* The masthead only: the tab bar already names the screen, and
           * vertical space is the scarce resource on a phone. `context` is not
           * passed — see the prop.
           *
           * Skipped inside a frame, which drew it once above the navigator and
           * must keep it — see `FantasyFrame`. */}
          {frame.header || !masthead ? null : <AppHeader />}
          {/* Immediately under it, with nothing between the two. The header
              draws on the page background now, so the strip's own surface is
              the first edge on the screen — which is the right one to be. */}
          {banner}
        </>
      )}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wideGutter: { paddingHorizontal: Spacing.three },
  content: {
    padding: Spacing.three,
    gap: 14,
    width: '100%',
    alignSelf: 'center',
  },
  pageHeader: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    /* 20 rather than the 24 it was: there is a band of chrome directly above
       the page now, so the heading no longer has to hold the top of the window
       open on its own. */
    paddingTop: 20,
    paddingBottom: Spacing.two,
    gap: Spacing.two + 2,
  },
  /* The title and its context line are one block with the old 2pt between
     them; the `gap` above is now the larger space between that block and the
     view tabs. */
  titleBlock: { gap: 2 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  context: { fontSize: 12, letterSpacing: 0.3 },
  flexContent: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    /* The same top gap the scrolling branch gets from its `padding`. Without
       it a `scroll={false}` screen — the directory, the inventory — started its
       first control flush against the header, which read as the control
       belonging to the header rather than to the page. Vertical only: the
       horizontal gutter still belongs to the list inside, which measures its
       own box to lay out a grid. */
    paddingTop: Spacing.three,
  },
  /* Applied last, so it wins over whichever branch's padding came before it.
     See `flush`.

     14 RATHER THAN THE PAGE'S 16, and it used to be zero. The section bar was
     paying for this gap out of its own bottom padding, which worked for exactly
     as long as the bar could not move — and during the spell when it could, a
     page with no top padding of its own arrived flush against the top nav's
     hairline and the card on the lineup touched it. So the gap is the page's
     and the bar pays nothing, which keeps the rhythm even: 14 under the
     hairline to the bar, 14 under the bar to the content, 14 to whatever is
     under that. */
  flushTop: { paddingTop: 14 },
});
