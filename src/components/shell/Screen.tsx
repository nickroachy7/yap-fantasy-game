/**
 * Standard page frame: header, then content, with consistent horizontal gutters
 * and a max width so the web build does not sprawl on a desktop monitor.
 *
 * Every tab uses this so the chrome cannot drift between screens.
 */
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, MaxContentWidth } from '@/constants/theme';

type Props = {
  /** Secondary line in the header, e.g. "Preseason · Week 3". */
  context?: string;
  children: ReactNode;
  /** Set false when the screen owns its own list (FlatList virtualises itself). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({ context, children, scroll = true, refreshing, onRefresh }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // The sidebar already shows the wordmark, balance and account on wide web;
  // rendering the header too would say all of it twice.
  const isWide = useIsWide();

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    // A virtualised list must own the scroll container, so only gutters here.
    <View style={styles.flexContent}>{children}</View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {isWide ? (
        context ? (
          <View style={styles.wideContext}>
            <Text style={[styles.wideContextText, { color: c.textSecondary }]}>{context}</Text>
          </View>
        ) : null
      ) : (
        <AppHeader context={context} />
      )}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: 16,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  wideContext: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 2, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  wideContextText: { fontSize: 12, letterSpacing: 0.3 },
  flexContent: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
