/**
 * Standard page frame: header, then content, with consistent horizontal gutters
 * and a max width so the web build does not sprawl on a desktop monitor.
 *
 * Every tab uses this so the chrome cannot drift between screens.
 */
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, ContentMeasure, Spacing, type Measure } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  /** Page name, e.g. "Leaderboard". Rendered as the page heading on wide web. */
  title?: string;
  /**
   * How wide this screen's content wants to be. A grid of cards and a settings
   * form are not the same kind of page and should not share a measure — see
   * ContentMeasure. Defaults to `grid` because the collection is the screen
   * the width was reclaimed for.
   */
  measure?: Measure;
  /** Secondary line in the header, e.g. "Preseason · Week 3". */
  context?: string;
  /**
   * A full-bleed band pinned between the chrome and the page, outside the
   * scroll — the score strip is the one that exists.
   *
   * It is a slot on the frame rather than the first child of `children` because
   * of where it has to sit, which is different on each platform and is not
   * expressible from inside the content box:
   *
   *  - narrow: FLUSH against the bottom of the header band, with no page gutter
   *    and no content gap. Passed as content it inherited `styles.content`'s
   *    16pt padding and 14pt gap, so it floated below the header with a stripe
   *    of page background above it and read as the first item on the page
   *    rather than as part of the chrome.
   *  - wide: across the top of the page, above the heading, running the full
   *    width of the content column — past both the frame's wide gutter and the
   *    `maxWidth` measure, which is what makes it a ticker rather than another
   *    boxed panel.
   *
   * Outside the ScrollView on purpose: it is the state of the week, so it must
   * not scroll away from the decision it is context for.
   */
  banner?: ReactNode;
  children: ReactNode;
  /** Set false when the screen owns its own list (FlatList virtualises itself). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
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
}: Props) {
  const maxWidth = ContentMeasure[measure];
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // The sidebar already shows the wordmark, balance and account on wide web;
  // rendering the header too would say all of it twice.
  const isWide = useIsWide();

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { maxWidth }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    // A virtualised list must own the scroll container, so only gutters here.
    <View style={[styles.flexContent, { maxWidth }]}>{children}</View>
  );

  return (
    /* The wide gutter is on the frame, not on each box inside it: capping the
     * content at 1180 leaves only 12pt beside a 236pt rail on a 1440pt window,
     * so the page reads as pressed up against the navigation. A gutter here
     * holds regardless of what the cap works out to at a given width. */
    <View
      style={[styles.fill, isWide && styles.wideGutter, { backgroundColor: c.background }]}>
      {isWide ? (
        <>
          {/* Across the top of the page, before the heading. The negative
              margin cancels the frame's wide gutter so the band reaches the
              rail on one side and the window on the other; capped at the
              measure it would be a panel with the page's shoulders around it,
              which is the one thing a ticker must not look like. */}
          {banner ? <View style={styles.wideBanner}>{banner}</View> : null}
          {/* Dropping AppHeader on wide is right — the rail already carries the
           * wordmark, balance and account. But what replaced it was a 12pt grey
           * context line and nothing else, so web pages had no heading at all and
           * "Leaderboard" appeared only on a segmented control. The rail says
           * which section you are in; the page should still say what it is. */}
          <View style={[styles.pageHeader, { maxWidth }]}>
            {title ? <Text style={[styles.title, { color: c.text }]}>{title}</Text> : null}
            {context ? (
              <Text style={[styles.context, { color: c.textSecondary }]}>{context}</Text>
            ) : null}
          </View>
        </>
      ) : (
        <>
          {/* Narrow keeps the header as-is: the tab bar already names the screen,
           * and vertical space is the scarce resource on a phone. */}
          <AppHeader context={context} />
          {/* Immediately under it, with nothing between the two: the band's own
              top hairline becomes the header's bottom edge. */}
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
  /* Cancels `wideGutter`. Inert on narrow, where the frame has no gutter to
     give back and the banner is already flush. */
  wideBanner: { marginHorizontal: -Spacing.three },
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
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    gap: 2,
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  context: { fontSize: 12, letterSpacing: 0.3 },
  flexContent: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    /* The same top gap the scrolling branch gets from its `padding`. Without
       it a `scroll={false}` screen — the directory, the inventory — started its
       first control flush against the header band, which read as the control
       belonging to the header rather than to the page. Vertical only: the
       horizontal gutter still belongs to the list inside, which measures its
       own box to lay out a grid. */
    paddingTop: Spacing.three,
  },
});
