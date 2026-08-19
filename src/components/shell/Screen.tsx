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
        /* Dropping AppHeader on wide is right — the rail already carries the
         * wordmark, balance and account. But what replaced it was a 12pt grey
         * context line and nothing else, so web pages had no heading at all and
         * "Leaderboard" appeared only on a segmented control. The rail says
         * which section you are in; the page should still say what it is. */
        <View style={[styles.pageHeader, { maxWidth }]}>
          {title ? <Text style={[styles.title, { color: c.text }]}>{title}</Text> : null}
          {context ? (
            <Text style={[styles.context, { color: c.textSecondary }]}>{context}</Text>
          ) : null}
        </View>
      ) : (
        /* Narrow keeps the header as-is: the tab bar already names the screen,
         * and vertical space is the scarce resource on a phone. */
        <AppHeader context={context} />
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
  },
});
