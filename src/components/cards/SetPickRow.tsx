/**
 * One set on offer for one card: what it is, how far along it is, what it pays.
 *
 * SHARED BY THE TWO PLACES A CARD CAN BE PUT INTO A SET WITHOUT GOING TO THE
 * SET'S OWN PAGE — the pack reveal, and a card's own profile. It moved out of
 * `PackReveal` the moment the second caller appeared rather than being imported
 * from it: a screen reaching into the pack-opening component for a row would
 * make the card profile depend on a feature it has nothing to do with, and the
 * next edit to the reveal would be an edit to the profile by accident.
 *
 * IT RENDERS WHAT `card_actions` SAYS AND DECIDES NOTHING. Every figure on it —
 * the payout, the progress, whether the row should be offered at all — is the
 * server's, for the reasons the migration's note sets out. See `PullSet`.
 *
 * `spare` is the one thing the row says that is not on the set: whether the
 * commit would burn THIS copy or an older, cheaper one. `commit_card_to_set`
 * always takes the least valuable copy you hold, so on a player you already own
 * the card that goes is not the card you are looking at, and a row that did not
 * say so would be describing an act other than the one about to happen.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CardActionSet } from './card-actions';

export function SetPickRow({
  set,
  busy,
  spare,
  onPress,
}: {
  set: CardActionSet;
  busy: boolean;
  /** The commit would burn an older copy rather than this one. */
  spare: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${set.name}, ${set.committed} of ${set.required} filled, pays ${set.pays} gems`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
        busy && styles.dim,
      ]}>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {set.name}
        </Text>
        <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {`${set.committed} of ${set.required} filled`}
          {set.family === 'daily' ? ' · expires at midnight' : ''}
          {spare ? ' · uses a spare copy' : ''}
        </Text>
      </View>
      <View style={styles.pay}>
        <Gem size={10} color={gold} />
        <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{set.pays}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  pay: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
