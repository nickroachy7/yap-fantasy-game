/**
 * A lineup you cannot edit: eight names, what they scored, and nothing to press.
 *
 * ---------------------------------------------------------------------------
 * TWO CALLERS, AND THEY ARE THE SAME OBJECT SEEN FROM TWO SIDES
 * ---------------------------------------------------------------------------
 *
 *   entry/[contest]/[user]   somebody else's team, opened off a row of the field
 *   the Compete board        YOUR team, in a contest that has finished
 *
 * Both are a settled entry being read rather than built, so both get this. It
 * was written for the first and the second was about to grow a second copy of
 * it — which is the parallel-copy problem `sections.ts` warns about, and it
 * would have been the copy that drifted, because only one of the two is on a
 * screen anybody looks at every week.
 *
 * ---------------------------------------------------------------------------
 * IT IS `LineupRow` NOW, WHICH REVERSES THIS FILE'S FOUNDING DECISION
 * ---------------------------------------------------------------------------
 *
 * This used to draw its own row, and the note here explained why: `LineupRow`
 * took a `LineupCard` — career FP, the tier ladder, the fixture, the injury
 * designation, the eligible-slot count, a swap handler — and every one of those
 * fields existed to support a DECISION that a finished entry does not have.
 * `contest_lineup` returns none of them and should not: it is a definer
 * function over other people's rows, and its column list is the access control
 * (see `20260830010000`).
 *
 * That argument was about the INPUT and it was right about the input. It was
 * wrong to conclude anything about the OUTPUT. The two rows are the same object
 * — the same card, in the same slot, in the same eight — and a reader who files
 * a lineup on Saturday and reads it back on Tuesday is comparing them directly.
 * Drawn by two components they came apart exactly where you would expect: the
 * settled row had no fixture line at all, so it was two lines where the board
 * is three, and it carried the tier mark up beside the position where the board
 * carries it down on the line about the card.
 *
 * The fix was to narrow the INPUT rather than fork the output. `RowCard` is the
 * nine fields a row actually reads; `LineupCard` satisfies it structurally, so
 * the board is untouched, and `PeekSlot` maps onto it without inventing a form
 * or an instance id it has no business holding. `20260831050000` is the other
 * half — it sends the fixture, which is the one thing the row needed and this
 * function genuinely did not have.
 *
 * ---------------------------------------------------------------------------
 * THE THREE PLACES IT STILL DIFFERS, AND THEY ARE THE POINT
 * ---------------------------------------------------------------------------
 *
 *   board     Ty Simpson  QB — LAR                          9.8
 *             FINAL vs BUF                                 PROJ —
 *             B  58.3 TFP   142/200 to Silver Tier
 *
 *   settled   Ty Simpson  QB — LAR                          +9.8
 *             W 27–13 vs BUF                                 ◆ 14
 *             B  48.5 → 58.3 TFP   142 to Silver
 *
 * THE FIXTURE SAYS WHO WON. `FINAL` is the least informative word available on
 * a screen about a week that is over — every row says it, and the reader knows,
 * because they are reading a recap. `resultLabel` spends that token on the
 * answer instead.
 *
 * THE WEEK IS A GAIN RATHER THAN A TOTAL, over what that gain PAID — the slot
 * the board reserves for a projection it does not have. One subject, the week,
 * in the two currencies a week is worth anything in.
 *
 * THE TIER LINE CARRIES THE MOVEMENT. `9.8 TFP` is where the card stands and
 * says nothing about how it got there; `0.0 → 9.8 TFP` says this contest is
 * where all of it came from, which is the point of reading a recap at all. The
 * arrow is drawn only where the card actually moved — a bye scores nothing, and
 * `48.5 → 48.5` invites a reader to look for a difference that is not there.
 *
 * (An earlier draft put that `before` figure in the right-hand column instead,
 * beside the gain. It was the wrong column: half a movement, parked next to the
 * other half, in a box whose other slot is empty until the payout runs. Moving
 * it onto the line about the card's standing is what makes the progress read as
 * progress.)
 *
 * AND THE CLOSING PHRASE IS A DISTANCE, NOT A SPAN. The board prints
 * `142/200 to Silver Tier` because it is a standing position you check every
 * week; this prints `142 to Silver` because the span would put a `142` beside
 * the `142.4` two words to its left. Where the movement CROSSED a floor it
 * prints the promotion instead — the single most interesting thing that can
 * happen to a card in a week, which should not have to be inferred from a
 * distance shrinking to nothing.
 */
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import {
  BADGE_SIZE,
  BADGE_WIDTH,
  ReadOnlyRow,
  RowSkeleton,
  SettledFigure,
} from '@/components/lineup/LineupRow';
import { Spacing, type CardTier } from '@/constants/theme';

