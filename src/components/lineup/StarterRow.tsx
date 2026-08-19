/**
 * A starting slot at rest.
 *
 * The same two-band shape as the Cards directory row — identity over a tinted
 * stat tray — but asked about THE WEEK rather than the season. Slot badge,
 * name, club and designation, this week's fixture, and a figure that is the
 * week's actual points once the sweep has run.
 *
 * WHY THIS IS NOT `CardRow`
 *
 * CardRow's own header says one component must draw the starter and the bench,
 * because the bench only works if a candidate can be compared with the man
 * above him. That remains true, and this does not break it: the comparison
 * happens INSIDE the picker, which lists every eligible card in CardRow's
 * compact form with the incumbent marked `IN`. So the two rows answer two
 * different questions at two densities — this one is the slot at rest, read
 * eight times down a page; CardRow is twenty candidates being scanned against
 * each other. Making the picker 90pt a row would put four options on a phone.
 *
 * Fixed height, like the directory row, for the same reason: nothing here may
 * wrap, and both bands have known heights.
 */
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { DASH } from '@/components/ui/DataTable';
import { PositionBadge, positionsForSlot } from '@/components/ui/PositionBadge';
import { positionColors } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryAbbr, injuryWeight } from '@/lib/injury';

import { FormBars } from './FormBars';
import { kickoffLabel, matchupLabel, type LineupCard } from './model';

export const STARTER_ROW_HEIGHT = 90;
const IDENTITY_HEIGHT = 58;
const STRIP_HEIGHT = STARTER_ROW_HEIGHT - IDENTITY_HEIGHT;

const GUTTER = 14;

export function StarterRow({
  slot,
  card,
  points,
  scored,
  selected,
  disabled,
  eligibleCount,
  eligiblePositions,
  onPress,
}: {
  slot: string;
  /** Null when the slot is empty — which is a row, not a gap. */
  card: LineupCard | null;
  /** This slot's scored points. Null when the week has not been swept. */
  points: number | null;
  scored: boolean;
  selected: boolean;
  disabled: boolean;
  eligibleCount: number;
  eligiblePositions: string;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tray = scheme === 'dark' ? c.surface : c.surfaceSunken;
  const accent = positionColors(card?.position, scheme).accent;

  const weight = injuryWeight(card?.injuryStatus);
  const form = card?.form ?? null;
  const kick = kickoffLabel(card?.game ?? null);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        card
          ? `${slot}: ${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap to change.`
          : `${slot} is empty. ${eligibleCount} eligible ${eligiblePositions} cards. Tap to choose.`
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.identity}>
        <PositionBadge label={slot} positions={positionsForSlot(slot)} size={26} />

        <View style={styles.names}>
          {card ? (
            <>
              <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
                {card.name}
              </Text>
              <View style={styles.meta}>
                <Text numberOfLines={1} style={[Type.fine, { color: accent }]}>
                  {(card.position ?? '—').toUpperCase()}
                </Text>
                <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                  {card.team?.toUpperCase() ?? DASH}
                </Text>
                {weight && card.injuryStatus ? (
                  <Text
                    numberOfLines={1}
                    style={[Type.micro, { color: weight === 'blocking' ? c.negative : c.warning }]}>
                    {injuryAbbr(card.injuryStatus)}
                  </Text>
                ) : null}
              </View>
              {/* The fixture is the whole point of a week row, so it gets its
                  own baseline rather than trailing the club. A team with no
                  game reads BYE, which is the failure people actually lose
                  weeks to. */}
              <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                {card.game?.opponent
                  ? `${kick ? `${kick} ` : ''}${matchupLabel(card.game)}`
                  : 'BYE — no game this week'}
              </Text>
            </>
          ) : (
            <>
              <Text numberOfLines={1} style={[styles.name, { color: c.textTertiary }]}>
                {eligibleCount > 0 ? `Choose a ${eligiblePositions}` : `No ${eligiblePositions} cards`}
              </Text>
              <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                {eligibleCount > 0 ? `${eligibleCount} eligible` : 'Open a pack to fill this slot'}
              </Text>
            </>
          )}
        </View>

        <View style={[styles.figure, { backgroundColor: tray, borderColor: c.border }]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>WK</Text>
          {scored && points !== null ? (
            <Text numberOfLines={1} style={[styles.figureValue, NUMERIC, { color: c.text }]}>
              {points.toFixed(1)}
            </Text>
          ) : (
            // Not "0.0". An unplayed week has no score, and a zero here would
            // be indistinguishable from a starter who blanked.
            <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.strip, { backgroundColor: tray }]}>
        <Cell label="FP/G" value={form ? form.fpPerGame.toFixed(1) : DASH} />
        <Cell label="SEASON" value={form ? form.seasonFp.toFixed(0) : DASH} />
        <Cell label="GP" value={form ? String(form.gamesPlayed) : DASH} />
        <View style={styles.formCell}>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            LAST {form?.recent.length ?? 0}
          </Text>
          {form && form.recent.length > 0 ? (
            <FormBars values={form.recent} width={48} />
          ) : (
            <Text style={[Type.body, { color: c.textTertiary }]}>{DASH}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.cell}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: STARTER_ROW_HEIGHT },
  identity: {
    height: IDENTITY_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
  },
  names: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  figure: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 62,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  figureValue: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  strip: {
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
  },
  cell: { flex: 1, minWidth: 0, justifyContent: 'center' },
  /* The bars need more room than a number and sit at the end, where the
     directory row puts its rate — the two screens stay recognisably related. */
  formCell: { flex: 1.4, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center', gap: 1 },
});
