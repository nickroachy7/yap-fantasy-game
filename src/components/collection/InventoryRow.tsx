/**
 * One card you own, as a ROW.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE LINEUP ROW AND NOT A THIRD ROW COMPONENT
 * ---------------------------------------------------------------------------
 *
 * The collection used to be a grid of `PlayerCard` squares. A card face is a
 * lovely object and a poor list item: three across, a 100pt square gives a name
 * ~90pt and everything else has to be a glyph, so the two facts you are here to
 * weigh — what this copy has earned and what it would fetch — arrived as `17`
 * and `/50 TO S` in 9pt type under a portrait. Thirty of those is a mosaic you
 * read by opening cards one at a time.
 *
 * The card face is not gone; it moved to where it earns its keep, which is a
 * pack pull. This screen is a ledger.
 *
 * So the row is the LINEUP row — `Identity` and its geometry, imported, not
 * copied. `sections.ts`'s rule about parallel copies applies with force here:
 * a player looks at his bench on Sunday and his collection on Monday, and two
 * hand-built rows that agree today are two rows that disagree in a month. The
 * badge column, the three lines, the type scale, the inset hairline and the
 * 62pt height are all the compete board's, unchanged.
 *
 * ---------------------------------------------------------------------------
 * WHAT DIFFERS, AND IT IS ONE COLUMN
 * ---------------------------------------------------------------------------
 *
 * The lineup's right column is THE WEEK — points over a projection. A
 * collection has no week: you are not deciding who starts, you are deciding
 * what to keep. So the same two-figure column carries what the COPY is worth:
 *
 *   TFP    total fantasy points this copy has banked over its life
 *   coins  what it sells for right now
 *
 * They are the two halves of one question. The first is why you would keep it,
 * the second is what you give up by keeping it, and having them stacked in one
 * column is the whole reason this screen is worth re-drawing.
 *
 * THE TOTAL COMES OFF THE TIER LINE TO PAY FOR IT. `Identity` prints
 * `B 812.0 TFP  812/2500 to Diamond Tier` on line 3, and with the figure now
 * leading the right-hand column that would be the same number twice in one
 * glance — exactly what the lineup row's own note says a row must not do. So
 * the card is handed to `Identity` with a null career and the progress phrase
 * is passed explicitly: line 3 keeps the tier mark and the distance still to
 * run, which is the half the right column is NOT saying.
 *
 * ---------------------------------------------------------------------------
 * LINE 2 IS THE SEASON, BECAUSE THERE IS NO FIXTURE HERE
 * ---------------------------------------------------------------------------
 *
 * The collection reads no schedule and should not start — see `InventoryCard`
 * for why the fixture was taken off the grid and stayed off. But the line is
 * structural: drop it and these rows are two lines tall next to three-line rows
 * on every other screen; leave it blank and it reads as a failed load.
 *
 * What belongs there is the PLAYER's season, which is the thing line 2 was
 * always about — his form rather than his Sunday. `14.2 FP/G · WR12 of 84` is
 * the case for keeping him, sitting directly above the case the card makes for
 * itself, and it comes off columns `my_collection` already returns.
 *
 * The injury designation still follows it, drawn by `Identity`, in the same two
 * colours as everywhere else. `Q` qualifies a player's season as readily as it
 * qualifies his Sunday.
 *
 * ---------------------------------------------------------------------------
 * SELECTION LIVES IN THE BADGE COLUMN
 * ---------------------------------------------------------------------------
 *
 * On the grid the tick was an overlay on the square and the state marks —
 * STARTING, IN SET — were pills over the picture. A row has an honest place for
 * both: the badge column is 40pt of fixed width that already means "what kind
 * of thing is this", so in multi-select the position badge is replaced by the
 * tick, and the two marks move onto line 2 in front of the season phrase, where
 * they read as qualifications of the row rather than as stickers on it.
 *
 * A BLOCKED ROW GETS NO TICK. Same rule as the grid: the circle is an
 * invitation, and offering one over a card that cannot be ticked is the row
 * contradicting itself. It is dimmed and it says STARTING; the bar at the
 * bottom of the screen says why.
 */
import { StyleSheet, Pressable, Text, View } from 'react-native';

import {
  BADGE_SIZE,
  BADGE_WIDTH,
  Identity,
  LINEUP_ROW_HEIGHT,
  RIGHT_WIDTH,
  type RowCard,
} from '@/components/lineup/LineupRow';
import { tierProgressLabel } from '@/components/lineup/model';
import { Coin } from '@/components/shell/AppHeader';
import { PositionBadge } from '@/components/ui/PositionBadge';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectionCard } from './types';

