/**
 * One player on the lineup screen — a starting slot, or a card on the bench.
 *
 * TWO COLUMNS, AND WHAT EACH ONE IS FOR
 *
 * Left is IDENTITY, three lines deep, reading down from most to least fixed:
 *
 *   1. the name, then the position in its own accent, then the club
 *   2. this week's fixture, and the designation that qualifies it
 *   3. what the CARD has earned — tier, career FP, and the distance to the
 *      next tier
 *
 * THE DESIGNATION SITS WITH THE FIXTURE, NOT WITH THE NAME. It was on line 1
 * after the club, which is where the directory row puts it — and the directory
 * is right to, because there the question is "who is this player". Here the
 * question is "does he play on Sunday", and `Q` is not a fact about the man,
 * it is a doubt about the game. On the fixture line it qualifies the thing it
 * is actually about, and it hands line 1 back to the name, which is the half
 * that was being ellipsised.
 *
 * One or two characters, not four — see `injuryCode`. `QUES` on the end of
 * "Sat 4:00p @ MIA" is a second phrase competing with the matchup; `Q` is a
 * mark on it.
 *
 * Right is THE WEEK, two figures stacked and centred in the row: the points
 * over the projection. They do NOT line up with the left column's rows, and
 * trying to make them was the wrong instinct — the left column is a paragraph
 * about a card and the right is a pair of numbers about a Sunday, and pinning
 * the second figure to the fixture line implied a correspondence that only
 * half held. Two things centred against each other read as two things; two
 * things nearly aligned read as a table with a bug in it.
 *
 * NO BOX AROUND THE FIGURES. It used to be a bordered chip, which was the right
 * call when the number floated at the right edge of a block of three lines and
 * needed something to say which line it belonged to. Squaring the two figures
 * off against their own lines does that job with alignment instead, and the
 * chip on top of it was a frame around something already anchored.
 *
 * THE PROJECTION IS A DASH, AND MUST STAY ONE UNTIL IT ISN'T
 *
 * balldontlie sells no projections — verified 404s, recorded in
 * docs/sleeper-spec-coverage.md — and the standing rule in this codebase is
 * that nothing fabricates one. `PlayerCard` draws the same empty slot for the
 * same reason. An average dressed as a forecast is that fabrication, so the
 * slot is drawn and labelled and holds the app's "not reported" mark: the
 * layout does not move on the day real projections arrive, and until then the
 * row says plainly that we do not have one.
 *
 * The label is what makes that legible. A bare em dash under a bare number is
 * punctuation; `PROJ —` is a statement.
 *
 * NO STAT STRIP. The Cards directory row carries one — five season figures on
 * a tinted tray under the name — because that screen's whole job is ranking
 * strangers against each other, and the numbers ARE the comparison. This screen
 * is not that. You already own these cards, and the decision in front of you is
 * which of them plays this week.
 *
 * ONE COMPONENT FOR BOTH BOARDS
 *
 * It was two. Starters got this row and the bench got a compact table row,
 * which was defensible when the bench lived behind its own tab and
 * indefensible once the two boards were stacked in one scroll: the whole point
 * of that stacking is reading a bench player against the starter above him, and
 * at 375pt the compact row could not do it — a 30pt lead column rendered "SWAP"
 * as "SW…" and the name column, squeezed by five numeric columns, cut "Xavier
 * Weathersby" to "Xavier We…". Two rows of different heights, densities and
 * column orders is not a comparison.
 *
 * So the bench is drawn by this — and so, now, is the swap sheet: `PlayerBand`
 * below is this row's contents with a different right-hand figure.
 *
 * The two variants differ in three places, and nowhere else:
 *   - the badge is the SLOT for a starter and `BN` for a bench card, so one
 *     glance down the page sorts the eight who are playing from the rest.
 *     Both are drawn the same way — outlined, on the page — because the CODE
 *     is what distinguishes them and it always was. The BN badge used to carry
 *     a filled grey to make the difference doubly visible, and a solid block
 *     repeated down the longest board on the screen out-shouted the eight rows
 *     that actually needed the attention;
 *   - the week's figure is the points the CONTEST credited the slot for a
 *     starter, and the player's own scored line for a bench card. See below;
 *   - an empty slot is a row rather than a gap, and only starters have those.
 *     A blank space reads as decoration; a row that says "Choose a RB — 6
 *     eligible" reads as work outstanding, which it is.
 *
 * NO BOUNDING BOX, AND THE QUIETEST POSSIBLE RULE. Rows sit directly on the
 * page, as they do in the directory and the collection. What separates them is
 * a hairline in `border` — the lower-contrast of the two border tokens — INSET
 * to the gutter so it starts under the badge rather than running off both
 * edges of the screen. Full-bleed, that rule reads as a table; stopped at the
 * text it reads as a gap between rows, which is all it is being asked to be.
 *
 * Fixed height, like the directory row, for the same reason: nothing here may
 * wrap.
 */
import { useState } from 'react';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { TierMark } from '@/components/cards/TierMark';
import { Gem } from '@/components/shell/AppHeader';
import type { GameStatus } from '@/components/scores/scoreboard';
import { DASH } from '@/components/ui/DataTable';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { positionColors } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, TierColors, Type, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';

