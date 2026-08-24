/**
 * "24 of 30" — the roster cap, standing where the cards are.
 *
 * WHEN IT RENDERS, AND WHY THAT IS THE CALLER'S CHOICE
 *
 * This draws whatever it is given and decides nothing about whether it should
 * be on screen. The collection grid pins its summary above a FlatList, and that
 * block is documented as fixed-height on purpose — every point of it is paid
 * for on every screen of scrolling, so a line that is usually inert is a line
 * that is usually waste. There it is shown only once it is ACTIONABLE: near the
 * cap, or over it.
 *
 * The recap screen shows the count unconditionally instead, because that page
 * is read once a week and its job is to make the number familiar long before it
 * ever blocks anything. Between the two, a player meets the cap as a fact on a
 * calm Sunday rather than as an error on the day they cross it.
 *
 * THREE STATES, THREE VOLUMES. Under the warning line it is grey and says only
 * what you hold. Near it, it counts down the slots left. Over it, it says
 * outright what to do about it — that is the one state where a player needs a
 * remedy rather than a fact.
 *
 * IT NAMES BOTH EXITS. Committing and selling both clear the cap, and this must
 * not quietly recommend one: committing preserves the collection's board value
 * and feeds a set, selling pays double and destroys it. Which of those a player
 * wants is genuinely their call, and the bar's job is to say a decision exists.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { RosterStatus } from '@/components/recap/recap';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RosterBar({ roster }: { roster: RosterStatus | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!roster) return null;

  const tone = roster.isOver ? c.negative : roster.isNear ? c.warning : c.textSecondary;
  const edge = roster.isOver ? c.negative : c.border;

  return (
    <View
      accessibilityRole="summary"
      style={[styles.bar, { backgroundColor: c.surfaceSunken, borderColor: edge }]}>
      <Text style={[Type.label, { color: c.textTertiary }]}>ROSTER</Text>
      <Text style={[Type.body, styles.grow, { color: tone }]} numberOfLines={2}>
        {roster.isOver
          ? `${roster.overBy} over the limit — commit or sell ${roster.overBy} to set your lineup`
          : roster.isNear
            ? `${roster.remaining} ${roster.remaining === 1 ? 'slot' : 'slots'} left`
            : 'Cards you hold'}
      </Text>
      <Text style={[Type.strong, NUMERIC, { color: tone }]}>
        {roster.held}/{roster.cap}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
});