/** The lineup board's row, to the point. Exported so the list can size itself. */
export const INVENTORY_ROW_HEIGHT = LINEUP_ROW_HEIGHT;

const GUTTER = Spacing.three;

/** One decimal, always — the same rule the lineup column is set by. */
const oneDp = (n: number) => n.toFixed(1);

/**
 * `CollectionCard` -> what a ROW draws.
 *
 * `careerFp: null` is deliberate and is explained at the head of this file: the
 * total leads the right-hand column, so line 3 must not print it as well.
 *
 * `game: undefined` says "this caller cannot speak to fixtures", which is the
 * honest state — `secondary` takes the line instead, so the distinction never
 * reaches the screen.
 */
function toRowCard(card: CollectionCard): RowCard {
  return {
    name: card.playerName,
    position: card.position,
    team: card.team,
    injuryStatus: card.injuryStatus,
    tier: card.tier,
    careerFp: null,
    nextTierAt: card.nextTierAt,
    nextTierLabel: card.nextTierLabel ?? null,
    game: undefined,
  };
}

/**
 * The player's season in one phrase.
 *
 * BOTH HALVES ARE NULLABLE AND THE NULLS ARE REAL. `fpPerGame` is null until he
 * has a scored game, and roughly two in five of the set had no prior-season
 * production to rank — see `CollectionCard`. A row that printed `0.0 FP/G` for
 * a rookie would be inventing a bad season for him, which is the same sin as
 * inventing a projection.
 */
function seasonLine(card: CollectionCard): string {
  const parts: string[] = [];
  if (card.fpPerGame !== null) parts.push(`${oneDp(card.fpPerGame)} FP/G`);
  if (card.posRank !== null && card.posPool !== null && card.position) {
    parts.push(`${card.position}${card.posRank} of ${card.posPool}`);
  }
  return parts.length ? parts.join(' · ') : 'No games scored yet';
}

/**
 * The right column: what the copy has banked, over what it sells for.
 *
 * Built to `SettledFigure`'s box, not merely to look like it — same
 * `RIGHT_WIDTH`, same 19pt figure line over a 15pt second line, so the collection
 * and the compete board put their numbers on the same two baselines and a
 * reader moving between the two screens is not re-learning a column.
 */