import {
  kickoffLabel,
  liveLabel,
  matchupLabel,
  resultLabel,
  tierProgressLabel,
  weekFigureFor,
  type GameContext,
  type LineupCard,
} from './model';

/**
 * Three lines on the left — 20 for the name, 15 for the fixture, 15 for the
 * tier line — plus the two 2pt gaps between them, in a box with 4pt of air top
 * and bottom.
 */
export const LINEUP_ROW_HEIGHT = 62;

/**
 * 16, not the directory row's 14: these rows are bled to the edges of a page
 * whose headings sit at 16, and a name starting two points inside its own
 * section heading reads as a mistake. The directory has no headings to line up
 * with, which is why the two numbers differ.
 */
const GUTTER = Spacing.three;

/** What a bench card's badge says instead of his position. See BenchRow. */
const BENCH_BADGE = 'BN';

/**
 * The badge column. One height and ONE WIDTH for every badge on this screen —
 * slot, FLEX and `BN` alike — so the names beside them all start at the same x.
 *
 * They did not. A badge used to be as wide as its contents: 26 square for `QB`,
 * 32 for `RB1`, 45 for the three-cell FLEX. Nine of those stacked in a column
 * stepped the name in and out row by row, which reads as the page twitching
 * while you scan it — and it is the sort of misalignment that is invisible in a
 * mockup of one row and unmissable in a real lineup.
 *
 * 40 is set by the FLEX split, the widest thing the column has to hold: three
 * cells need room for three initials, and everything else is padded out to
 * meet it. Dropping the slot ordinals (see `slotBadgeLabel`) took the solid
 * badges down to two characters, which is what makes 40 comfortable for them
 * rather than merely possible.
 */
export const BADGE_SIZE = 26;
export const BADGE_WIDTH = 40;

/**
 * The right column's width, fixed rather than intrinsic, and THE SAME ON BOTH
 * SURFACES.
 *
 * Two things need it to be a known number. The figures square off into a
 * straight edge instead of ragging with their own digit counts — and the tier
 * line underneath can be given exactly this much negative margin, so it runs
 * the full width of the row rather than being squeezed into what is left
 * beside a column that has nothing at its height. Without that, "812/2500 to
 * Diamond Tier" ellipsised on a phone while an inch of empty space sat over it.
 *
 * 64 is set by `PROJ —`, the widest thing the board's column ever holds. The
 * settled column holds `+22.1` over `◆ 106`, which is under 50 — so it fits
 * here with room, and the two boards' right edges land on the same x.
 *
 * IT WAS BRIEFLY 84, AND THAT WAS A MISTAKE WORTH RECORDING. The settled column
 * carried the card's pre-contest total beside the gain, which needed the extra
 * twenty points, and every one of them came out of the name — "Ty Simpson"
 * truncated to "Ty Simps…" on a 375pt phone. The fix was not a wider column: it
 * was noticing that the `before` figure belonged on the tier line, next to the
 * total it moved. A column that has to grow is usually a column holding
 * something that lives somewhere else.
 */
export const RIGHT_WIDTH = 64;

/**
 * EVERYTHING A ROW NEEDS TO DRAW A CARD, and deliberately nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `LineupCard`
 * ---------------------------------------------------------------------------
 *
 * `Identity` took a `LineupCard` and touched nine of its fields. The other
 * five — the instance id, the player id, the season, the form, the swap
 * eligibility — exist to support a DECISION, and a settled entry has none to
 * support: `contest_lineup` does not return them and should not, because it is
 * a definer function over other people's rows and its column list is the
 * access control (see `20260830010000`).
 *
 * So the settled lineup grew its own row, and for a while that was the right
 * call. It stopped being right the moment the two had to look the same: two
 * implementations of one object, in the one place a player compares them, is
 * the parallel-copy problem `sections.ts` warns about — and it would have been
 * this copy that drifted, because only one of the two is on a screen anybody
 * looks at every week.
 *
 * Narrowing the input is the fix that keeps both arguments. `LineupCard`
 * satisfies this structurally, so the board is unchanged; `PeekSlot` can be
 * mapped onto it without inventing a form or an instance id it has no right
 * to; and the nine fields a ROW actually reads are now written down in one
 * place instead of being discoverable only by reading the JSX.
 *
 * `careerFp` is the one field that widens rather than narrows. A settled row
 * can be talking to a database without `20260831020000`, where the card's
 * history is simply absent — see the tier line.
 */
export type RowCard = {
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus?: string | null;
  tier: CardTier;
  careerFp: number | null;
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /**
   * WHAT THE CARD HAD BANKED BEFORE THIS WEEK, where a caller knows.
   *
   * Undefined on the board, which has no "before" to speak of: it is drawing a
   * week that has not finished, so the total beside the tier mark is simply
   * where the card stands. A settled row does have one, and printing both ends
   * of the movement is the whole reason its third line is worth reading —
   * `0.0 → 9.8 TFP` says this contest is where all of it came from, which
   * `9.8 TFP` does not say at all.
   *
   * Drawn only where the card actually MOVED. A bye scores nothing, and
   * `48.5 → 48.5` is an arrow through a card that did not go anywhere — worse
   * than no arrow, because it invites the reader to look for a difference that
   * is not there.
   */
  careerBefore?: number | null;
  /**
   * THREE STATES, AND THE THIRD IS THE ONE WORTH SPELLING OUT.
   *
   *   a context   he is playing, or has played, somebody
   *   null        a BYE — his club is idle, which the row says in the negative
   *               colour because it is the failure people actually lose weeks
   *               to and no injury feed ever mentions it
   *   undefined   THE CALLER CANNOT SAY. Only a settled row reaches this, on an
   *               install talking to a database without `20260831050000`, and
   *               it must not be collapsed into the bye: a card that played and
   *               scored 12.4, drawn as "BYE — no game this week" in red, is
   *               the row telling a confident lie about the one thing on it
   *               nobody can check from the screen.
   *
   * `LineupCard` types this `GameContext | null`, so the board can only ever
   * reach the first two.
   */
  game?: GameContext | null;
};

