/**
 * One player on the lineup screen — a starting slot, or a card on the bench.
 *
 * The same two-band shape as the Cards directory row — identity over a tinted
 * stat tray — but asked about THE WEEK rather than the season. Badge, name,
 * club and designation, this week's fixture, and a figure that is the week's
 * actual points once the sweep has run.
 *
 * ONE COMPONENT FOR BOTH BOARDS
 *
 * It was two. Starters got this row and the bench got the compact table row
 * from `CardRow`, which was defensible when the bench lived behind its own tab
 * and indefensible once the two boards were stacked in one scroll: the whole
 * point of that stacking is reading a bench player against the starter above
 * him, and at 375pt the compact row could not do it — a 30pt lead column
 * rendered "SWAP" as "SW…" and the name column, squeezed by five numeric
 * columns, cut "Xavier Weathersby" to "Xavier We…". Two rows of different
 * heights, densities and column orders is not a comparison.
 *
 * So the bench is drawn by this, and `CardRow` keeps the job it is actually
 * good at: twenty candidates being scanned inside the swap sheet, where the
 * question is "which of these" rather than "is this one better than him".
 *
 * The two variants differ in three places, and nowhere else:
 *   - the badge is the SLOT for a starter (`FLEX` splits into its eligible
 *     positions) and the POSITION for a bench card;
 *   - the figure is the week's scored points for a starter and the season total
 *     for a bench card, which is the number the directory row leads with too;
 *   - an empty slot is a row rather than a gap, and only starters have those.
 *     A blank space reads as decoration; a row that says "Choose a RB — 6
 *     eligible" reads as work outstanding, which it is.
 *
 * NO BOUNDING BOX. Rows sit directly on the page, as they do in the directory
 * and the collection, and are separated by the two fills rather than by a rule:
 * the identity band sits on the page background, the stat strip on a tray one
 * step in from it, so every row boundary is a tray meeting a page. A rounded
 * border around the board on top of that was a third frame competing with the
 * two that carry meaning — and on a phone it inset every name by another 12pt
 * that the name could not spare.
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

export const LINEUP_ROW_HEIGHT = 90;
const IDENTITY_HEIGHT = 58;
const STRIP_HEIGHT = LINEUP_ROW_HEIGHT - IDENTITY_HEIGHT;

/**
 * 16, not the directory row's 14: these rows are bled to the edges of a page
 * whose headings sit at 16, and a name starting two points inside its own
 * section heading reads as a mistake. The directory has no headings to line up
 * with, which is why the two numbers differ.
 */
const GUTTER = Spacing.three;

export type LineupRowProps = {
  card: LineupCard | null;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
};

/** A starting slot, filled or empty. */
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
}: LineupRowProps & {
  slot: string;
  /** This slot's scored points. Null when the week has not been swept. */
  points: number | null;
  scored: boolean;
  eligibleCount: number;
  eligiblePositions: string;
  selected: boolean;
  disabled: boolean;
}) {
  return (
    <Row
      card={card}
      badge={<PositionBadge label={slot} positions={positionsForSlot(slot)} size={26} />}
      figureLabel="WK"
      // Not "0.0". An unplayed week has no score, and a zero here would be
      // indistinguishable from a starter who blanked.
      figureValue={scored && points !== null ? points.toFixed(1) : null}
      emptyPrimary={eligibleCount > 0 ? `Choose a ${eligiblePositions}` : `No ${eligiblePositions} cards`}
      emptySecondary={eligibleCount > 0 ? `${eligibleCount} eligible` : 'Open a pack to fill this slot'}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={
        card
          ? `${slot}: ${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap to change.`
          : `${slot} is empty. ${eligibleCount} eligible ${eligiblePositions} cards. Tap to choose.`
      }
    />
  );
}

/**
 * A card that is not starting.
 *
 * `destination` is where a tap would land him — the first empty slot he is
 * legal for. It is drawn ON the swap mark rather than in a column of its own,
 * which is where it used to live: a column wide enough for FLEX cost 30pt of
 * every row including the seven that had nothing to put in it, and the sheet
 * that a tap now opens lists every destination anyway. Null when every slot he
 * could take is occupied — the tap still works, it just costs someone.
 */
export function BenchRow({
  card,
  destination,
  selected,
  disabled,
  onPress,
}: LineupRowProps & { card: LineupCard; destination: string | null }) {
  return (
    <Row
      card={card}
      badge={<PositionBadge label={card.position} size={26} />}
      figureLabel="FP"
      figureValue={card.form ? card.form.seasonFp.toFixed(1) : null}
      swapLabel={destination ?? undefined}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={
        destination
          ? `${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap to start him at ${destination} or choose another slot.`
          : `${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap to choose a slot.`
      }
    />
  );
}

function Row({
  card,
  badge,
  figureLabel,
  figureValue,
  swapLabel,
  emptyPrimary,
  emptySecondary,
  selected,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  card: LineupCard | null;
  badge: React.ReactNode;
  figureLabel: string;
  /** Null draws an em dash — "not measured", never a nought. */
  figureValue: string | null;
  /** Written on the swap mark, e.g. the slot a bench tap would fill. */
  swapLabel?: string;
  emptyPrimary?: string;
  emptySecondary?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tray = scheme === 'dark' ? c.surface : c.surfaceSunken;
  const accent = positionColors(card?.position, scheme).accent;

  const weight = injuryWeight(card?.injuryStatus);
  const form = card?.form ?? null;
  const kick = kickoffLabel(card?.game ?? null);
  const pressable = Boolean(onPress) && !disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={!pressable}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.identity}>
        {badge}

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
                {emptyPrimary}
              </Text>
              <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                {emptySecondary}
              </Text>
            </>
          )}
        </View>

        <View style={[styles.figure, { backgroundColor: tray, borderColor: c.border }]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>{figureLabel}</Text>
          {figureValue !== null ? (
            <Text numberOfLines={1} style={[styles.figureValue, NUMERIC, { color: c.text }]}>
              {figureValue}
            </Text>
          ) : (
            <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          )}
        </View>

        {/* The swap mark.

            A plain View inside the row's own Pressable, never a Pressable of
            its own: react-native-web renders `accessibilityRole="button"` as a
            real <button>, and one inside another is invalid HTML that React
            rejects at runtime. So this is an affordance, not a second target —
            it says the row opens something, and the whole row is what you press
            to open it. Without it a tappable row looked exactly like the static
            rows on every other screen in the app.

            Absent when the lineup is locked, because then it does not. */}
        {pressable ? (
          <View
            style={[
              styles.swap,
              swapLabel ? styles.swapWide : null,
              { borderColor: c.border, backgroundColor: tray },
            ]}>
            <Text numberOfLines={1} style={[swapLabel ? Type.micro : Type.body, { color: c.textSecondary }]}>
              {swapLabel ?? '⇄'}
            </Text>
          </View>
        ) : null}
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
  row: { height: LINEUP_ROW_HEIGHT },
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
  swap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A slot code is up to four characters, so the pill grows sideways rather
     than shrinking the type — "FLEX" at 9pt in a 28pt circle is unreadable. */
  swapWide: { width: 'auto', minWidth: 38, paddingHorizontal: Spacing.one + 2, borderRadius: 9 },
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
