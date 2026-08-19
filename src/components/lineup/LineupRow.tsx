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
 * It was two. Starters got this row and the bench got a compact table row,
 * which was defensible when the bench lived behind its own tab
 * and indefensible once the two boards were stacked in one scroll: the whole
 * point of that stacking is reading a bench player against the starter above
 * him, and at 375pt the compact row could not do it — a 30pt lead column
 * rendered "SWAP" as "SW…" and the name column, squeezed by five numeric
 * columns, cut "Xavier Weathersby" to "Xavier We…". Two rows of different
 * heights, densities and column orders is not a comparison.
 *
 * So the bench is drawn by this — and so, now, is the swap sheet: `PlayerBand`
 * below exports the identity band alone, without the stat strip, which is what
 * that sheet lists. The compact table row it used to use is gone. Twenty
 * candidates and eight starters are the same players, and reading them in two
 * different row formats at the moment you are comparing them was the cost.
 *
 * The two variants differ in three places, and nowhere else:
 *   - the badge is the SLOT for a starter (`FLEX` splits into its eligible
 *     positions) and `BN` for a bench card, so one glance down the page sorts
 *     the eight who are playing from the rest;
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
import { useState } from 'react';
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

/** What a bench card's badge says instead of his position. See BenchRow. */
const BENCH_BADGE = 'BN';

export type LineupRowProps = {
  card: LineupCard | null;
  /** Opens the swap sheet. The BADGE is the control for this, not the row. */
  onSwap?: () => void;
  /** Opens the player profile. Everything except the badge does this. */
  onOpenProfile?: () => void;
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
  onSwap,
  onOpenProfile,
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
      onSwap={onSwap}
      onOpenProfile={onOpenProfile}
      swapLabel={card ? `Change who starts at ${slot}` : `Choose a ${eligiblePositions} for ${slot}`}
      accessibilityLabel={
        card
          ? `${slot}: ${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap for his profile.`
          : `${slot} is empty. ${eligibleCount} eligible ${eligiblePositions} cards. Tap to choose.`
      }
    />
  );
}

/**
 * A card that is not starting.
 *
 * THE BADGE READS `BN`, NOT THE PLAYER'S POSITION.
 *
 * Both boards are on one scroll, so the question a reader asks of any given row
 * is "is this one of my eight, or is it on the bench" — and when every badge
 * showed a position, a bench WR and a starting WR2 were told apart only by how
 * far down the page they were. The badge now answers it: a slot code means he
 * is playing, `BN` means he is not, and the eye can sort the page in one pass.
 *
 * The position is not lost — it is on the meta line under the name, in its own
 * accent, where the directory row puts it too.
 *
 * `destination` is where the swap would land him — the first empty slot he is
 * legal for. It no longer has a mark of its own to be written on (see Row), but
 * it still carries the screen reader's label, which is the one place it was
 * doing real work.
 */
export function BenchRow({
  card,
  destination,
  selected,
  disabled,
  onSwap,
  onOpenProfile,
}: LineupRowProps & { card: LineupCard; destination: string | null }) {
  return (
    <Row
      card={card}
      badge={<PositionBadge label={BENCH_BADGE} size={26} />}
      figureLabel="FP"
      figureValue={card.form ? card.form.seasonFp.toFixed(1) : null}
      selected={selected}
      disabled={disabled}
      onSwap={onSwap}
      onOpenProfile={onOpenProfile}
      swapLabel={
        destination
          ? `Start ${card.name} at ${destination}, or choose another slot`
          : `Choose a slot for ${card.name}`
      }
      accessibilityLabel={`${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap for his profile.`}
    />
  );
}