/** One decimal, always — a column of points where some carry a .0 and some do
 *  not is a column that does not line up, tabular figures or otherwise. */
const oneDp = (n: number) => n.toFixed(1);

export type LineupRowProps = {
  card: LineupCard | null;
  /** Opens the swap sheet. The BADGE is the control for this, not the row. */
  onSwap?: () => void;
  /** Opens the CARD profile — this row is one copy you own, and the
   *  collection grid opens the same screen. Everything except the badge. */
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
  /* The CONTEST's figure, not the player's stat line, and they are different
     claims: this is what the slot was credited. The two agree once a week is
     swept, and only this one is the number the total above the board was built
     from — a row disagreeing with its own contest card is a support ticket.

     GATED ON THE GAME, not on whether a sweep has run. `scored` only says the
     lineup has been through score_week, which now happens every minute from the
     start of the week — so on its own it let a Tuesday lineup print eight
     stored noughts for games that had not kicked off. `weekFigureFor` decides
     from the fixture; `scored` stays as the guard against showing a credited
     figure for a week that genuinely has none. */
  const figure = scored ? weekFigureFor(points, card?.game ?? null) : null;
  const week = figure === null ? null : oneDp(figure);

  return (
    <Row
      card={card}
      /**
       * THE POSITION ACCENT, and this reverses a deliberate earlier decision.
       *
       * These were neutral outlines on the argument that this screen is about
       * CARDS, so a card's TIER is the colour that should carry down the column
       * and a position accent would be a second colour system competing with it.
       * That argument is real and it lost to what the column actually looks
       * like: nine identical grey chips, in the one place a reader is scanning
       * specifically for POSITION — "where does my flex go", not "what tier is
       * my flex". Tier has the `TierMark` and the card art; the slot had
       * nothing but three grey letters.
       *
       * It also makes the split badge earn its keep. FLEX draws as R|W|T in
       * three separate accents, so the slot answers what may go in it at a
       * glance instead of spelling it out in monochrome.
       *
       * THE BENCH STAYS NEUTRAL, which is what now tells the two apart — filled
       * means it is in your lineup, outlined means it is not. (An older note
       * here claimed the bench was already filled. It was not; both were grey,
       * and starter and bench were distinguished by nothing at all.)
       */
      badge={
        <PositionBadge
          /* `RB`, not `RB1` — the ordinal is for the code. See slotBadgeLabel. */
          label={slotBadgeLabel(slot)}
          /* Resolved from the FULL code: RB1 and RB2 are different keys. */
          positions={positionsForSlot(slot)}
          size={BADGE_SIZE}
          width={BADGE_WIDTH}
        />
      }
      right={<WeekFigure points={week} status={card?.game?.status ?? null} />}
      emptyPrimary={eligibleCount > 0 ? `Choose a ${eligiblePositions}` : `No ${eligiblePositions} cards`}
      emptySecondary={eligibleCount > 0 ? `${eligibleCount} eligible` : 'Open a pack to fill this slot'}
      selected={selected}
      disabled={disabled}
      onSwap={onSwap}
      onOpenProfile={onOpenProfile}
      swapLabel={card ? `Change who starts at ${slot}` : `Choose a ${eligiblePositions} for ${slot}`}
      accessibilityLabel={
        card
          ? `${slot}: ${describe(card, week)}. Tap to open this card.`
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
 * showed a position, a bench WR and a starting WR were told apart only by how
 * far down the page they were. The badge now answers it: a slot code means he
 * is playing, `BN` means he is not, and the eye can sort the page in one pass.
 *
 * The position is not lost — it follows the name on the first line, in its own
 * accent, where the directory row puts it too.
 *
 * The badge is outlined, exactly like a slot's. See the note at the head of
 * this file: `BN` and `WR` are already two different words.
 *
 * ITS WEEK FIGURE IS THE PLAYER'S, NOT THE CARD'S. A benched copy earns you
 * nothing, so there is no credited number for it — but the man is playing
 * regardless, and what he scored while sitting on your bench is the whole
 * substance of "should I have started him". That is `form.weekFp`.
 *
 * `destination` is where the swap would land him — the first empty slot he is
 * legal for. It carries the screen reader's label, which is the one place it
 * was ever doing real work.
 */
export function BenchRow({
  card,
  destination,
  selected,
  disabled,
  onSwap,
  onOpenProfile,
}: LineupRowProps & { card: LineupCard; destination: string | null }) {
  /* Same rule as a starter's, deliberately. The two figures come from different
     places — a slot's credit against a player's own line — but "has this number
     happened yet" is a question about the fixture, and answering it two ways in
     one column is how a benched tight end came to show a dash beside the word
     FINAL. */
  const figure = weekFigureFor(card.form?.weekFp ?? null, card.game);
  const week = figure === null ? null : oneDp(figure);

  return (
    <Row
      card={card}
      badge={
        <PositionBadge label={BENCH_BADGE} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />
      }
      right={<WeekFigure points={week} status={card.game?.status ?? null} />}
      selected={selected}
      disabled={disabled}
      onSwap={onSwap}
      onOpenProfile={onOpenProfile}
      swapLabel={
        destination
          ? `Start ${card.name} at ${destination}, or choose another slot`
          : `Choose a slot for ${card.name}`
      }
      accessibilityLabel={`${describe(card, week)}. Tap to open this card.`}
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
 * inside it.
 *
 * Which means the pressed highlight has to be lifted to the row, or pressing a
 * name would light only half of an object that reads as one row.
 */
function Row({
  card,
  badge,
  right,
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
  right: React.ReactNode;
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

  const canSwap = Boolean(onSwap) && !disabled;
  /* An EMPTY slot has no card to open, so the whole row is the swap — a row
     that says "Choose a RB" must do that wherever you press it. A card with no
     player id behind it falls the same way rather than becoming inert. */
  const openBody = onOpenProfile ?? (canSwap ? onSwap : undefined);

  const [pressed, setPressed] = useState(false);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: selected ? c.backgroundSelected : c.background },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.content}>
        <View style={styles.badgeCol}>
          {canSwap ? (
            <Pressable
              onPress={onSwap}
              accessibilityRole="button"
              accessibilityLabel={swapLabel ?? 'Change this slot'}
              /* The badge is 26pt — under the 44pt minimum on its own, and it
                 is now the only way to change a lineup. The slop takes it to
                 the row's full height and into the gutter beside it. */
              hitSlop={{ top: 20, bottom: 20, left: GUTTER, right: Spacing.two }}
              style={({ pressed: p }) => [styles.badgeHit, p && styles.badgePressed]}>
              {badge}
            </Pressable>
          ) : (
            badge
          )}
        </View>

        <Pressable
          onPress={openBody}
          disabled={!openBody}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(selected) }}
          accessibilityLabel={accessibilityLabel}
          style={styles.body}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}>
          <Identity
            card={card}
            right={right}
            emptyPrimary={emptyPrimary}
            emptySecondary={emptySecondary}
          />
        </Pressable>
      </View>

      {/* Inset to the gutter, so it reads as the gap between two rows rather
          than as a rule ruled across a table. Drawn as a child rather than as
          the row's own border because a border cannot be inset. */}
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

/**
 * The row's contents: three lines of identity, and whatever figure the surface
 * wants beside the first two.
 *
 * Extracted because the swap sheet draws exactly this — see `PlayerBand`. It
 * used to draw its own compact table row instead, and a sheet whose rows were a
 * different object from the rows it was opened from made you re-read the same
 * players in a second format at the exact moment you were comparing them.
 */
export function Identity({
  card,
  right,
  progress: progressOverride,
  emptyPrimary,
  emptySecondary,
}: {
  card: RowCard | null;
  right: React.ReactNode;
  /**
   * Replaces the tier line's closing phrase.
   *
   * The board says how far there is to go as a SPAN — `142/200 to Silver Tier`
   * — because it is a standing position you check every week. A settled row
   * says it as a DISTANCE, and sometimes says a promotion instead, because it
   * is reporting a movement that has just happened. That is the whole of the
   * difference and it is the reason this is a prop rather than a fork of the
   * component: everything above this line is identical on the two surfaces and
   * has to stay identical.
   */
  progress?: { text: string; tone?: 'positive' } | null;
  emptyPrimary?: string;
  emptySecondary?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = positionColors(card?.position, scheme).accent;
  const weight = injuryWeight(card?.injuryStatus);
  /* The kickoff time answers "when", and stops being worth the space the moment
     the answer is "now" — so once the game is under way the state takes its
     place: "Q3 04:22 vs BUF", then "FINAL vs BUF". The matchup is what
     identifies the fixture and stays put through all three. */
  const result = resultLabel(card?.game ?? null);
  const state = result ? null : liveLabel(card?.game ?? null);
  const kick = state ?? (result ? null : kickoffLabel(card?.game ?? null));
  /* The override wins where there is one, INCLUDING an explicit null — a
     caller that has no phrase to offer is not asking for the board's. */
  const progress =
    progressOverride !== undefined
      ? progressOverride
      : card && card.careerFp !== null
        ? { text: tierProgressLabel({ ...card, careerFp: card.careerFp }) ?? 'Top tier' }
        : null;

  return (
    <>
      <View style={styles.lines}>
        {card ? (
          <>
            {/* Name, position, club — one line, in that order, because that is
                the order the question is asked in. The position keeps its
                accent (the directory colours it the same way); the club after
                it is subordinate to it and set as such. */}
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
                {card.name}
              </Text>
              <Text numberOfLines={1} style={[styles.meta, { color: accent }]}>
                {(card.position ?? '—').toUpperCase()}
              </Text>
              {card.team ? (
                <Text numberOfLines={1} style={[styles.meta, { color: c.textTertiary }]}>
                  {`— ${card.team.toUpperCase()}`}
                </Text>
              ) : null}
            </View>

            {/* A team with no game reads BYE, and reads it in the NEGATIVE
                colour rather than the same grey as a kickoff time. It is the
                failure people actually lose weeks to, no injury feed ever
                mentions it, and it is the only place the screen says so. */}
            <View style={styles.fixtureLine}>
              {/* THE RESULT LEADS WHERE THERE IS ONE, in its own colour and in
                  front of the score it is a verdict on. `W` and `L` are the
                  only two things on this line that are ever coloured for a
                  reason other than the game's state, so they are drawn as a
                  separate token rather than tinting the whole line: `W 27–13
                  vs BUF` in green would claim the OPPONENT was good news too.

                  A tie takes the quiet colour. It is not a result anybody is
                  pleased or sorry about, and a third accent for a state that
                  happens twice a season would be a colour nobody learns. */}
              {result ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.fixture,
                    styles.fixtureLive,
                    styles.designation,
                    {
                      color:
                        result.mark === 'W'
                          ? c.positive
                          : result.mark === 'L'
                            ? c.negative
                            : c.textTertiary,
                    },
                  ]}>
                  {result.mark}
                </Text>
              ) : null}
              <Text
                numberOfLines={1}
                style={[
                  styles.fixture,
                  /* Three colours for three states, and only one of them is an
                     alarm. BYE is the negative because it is a failure you can
                     still fix; LIVE is the positive because it is the row
                     asking to be looked at; everything else is quiet grey. */
                  {
                    color: !card.game?.opponent
                      ? c.negative
                      : card.game.status === 'live'
                        ? c.positive
                        : c.textTertiary,
                  },
                  card.game?.status === 'live' && styles.fixtureLive,
                ]}>
                  {card.game === undefined
                  ? ''
                  : card.game?.opponent
                    ? [kick, result?.score, matchupLabel(card.game)].filter(Boolean).join(' ')
                    : 'BYE — no game this week'}
              </Text>
              {/* The doubt, on the thing it is a doubt about. Two colours, not
                  one: `Out` and `Questionable` are not the same warning, and
                  the feed emits four times as many of the second. */}
              {weight && card.injuryStatus ? (
                <Text
                  numberOfLines={1}
                  style={[
                    Type.micro,
                    styles.designation,
                    { color: weight === 'blocking' ? c.negative : c.warning },
                  ]}>
                  {injuryCode(card.injuryStatus)}
                </Text>
              ) : null}
            </View>

            {/* What the CARD has earned, which is a different subject from the
                two lines above it: they are about a player this Sunday, this is
                about a copy you own and how close it is to promotion.

                TWO GROUPS, SEPARATED BY SPACE RATHER THAN BY A DASH. The dash
                that used to sit between them was doing a job the gap already
                does, and it read as an equals sign — as though the total and
                the ratio were two spellings of one number rather than a
                standing figure and a distance still to run. The tier letter
                binds to the total it belongs to; the wider gap before the
                phrase is what tells them apart. */}
            <View style={styles.tierLine}>
              <TierMark tier={card.tier} />
              {/* `TFP`, because a bare 812.0 on a row that also carries this
                  week's points is a second unlabelled number in the same
                  glance, and the two are not the same quantity — one is what
                  the COPY has banked over its life, the other is one Sunday.

                  NULL IS A REAL STATE, and it means the server did not send a
                  career at all — an install talking to a database without
                  `20260831020000`. The line keeps its tier mark and its height
                  rather than vanishing, because a row one line shorter than the
                  seven around it is a worse answer than a row that is quiet
                  about one thing. */}
              {card.careerFp === null ? null : (
                <>
                  {/* WHERE IT CAME FROM, where the caller knows and the card
                      moved. The quiet half of the pair: it is the reference the
                      total is read against, not a figure anybody is scanning
                      for on its own. */}
                  {card.careerBefore !== undefined &&
                  card.careerBefore !== null &&
                  card.careerBefore !== card.careerFp ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.meta, NUMERIC, styles.designation, { color: c.textTertiary }]}>
                      {`${oneDp(card.careerBefore)} \u2192`}
                    </Text>
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={[styles.meta, NUMERIC, { color: c.textSecondary }]}>
                    {oneDp(card.careerFp)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
                    TFP
                  </Text>
                </>
              )}
              {progress ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.meta,
                    styles.progress,
                    { color: progress.tone === 'positive' ? c.positive : c.textTertiary },
                  ]}>
                  {progress.text}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text numberOfLines={1} style={[styles.name, { color: c.textTertiary }]}>
              {emptyPrimary}
            </Text>
            <Text numberOfLines={1} style={[styles.fixture, { color: c.textTertiary }]}>
              {emptySecondary}
            </Text>
          </>
        )}
      </View>

      {right}
    </>
  );
}