import type { PeekSlot } from './use-contest-field';

const titled = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/**
 * The tier line's closing phrase — what this contest did to the card's standing.
 *
 * `tone` is separated from the text because a promotion is the only part of
 * this the row draws in a different colour.
 */
function cardStory(s: PeekSlot): { text: string; tone?: 'positive' } | null {
  /* NO HISTORY, NO PHRASE. Null means the database has not been rewritten yet —
     see `PeekSlot.careerFp`. Drawing it anyway would measure a distance from a
     career of 0.0 for every card in the lineup, which is worse than the bare
     line this replaced: a wrong number reads as a fact, an absent one as a row. */
  if (s.careerFp === null || s.tierFloorFp === null) return null;
  const before = s.careerFp - s.points;

  /* Bronze's floor is zero and every total clears it, so a card can only be
     "promoted" into a tier that begins somewhere. And only by a week it
     actually played: a bye scores nothing and crosses nothing. */
  const moved = s.started && s.points > 0;
  if (s.tierFloorFp > 0 && moved && before < s.tierFloorFp) {
    return { text: `Reached ${titled(s.tier)}`, tone: 'positive' };
  }

  if (s.nextTierAt === null || !s.nextTierLabel) return { text: 'Top tier' };
  /* WHOLE POINTS, ROUNDED UP. A decimal belongs on a total that was actually
     scored; on a distance still to run it is false precision — and rounding UP
     is the only direction that cannot understate what the card still needs. */
  const togo = Math.ceil(Math.max(0, s.nextTierAt - s.careerFp));
  return { text: `${togo.toLocaleString()} to ${titled(s.nextTierLabel)}` };
}

