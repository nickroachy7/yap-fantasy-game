/**
 * The two ways the grid can be empty. They are different problems and get
 * different answers.
 *
 * A brand-new player owns nothing, and a blank grid tells them nothing about
 * why or what to do — so that state names the free Starter Pack and sends them
 * to the Shop. A filtered-to-nothing grid is the player's own doing, so it just
 * offers to undo it.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

function Action({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const c = Colors[useScheme()];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: primary ? c.text : c.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.strong, { color: primary ? c.background : c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Nothing owned at all — the first thing a new account sees on this tab. */
export function EmptyCollection({ onGetCards }: { onGetCards: () => void }) {
  const c = Colors[useScheme()];

  return (
    <View style={[styles.panel, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>NO CARDS YET</Text>
      <Text style={[Type.figure, { color: c.text }]}>Your collection is empty</Text>
      <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
        Cards arrive from packs. The free Starter Pack is eight cards with at least one at every
        lineup position, so it is enough to field a full lineup straight away.
      </Text>
      <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
        Every card starts at bronze and climbs a tier by scoring fantasy points in your lineup —
        the cards you own are the cards you level up.
      </Text>
      <View style={styles.actions}>
        <Action label="Open the Starter Pack" onPress={onGetCards} primary />
      </View>
      <Text style={[Type.fine, { color: c.textTertiary }]}>
        Packs live in Collection · Shop.
      </Text>
    </View>
  );
}

/** Owns cards, but the current filters exclude all of them. */
export function EmptyFilterResult({
  onClear,
  hasFilters,
}: {
  onClear: () => void;
  hasFilters: boolean;
}) {
  const c = Colors[useScheme()];

  return (
    <View style={styles.inline}>
      <Text style={[Type.section, { color: c.text }]}>Nothing matches</Text>
      <Text style={[Type.body, styles.centred, { color: c.textSecondary }]}>
        You own cards, just none that fit these filters.
      </Text>
      {hasFilters ? (
        <View style={styles.actions}>
          <Action label="Clear filters" onPress={onClear} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.four,
    gap: Spacing.two,
    // A measure, not the full grid width: this block is sentences, and 1180pt
    // of prose on a monitor is unreadable however dense the type is.
    maxWidth: 560,
  },
  inline: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  centred: { textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingTop: Spacing.one },
  action: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: { opacity: 0.75 },
});