/**
 * A row's worth of HEIGHT, and nothing in it.
 *
 * ---------------------------------------------------------------------------
 * A BOARD THAT IS ABOUT TO EXIST IS NOT A BOARD OF ZERO HEIGHT
 * ---------------------------------------------------------------------------
 *
 * The lineup board renders instantly: the week's slots are already in hand by
 * the time the screen draws. A SETTLED board is a separate read — its lineup
 * belongs to a week the current slate has left, so it cannot come down with
 * everything else — and while that read is open there is nothing to draw.
 *
 * Drawing nothing collapses the board to nought and then springs it back to
 * eight rows, which on the compete carousel is the page bouncing every time you
 * swipe onto a finished contest. The rows below it move; the tab bar moves; the
 * scroll position stops meaning what it meant. It is the whole reason a swipe
 * between two live contests feels instant and a swipe onto a recap does not.
 *
 * So the board reserves its FINAL height from the first frame. The caller knows
 * the slot count — it is on the contest — so the reservation is exact rather
 * than a guess, and when the rows land nothing moves at all.
 *
 * SILENT, NOT SHIMMERING. A pulsing placeholder is an animation the eye tracks,
 * which is a worse thing to put in front of somebody for 150ms than a quiet
 * gap. The rule is drawn because the rule is the board's own structure and it
 * is what makes the space read as rows rather than as a hole.
 */