/**
 * TWO TARGETS IN ONE ROW, AND WHY THEY ARE SIBLINGS.
 *
 * The badge changes the lineup; everything else opens the player. That is the
 * whole interaction, and it retires the ⇄ mark this row used to carry — a
 * control that existed only to say "the row opens something", back when the row
 * opened exactly one thing.
 *
 * They CANNOT be nested. react-native-web renders `accessibilityRole="button"`
 * as a real <button>, and a button inside a button is invalid HTML that React
 * rejects at runtime — the same trap `SwapSheet` and `ConfirmDialog` document.
 * So the row itself is a plain View and the two Pressables sit side by side
 * inside it, with the strip a third that shares the profile's press.
 *
 * Which means the pressed highlight has to be lifted to the row, or pressing a
 * name would light only the top band of an object that reads as one row.
 */
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
  onSwap,
  onOpenProfile,
  accessibilityLabel,
}: {
  card: LineupCard | null;
  badge: React.ReactNode;
  figureLabel: string;
  /** Null draws an em dash — "not measured", never a nought. */
  figureValue: string | null;
  /** The badge's accessible name — what changing the lineup here would do. */
  swapLabel?: string;
  emptyPrimary?: string;
  emptySecondary?: string;
  selected?: boolean;
  disabled?: boolean;
  onSwap?: () => void;
  onOpenProfile?: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tray = scheme === 'dark' ? c.surface : c.surfaceSunken;
  // Identity computes its own colours and labels now; the strip below still
  // needs the form.
  const form = card?.form ?? null;

  const canSwap = Boolean(onSwap) && !disabled;
  /* An EMPTY slot has no profile to open, so the whole row is the swap — a row
     that says "Choose a RB" must do that wherever you press it. A card with no
     player id behind it falls the same way rather than becoming inert. */
  const openBody = onOpenProfile ?? (canSwap ? onSwap : undefined);

  const [pressed, setPressed] = useState(false);
  const press = {
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
  };

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: selected ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.identity}>
        {canSwap ? (
          <Pressable
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel={swapLabel ?? 'Change this slot'}
            /* The badge is 26pt — under the 44pt minimum on its own, and it is
               now the only way to change a lineup. The slop takes it to the
               row's full height and into the gutter beside it. */
            hitSlop={{ top: 16, bottom: 16, left: GUTTER, right: Spacing.two }}
            style={({ pressed: p }) => [styles.badgeHit, p && styles.badgePressed]}>
            {badge}
          </Pressable>
        ) : (
          badge
        )}

        <Pressable
          onPress={openBody}
          disabled={!openBody}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(selected) }}
          accessibilityLabel={accessibilityLabel}
          style={styles.body}
          {...press}>
          <Identity
            card={card}
            figureLabel={figureLabel}
            figureValue={figureValue}
            emptyPrimary={emptyPrimary}
            emptySecondary={emptySecondary}
          />
        </Pressable>
      </View>

      {/* The stat strip shares the body's target: it is part of the same row and
          answers the same question, so pressing it opens the same player. */}
      <Pressable
        onPress={openBody}
        disabled={!openBody}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.strip, { backgroundColor: tray }]}
        {...press}>
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
      </Pressable>
    </View>
  );
}


/**
 * The contents of the identity band: who he is, then one figure.
 *
 * Extracted because the swap sheet draws the SAME band without the stat strip
 * under it — see `PlayerBand`. It used to draw its own compact table row
 * instead, and a sheet whose rows were a different object from the rows it was
 * opened from made you re-read the same eight players in a second format at the
 * exact moment you were comparing them.
 */
function Identity({
  card,
  figureLabel,
  figureValue,
  emptyPrimary,
  emptySecondary,
}: {
  card: LineupCard | null;
  figureLabel: string;
  figureValue: string | null;
  emptyPrimary?: string;
  emptySecondary?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tray = scheme === 'dark' ? c.surface : c.surfaceSunken;
  const accent = positionColors(card?.position, scheme).accent;
  const weight = injuryWeight(card?.injuryStatus);
  const kick = kickoffLabel(card?.game ?? null);

  return (
    <>
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
    </>
  );
}

/**
 * The identity band on its own — no stat strip under it.
 *
 * What the swap sheet lists. One press target, because in a sheet the whole row
 * IS the choice; the lineup board's two-target split would be meaningless here.
 *
 * `lead` is the mark in front of the badge — `IN` for the incumbent, `OUT` for
 * the player being moved.
 */
export function PlayerBand({
  card,
  badge,
  lead,
  figureLabel,
  figureValue,
  emptyPrimary,
  emptySecondary,
  selected,
  onPress,
  accessibilityLabel,
}: {
  card: LineupCard | null;
  badge: React.ReactNode;
  lead?: React.ReactNode;
  figureLabel: string;
  figureValue: string | null;
  emptyPrimary?: string;
  emptySecondary?: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.band,
        { backgroundColor: selected ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      {lead ? <View style={styles.lead}>{lead}</View> : null}
      {badge}
      <Identity
        card={card}
        figureLabel={figureLabel}
        figureValue={figureValue}
        emptyPrimary={emptyPrimary}
        emptySecondary={emptySecondary}
      />
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
  /* The badge's own target. No box of its own — the badge IS the affordance,
     and a ring around it would read as a second control beside the thing it
     surrounds. The hit area is grown with hitSlop instead, which costs no
     pixels. */
  badgeHit: { alignItems: 'center', justifyContent: 'center' },
  badgePressed: { opacity: 0.55 },
  /* The identity band standing alone, in the swap sheet. Same geometry as the
     band inside a row, so a player looks identical in both places. */
  band: {
    height: IDENTITY_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
  },
  /* Fixed, so IN / OUT / a slot code all start at the same x down the list. */
  lead: { width: 30, alignItems: 'flex-start', justifyContent: 'center' },
  /* Everything except the badge, as one target: name, fixture and figure. */
  body: {
    flex: 1,
    minWidth: 0,
    height: IDENTITY_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
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