export function EntryLineup({
  slots,
  title = 'Starting lineup',
  hint,
  bleed = true,
  loading = false,
  placeholder = 8,
  empty = 'Nothing filed',
  emptyBody,
}: {
  slots: PeekSlot[];
  title?: string;
  /** "Locked in", "Can still change before kickoff", "Preseason Week 4". */
  hint?: string;
  /**
   * RUN THE ROWS TO THE PAGE EDGES, cancelling the 16pt their container pads by.
   *
   * ---------------------------------------------------------------------------
   * IT IS ON BY DEFAULT BECAUSE THE BOARD BLEEDS AND THESE ARE THE BOARD'S ROWS
   * ---------------------------------------------------------------------------
   *
   * `LineupEditor` wraps both of its boards in `styles.bleed` — the same
   * `-Spacing.three` — so the rows you build a lineup from run to the screen
   * edge with only the row's own 16pt gutter inside them, exactly as the
   * directory and the collection do. This panel did not, so its rows sat 16
   * points further in on BOTH sides: the same row, 32 points narrower, one
   * swipe away from the board it is supposed to be identical to. On a phone
   * that is a tenth of the width, and it reads as the page shrinking as you
   * move between contests.
   *
   * THE HEADING DOES NOT BLEED, which is also the board's arrangement: its
   * `SectionHead` sits inside the padding and only the rows come out of it. A
   * title flush to the screen edge would be the one thing on the page with no
   * margin at all.
   *
   * Every real caller — the recap board, the archive sheet and the entry page —
   * sits in a container padded by exactly `Spacing.three`, so one number is
   * right for all three. The gallery pads by `Spacing.four` and opts out; a
   * bleed is a fact about the CONTAINER, which is why this is a prop and not
   * baked into the row.
   */
  bleed?: boolean;
  /**
   * The read is still open, so an empty `slots` means "not yet" and not "none".
   *
   * WITHOUT THIS THE BOARD COLLAPSES AND SPRINGS BACK. `contest_lineup` is a
   * separate read from everything else on the compete screen — a settled entry
   * belongs to a week the current slate has left — so there is always a moment
   * with nothing to draw, and drawing nothing takes the board to zero height
   * and then back to eight rows. On the carousel that is the page bouncing
   * every time you swipe onto a finished contest, which is exactly the
   * difference between that swipe and a swipe between two live ones.
   *
   * It is also what stops "Nothing filed" flashing over a lineup that is
   * simply still arriving.
   */
  loading?: boolean;
  /**
   * How many rows to reserve while `loading`. The contest's own slot count,
   * where the caller has it — an exact reservation means the real rows land
   * without moving anything, where a guess would still jog the page by the
   * difference. Eight is the full roster, and the wrong default to notice.
   */
  placeholder?: number;
  empty?: string;
  emptyBody?: string;
}) {
  return (
    <Panel title={title} hint={hint} inset={false}>
      {slots.length === 0 && loading ? (
        <View style={bleed ? styles.bleed : undefined}>
          {Array.from({ length: Math.max(1, placeholder) }, (_, i) => (
            <RowSkeleton key={`skeleton-${i}`} />
          ))}
        </View>
      ) : slots.length === 0 ? (
        <EmptyState pad={false} title={empty} body={emptyBody} />
      ) : (
        <View style={bleed ? styles.bleed : undefined}>
          {slots.map((s) => (
            <ReadOnlyRow
              key={s.slot}
              progress={cardStory(s)}
              badge={
                <PositionBadge
                  /* `RB`, not `RB1` — the ordinal is for the code, exactly as
                     the board's own badge decides it. */
                  label={slotBadgeLabel(s.slot)}
                  positions={positionsForSlot(s.slot)}
                  size={BADGE_SIZE}
                  width={BADGE_WIDTH}
                />
              }
              card={{
                name: s.playerName,
                position: s.pos,
                team: s.team,
                tier: s.tier as CardTier,
                careerFp: s.careerFp,
                nextTierAt: s.nextTierAt,
                nextTierLabel: s.nextTierLabel,
                /* `career_fp` counts this week too, so subtracting the week is
                   what the card walked in holding. The server does not send
                   that separately and should not: two totals that must differ
                   by exactly one number is two chances to disagree. */
                careerBefore: s.careerFp === null ? null : s.careerFp - s.points,
                /* NO INJURY DESIGNATION, and that is not an omission. `Q` is a
                   doubt about a game that has not been played; on a week that
                   is over there is nothing left to doubt, and the fixture line
                   now carries the answer the designation was hedging. */
                game: s.game,
              }}
              right={
                <SettledFigure
                  points={s.points}
                  started={s.started}
                  /* Both awards added. The position bonus lands on a handful of
                     slots a week, so a column of its own would be blank on
                     seven rows out of eight — and the question this figure
                     answers is "what did this card make". The breakdown lives
                     on the week recap, which is the screen for it.

                     NULL UNTIL THE PAYOUT HAS RUN, never zero: `awarded` is
                     false between settlement and `award_score_gems`, and false
                     on any install talking to a database without
                     `20260831040000`. A nought drawn in either case tells a
                     player who has just won that their week paid nothing, at
                     the moment they came to find out what it paid. */
                  gems={s.awarded ? (s.gems ?? 0) + (s.bonusGems ?? 0) : null}
                />
              }
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  /* `Screen`'s content padding, given back. The rows supply their own gutter —
     which is why `LineupRow`'s is 16 and not the directory's 14. */
  bleed: { marginHorizontal: -Spacing.three },
});