export function RowSkeleton() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.row}>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

/**
 * A ROW WITH NOTHING TO PRESS — the board's row, for a week that is over.
 *
 * Same height, same gutter, same badge column, same three lines, same inset
 * rule. The two press targets are what is missing and they are ALL that is
 * missing: a settled entry has no swap to offer and (today) no profile to
 * open, so a `Pressable` around it would be a control that does nothing.
 *
 * It exists rather than the settled lineup drawing its own `View` because the
 * geometry is the resemblance. Every constant in this file — the 62pt height,
 * the 40pt badge column, the 2pt line gaps, the inset the rule starts at — is
 * a number the two surfaces have to agree on, and two components reading two
 * copies of them agree only until somebody changes one.
 */
export function ReadOnlyRow({
  card,
  badge,
  right,
  progress,
}: {
  card: RowCard | null;
  badge: React.ReactNode;
  right: React.ReactNode;
  progress?: { text: string; tone?: 'positive' } | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.row}>
      <View style={styles.content}>
        <View style={styles.badgeCol}>{badge}</View>
        <View style={styles.body}>
          <Identity card={card} right={right} progress={progress} />
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

/**
 * The week on a SETTLED row: what the card GAINED, over what that gain paid.
 *
 * ---------------------------------------------------------------------------
 * IT IS `WeekFigure`'S BOX, WITH THE RESERVED SLOT SPENT
 * ---------------------------------------------------------------------------
 *
 *     board            settled
 *      9.8              +9.8
 *     PROJ  —           ◆ 14
 *
 * The board reserves its second line for a projection that does not exist yet.
 * A finished week has no projection to make and does have a payment to report,
 * so the reserved slot is spent rather than held — and the column keeps the
 * same shape, which is what stops the two boards reading as different objects.
 *
 * ---------------------------------------------------------------------------
 * THE `before` FIGURE MOVED OUT, AND THAT IS THE SECOND DRAFT
 * ---------------------------------------------------------------------------
 *
 * This briefly read `0.0  +9.8` — the card's pre-contest total, small and
 * quiet, beside the gain. Two numbers at two sizes on one line, over a slot
 * that is empty until the payout runs, and it looked exactly as unresolved as
 * that description sounds.
 *
 * The fix was not to restyle it. The `before` was in the wrong COLUMN: it is
 * half of a movement, and the movement belongs on the tier line, which is the
 * line about the card's standing and which now reads `0.0 → 9.8 TFP · 41 to
 * Silver`. That is what makes the progress legible as progress rather than as
 * a standing figure that happens to have changed — and it leaves this column
 * with one subject, the week, said in the two currencies a week is worth
 * anything in.
 *
 * ---------------------------------------------------------------------------
 * CENTRED IN THE ROW, EXACTLY AS `WeekFigure` IS
 * ---------------------------------------------------------------------------
 *
 * It was briefly top-aligned, squared against the name and the fixture on the
 * argument that the pair had two filled lines to line up with where the board
 * has a figure over a dash. Wrong, and the note at the head of this file had
 * already said why: the left column is a paragraph about a card and the right
 * is a pair of numbers about a Sunday. Aligned, the eye reads a correspondence
 * between rows that only half holds — the gems are not "about" the fixture —
 * and the whole column ends up hanging off the top of a three-line block.
 *
 * So it centres, and its box is the board's box to the point: 19 for the
 * figure, 2, 15 for the line under it. A reader swiping between the two boards
 * finds the column at the same height as well as at the same width.
 *
 * 14pt, not the board's 15. The figure carries a sign, so `+22.1` is a glyph
 * wider than `22.1` at the same size, and it sits over a second FILLED line
 * rather than over a dash — the column is heavier than the board's before any
 * of it is drawn, and one step down is what puts the two back in balance. The
 * line box stays 19, so the size change costs the row no height.
 *
 * THE GAIN IS SIGNED, NOT PREFIXED. Fantasy points went signed in
 * `20260828150000` — a fumbling running back can finish a week below nought —
 * so a hard-coded `+` would eventually render `+-2.4`. The sign is chosen from
 * the number, and a negative one takes the negative colour: it is the only
 * state on this row where the week made the card worse.
 *
 * AND A DASH WHERE NOTHING WAS PLAYED. A bye is not a nought scored, and the
 * board already draws that distinction in this exact box.
 */
export function SettledFigure({
  points,
  started,
  gems,
}: {
  points: number;
  /** His game kicked off. False on a bye, which cannot score and cannot pay. */
  started: boolean;
  /** Gems this card earned, or null before the payout has run. */
  gems: number | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const moved = started && points !== 0;

  return (
    <View style={[styles.right, { width: RIGHT_WIDTH }]}>
      <View style={styles.gainLine}>
        {started ? (
          <Text
            numberOfLines={1}
            style={[
              styles.gain,
              NUMERIC,
              { color: points < 0 ? c.negative : moved ? c.text : c.textTertiary },
            ]}>
            {`${points < 0 ? '\u2212' : '+'}${Math.abs(points).toFixed(1)}`}
          </Text>
        ) : (
          <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
            {DASH}
          </Text>
        )}
      </View>
      {/* THE SLOT IS RESERVED WHETHER OR NOT IT IS FILLED, exactly as `PROJ`
          is. An unpaid week draws nothing here rather than a nought — see
          `EntryLineup` — and if the line collapsed with it, the figure above
          would sit four points lower than the figure on every paid row beside
          it. An empty box is invisible; a column that jogs is not. */}
      <View style={styles.projLine}>
        {gems === null ? null : (
          <>
            <Gem size={8} color={gems > 0 ? gold : c.textTertiary} />
            <Text
              numberOfLines={1}
              style={[styles.projValue, NUMERIC, { color: gems > 0 ? c.text : c.textTertiary }]}>
              {gems.toLocaleString()}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * The week, on the right of a lineup row: what he scored, over what he was
 * projected for.
 *
 * The two are deliberately unequal. The score is the fact — heavier and four
 * points larger, so it is what the eye lands on scanning the column — and the
 * projection sits under it at reading weight, subordinate, which is the correct
 * relationship between a result and a guess even once we have real ones.
 */
export function WeekFigure({ points, status }: { points: string | null; status: GameStatus | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const live = status === 'live';

  return (
    <View style={[styles.right, { width: RIGHT_WIDTH }]}>
      {/* An em dash at figure weight is a black bar, not an absence — it reads
          as a redaction, which the directory row learned the same way. An
          unscored week drops to the projection's weight and colour, so the
          column reads as empty rather than as struck out.

          A LIVE figure takes the positive colour, because the number itself is
          the thing that changed and colouring the label instead would put the
          signal next to the fact rather than on it. */}
      {points !== null ? (
        <Text
          numberOfLines={1}
          style={[styles.figure, NUMERIC, { color: live ? c.positive : c.text }]}>
          {points}
        </Text>
      ) : (
        <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
          {DASH}
        </Text>
      )}
      {/* PROJ KEEPS ITS LINE, and the state does not take it.
 
          This slot briefly carried LIVE/FINAL instead, on the reasoning that a
          label printing a dash forever was dead space. It was the wrong trade
          twice over. The fixture line two lines left already says FINAL @ LAC
          and Q3 04:22 — so the state was being printed twice in one row — and
          projections are coming, which makes this a reserved slot rather than
          an empty one. Taking it would have meant giving it back later.
 
          What tells you a figure is live is the figure itself, in the positive
          colour, with the clock beside the fixture. That is one signal on the
          thing it is about, not two competing for the same row.
 
          A dash, and never a number we made up. See the head of this file. */}
      <View style={styles.projLine}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          PROJ
        </Text>
        <Text numberOfLines={1} style={[styles.projValue, NUMERIC, { color: c.textTertiary }]}>
          {DASH}
        </Text>
      </View>
    </View>
  );
}


/**
 * A player as the swap sheet lists him — the same three lines and the same
 * geometry as a board row, so a card looks identical in both places.
 *
 * One press target, because in a sheet the whole row IS the choice; the lineup
 * board's two-target split would be meaningless here.
 *
 * `lead` is the mark in front of the badge — `IN` for the incumbent, `OUT` for
 * the player being moved.
 */
export function PlayerBand({
  card,
  badge,
  right,
  emptyPrimary,
  emptySecondary,
  selected,
  dimmed,
  onPress,
  accessibilityLabel,
}: {
  card: LineupCard | null;
  badge: React.ReactNode;
  right: React.ReactNode;
  emptyPrimary?: string;
  emptySecondary?: string;
  selected?: boolean;
  /** Present but not choosable — a player whose game has already kicked off. */
  dimmed?: boolean;
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
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(dimmed) }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        styles.band,
        /* NO FILL OF ITS OWN. It used to paint `background`, and the current
           pick `backgroundSelected` — two colours, neither of which is the
           colour of the sheet they sit in (`surfaceSheet`), so the rows read as
           tiles dropped onto a panel rather than as the same rows the board is
           made of. Transparent, they inherit the sheet, and the only fill left
           is the one that means something: the press.

           WHICH ROW IS THE CURRENT ONE IS SAID BY POSITION AND BY ITS MARK, not
           by a tint. It sits at the top under its own heading with `IN` beside
           it; a highlight as well was the third way of saying it, and the one
           that cost the row its resemblance to the board. */
        pressed && { backgroundColor: c.backgroundElement },
        dimmed && styles.dimmed,
      ]}>
      {/* NO LEAD COLUMN. There was one, 30pt wide, holding an `IN` or an `OUT`
          — and it pushed the name in far enough that "Christian McCaffrey"
          rendered as "Christian McCaf…" in a sheet whose entire job is telling
          two players apart. The heading above each group already says which
          group it is, so the column was spending the name's width to repeat it. */}
      <View style={styles.badgeCol}>{badge}</View>
      <Identity
        card={card}
        right={right}
        emptyPrimary={emptyPrimary}
        emptySecondary={emptySecondary}
      />
    </Pressable>
  );
}

/** One sentence for a screen reader, which gets no columns to align. */
function describe(card: LineupCard, week: string | null): string {
  const where = card.game?.opponent ? matchupLabel(card.game) : 'on a bye this week';
  const scored = week === null ? 'not yet scored' : `${week} points this week`;
  const progress = tierProgressLabel(card);
  return [
    `${card.name}, ${card.position ?? 'unknown position'} ${card.team ?? 'no team'}`,
    where,
    scored,
    `${card.tier} card, ${oneDp(card.careerFp)} career points${progress ? `, ${progress}` : ', top tier'}`,
  ].join('. ');
}

const styles = StyleSheet.create({
  /* The rule is a child, so the row's own height is exactly the content box
     and the hairline sits inside it rather than adding half a point to it. */
  row: { height: LINEUP_ROW_HEIGHT, justifyContent: 'center' },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
  },
  /* The band in the swap sheet is the same content in the same box, so it
     borrows both — it just has no separate press targets inside it. */
  band: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
  },
  /* Centred against all three lines rather than pinned to the first: the badge
     is about the ROW, not about the name. */
  badgeCol: { width: BADGE_WIDTH, alignSelf: 'center' },
  badgeHit: { alignItems: 'center', justifyContent: 'center' },
  badgePressed: { opacity: 0.55 },
  /* Everything except the badge, as one target — and the row that squares the
     left column off against the right one. `flex-start` is what puts the
     week's points level with the name and the projection level with the
     fixture; centring them would float both against a three-line block. */
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  lines: { flex: 1, minWidth: 0, gap: 2 },
  /* `flexShrink` + `minWidth: 0`: the name shares a line with the position and
     the club, and without these a long one pushes them off the row instead of
     ellipsising. Ellipsis on a long name is by design; overflow is not. */
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 2, minWidth: 0 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  /* Explicit line heights on all three lines, and on the two opposite them:
     the columns square off because both sides agree about how tall a line is,
     not because anything measures the other. */
  /* `flexShrink: 0`. These are two- and three-character tokens beside a name
     that may be twenty; left to shrink with it they collapsed to `R…` and
     `— …`, which is the position and the club rendered as noise. The NAME is
     the only thing on the line allowed to give way. */
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 0 },
  fixtureLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, minWidth: 0 },
  /* The matchup is the only thing on its line allowed to give way; the code
     after it is one or two characters and truncating those loses the warning
     entirely. */
  fixture: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 1, minWidth: 0 },
  /* One step heavier while the game is on. The colour alone carries in light
     mode and is nearly invisible against a dark ground at 11pt. */
  fixtureLive: { fontWeight: '700' },
  /* `gap` is the SMALL one; the wider space before the progress phrase is set
     on that element, so `B 812.0 TFP` binds into one token and the distance to
     the next tier reads as the separate statement it is. */
  tierLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
    minWidth: 0,
    height: 15,
    /* Out from under the right column and across the full row. Nothing is
       drawn opposite this line, so nothing is overlapped — see RIGHT_WIDTH,
       which is one number because both surfaces use one column width. */
    marginRight: -(RIGHT_WIDTH + Spacing.two),
  },
  /* Centred against the whole row rather than pinned to its top. See the head
     of this file: the two figures are a pair, not two rows of a table. */
  right: { alignSelf: 'center', alignItems: 'flex-end', gap: 2 },
  /* 15, not 17. The week's points are the loudest thing in the row and should
     be, but at 17 they were competing with the NAME for that — and the name is
     what you are actually scanning for. One step above the figures around it
     is enough to lead; two makes it the headline. */
  figure: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3 },
  /* Same box, so the column does not shift when a week is swept — only the
     ink changes. */
  figureEmpty: { fontSize: 12, lineHeight: 19, fontWeight: '500' },
  projLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, height: 15 },
  /* `styles.figure`'s box at one size down, so the settled column is exactly as
     tall as the board's and centres to the same y. See `SettledFigure`. */
  gainLine: { flexDirection: 'row', alignItems: 'baseline', height: 19 },
  gain: { fontSize: 14, lineHeight: 19, fontWeight: '800', letterSpacing: -0.3 },
  projValue: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  figureLabel: { lineHeight: 15 },
  /* The only thing on the tier line that gives way, and it is last for a
     reason: the chip and the earned total are fixed-length, the phrase is not. */
  progress: { flexShrink: 1, minWidth: 0, marginLeft: Spacing.one },
  /* Never shrinks, and never wider than the word: it is the unit on the figure
     before it, not a column of its own. */
  unit: { flexShrink: 0, lineHeight: 15 },
  /* Same reason as `meta`: `IR` truncated to `I…` is worse than no room for
     two more characters of a name, and it is the one token on the line that
     can stop you starting the wrong player. */
  designation: { flexShrink: 0 },
  rule: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  /* Fixed, so IN / OUT / a slot code all start at the same x down the list. */
  /* Still legible, plainly not choosable. Greying each element separately would
     mean teaching every one of them a disabled colour; the row is one object
     and it recedes as one. */
  dimmed: { opacity: 0.45 },
});