function ValueFigure({ points, coins }: { points: number; coins: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  return (
    <View style={[styles.right, { width: RIGHT_WIDTH }]}>
      <View style={styles.figureLine}>
        <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: c.text }]}>
          {oneDp(points)}
        </Text>
      </View>
      {/* THE COIN IS THE LABEL. `TFP` spelled out beside the figure above would
          not fit in 64pt beside a four-figure total, and it does not have to:
          the only other number in the column wears a coin, so the unlabelled
          one is points by elimination — and the tier line two columns left is
          already talking in points. */}
      <View style={styles.coinLine}>
        <Coin size={9} color={coins > 0 ? gold : c.textTertiary} />
        <Text
          numberOfLines={1}
          style={[styles.coinValue, NUMERIC, { color: coins > 0 ? c.textSecondary : c.textTertiary }]}>
          {coins.toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

export function InventoryRow({
  card,
  selecting,
  selected,
  blocked,
  onPress,
  onLongPress,
}: {
  card: CollectionCard;
  /** The list is in multi-select: the badge column becomes the tick. */
  selecting?: boolean;
  selected?: boolean;
  /** Standing in a lineup you have not played — cannot be sold or committed. */
  blocked?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const progress = tierProgressLabel(card);
  const marked = Boolean(selecting && selected);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: marked, disabled: Boolean(selecting && blocked) }}
      accessibilityLabel={describe(card, selecting, blocked)}
      accessibilityHint={
        selecting && blocked
          ? 'In your lineup — cannot be sold or added to a set'
          : undefined
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: marked ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      {/* The CONTENT dims, not the row — the rule is a child of it and fading
          the hairline along with the text breaks the rhythm of the list at
          exactly the rows the eye is trying to skim past. Verbatim from the
          lineup row, and for the same reason. */}
      <View style={[styles.content, selecting && blocked && styles.dimmed]}>
        <View style={styles.badgeCol}>
          {selecting ? (
            blocked ? null : (
              <View
                style={[
                  styles.tick,
                  selected
                    ? { backgroundColor: c.positive, borderColor: c.positive }
                    : { backgroundColor: c.surfaceSunken, borderColor: c.borderStrong },
                ]}>
                {/* A tick drawn as type rather than as an icon: a hand-built
                    check of two Views is a smudge at this size. */}
                {selected ? (
                  <Text style={[Type.label, styles.mark, { color: c.background }]}>✓</Text>
                ) : null}
              </View>
            )
          ) : (
            /* OUTLINED, WITH THE POSITION'S INK. The bench badge's box — see
               `PositionBadge`'s `tone` — because thirty solid accent blocks
               running down a page of cards out-shout the tier marks on line 3,
               which are the thing this screen is actually sorted by. The
               letters keep the accent, so the column is still scannable by
               position at a glance; it is the FILL that was doing the
               shouting, not the colour. */
            <PositionBadge
              label={card.position ?? '--'}
              size={BADGE_SIZE}
              width={BADGE_WIDTH}
              tone="outline"
            />
          )}
        </View>

        <Identity
          card={toRowCard(card)}
          right={<ValueFigure points={card.careerFp} coins={card.sellValue} />}
          secondary={
            <>
              {/* STARTING, in the warning tone rather than the negative one:
                  nothing is wrong and nothing has been refused yet — the card
                  is doing the most valuable thing a card can do. */}
              {selecting && blocked ? (
                <Text
                  style={[
                    Type.micro,
                    styles.pill,
                    { backgroundColor: c.warning, color: c.background },
                  ]}>
                  STARTING
                </Text>
              ) : null}
              {/* IN SET, not "unavailable". This copy is still yours and still
                  sellable; what is gone is the slot. Positive, because it is
                  something the card ACHIEVED. */}
              {selecting && card.inSet && !blocked ? (
                <Text
                  style={[
                    Type.micro,
                    styles.pill,
                    { backgroundColor: c.positive, color: c.background },
                  ]}>
                  IN SET
                </Text>
              ) : null}
              <Text numberOfLines={1} style={[styles.season, { color: c.textTertiary }]}>
                {seasonLine(card)}
              </Text>
            </>
          }
          progress={progress ? { text: progress } : { text: 'Top tier' }}
        />
      </View>

      {/* Inset to the gutter so it reads as the gap between two rows rather than
          as a rule ruled across a table. A child rather than a border, because
          a border cannot be inset. */}
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </Pressable>
  );
}

/** One sentence for a screen reader, which gets no columns to align. */
function describe(card: CollectionCard, selecting?: boolean, blocked?: boolean): string {
  const progress = tierProgressLabel(card);
  const state = selecting
    ? blocked
      ? 'in your lineup, cannot be selected'
      : card.inSet
        ? 'another copy is in a set'
        : null
    : null;

  return [
    `${card.playerName}, ${card.position ?? 'unknown position'} ${card.team ?? 'no team'}`,
    seasonLine(card),
    `${card.tier} card, ${oneDp(card.careerFp)} career points${progress ? `, ${progress}` : ', top tier'}`,
    `sells for ${card.sellValue} coins`,
    state,
    selecting ? null : 'Tap to open this card.',
  ]
    .filter(Boolean)
    .join('. ');
}

const styles = StyleSheet.create({
  /* The rule is a child, so the row's own height is exactly the content box and
     the hairline sits inside it rather than adding half a point to it. */
  row: { height: INVENTORY_ROW_HEIGHT, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
  },
  /* Centred against all three lines rather than pinned to the first: the badge
     is about the ROW, not about the name. */
  badgeCol: { width: BADGE_WIDTH, alignSelf: 'center', alignItems: 'center' },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { lineHeight: 14 },
  /* `overflow: hidden` so the radius actually clips on web, which a Text with a
     background otherwise ignores. `flexShrink: 0` for the same reason the
     injury code has it — a truncated STARTING is worse than a truncated name. */
  pill: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  /* `styles.fixture`'s box on the lineup row, to the point: 11/15, and the only
     thing on its line allowed to give way. */
  season: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 1, minWidth: 0 },
  /* Centred against the whole row rather than pinned to its top. The two
     figures are a pair, not two rows of a table. */
  right: { alignSelf: 'center', alignItems: 'flex-end', gap: 2 },
  figureLine: { flexDirection: 'row', alignItems: 'baseline', height: 19 },
  figure: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3 },
  coinLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, height: 15 },
  coinValue: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  rule: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  /* Still legible, plainly not choosable. Greying each element separately would
     mean teaching every one of them a disabled colour; the row is one object
     and it recedes as one. */
  dimmed: { opacity: 0.45 },
});
