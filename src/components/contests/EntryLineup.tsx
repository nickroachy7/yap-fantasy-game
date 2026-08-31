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
 * WHY IT IS NOT `LineupRow`
 * ---------------------------------------------------------------------------
 *
 * `LineupRow` takes a `LineupCard`: career FP, the tier ladder, the fixture,
 * the injury designation, the eligible-slot count, and a swap handler. That is
 * the row for CHOOSING, and every one of those fields exists to support a
 * decision. `contest_lineup` returns none of them and should not — it is a
 * definer function over other people's rows, and its column list is the access
 * control (see `20260830010000`). What a finished entry needs is who played,
 * where, and what it scored.
 *
 * THE SLOT BADGE AND THE TIER MARK ARE SHARED, because those two ARE the
 * lineup's vocabulary: a reader who knows what `FLEX2` and a gold `G` mean on
 * their own board must not have to relearn them on somebody else's.
 *
 * ---------------------------------------------------------------------------
 * THE THIRD LINE, AND WHY THE FIGURE ON THE RIGHT NEEDED ONE
 * ---------------------------------------------------------------------------
 *
 * A settled row used to end at the score. This is the only screen in the app
 * that reports a card's week without reporting the CARD, so 9.8 sat there as a
 * bare number with nothing to say that those same 9.8 points are the whole
 * reason it is closer to silver than it was on Saturday. The score is what
 * happened; the third line is what it was FOR.
 *
 * IT IS A BEFORE AND AN AFTER, not a repeat of the figure. `career_fp` counts
 * every week the card has started, this one included, so `careerFp - points` is
 * what it walked in holding — and printing both ends of that subtraction says
 * "this went up, by the amount on the right" without setting the same number
 * down twice on one row.
 *
 * THE TAIL IS THE DISTANCE STILL TO RUN, where the lineup board's own third
 * line prints the span (`58/200 to Silver Tier`). Deliberately different, and
 * it is the one place this row departs from the board's wording: the board is
 * a standing position, this is a movement, and `142 to Silver` is what a
 * number that just moved is measured against. Printing the span here would put
 * `58` beside the `58.3` two words to its left.
 *
 * A PROMOTION REPLACES THE TAIL RATHER THAN JOINING IT. `tierFloorFp` is where
 * the card's CURRENT tier begins, so a pre-contest total below it means this
 * contest is what carried it over — the single most interesting thing that can
 * happen to a card in a week, and it should not have to be inferred from a
 * distance shrinking to nothing.
 */
import { StyleSheet, Text, View } from 'react-native';

import { TierMark } from '@/components/cards/TierMark';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Spacing, Type, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { PeekSlot } from './use-contest-field';

/** One decimal, and a thousands separator once a career gets long. */
const fp = (n: number) => n.toLocaleString(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const titled = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/**
 * What this contest did to the card, in one line.
 *
 * `promoted` is separated from the prose because it is the only part of this
 * the row draws in a different colour — see the note at the top of the file.
 */
function cardStory(s: PeekSlot): { line: string; promoted: boolean } | null {
  /* NO HISTORY, NO LINE. Null means the database has not been rewritten yet —
     see `PeekSlot.careerFp`. Drawing the line anyway would print a career of
     0.0 for every card in the lineup, which is worse than the bare row this
     replaced: a wrong number reads as a fact, an absent one as a row. */
  if (s.careerFp === null || s.tierFloorFp === null) return null;
  const before = s.careerFp - s.points;
  /* THE ARROW ONLY WHEN SOMETHING MOVED. A bye scores nothing and a nought
     scores nothing, and `48.5 → 48.5` is a movement drawn for a card that did
     not move — worse than no arrow, because it invites the reader to look for
     a difference that is not there. */
  const moved = s.started && s.points > 0;
  const total = moved ? `${fp(before)} → ${fp(s.careerFp)}` : fp(s.careerFp);

  /* Bronze's floor is zero and every total clears it, so a card can only be
     "promoted" into a tier that begins somewhere. */
  const promoted = s.tierFloorFp > 0 && moved && before < s.tierFloorFp;
  if (promoted) return { line: `${total} career · Reached ${titled(s.tier)}`, promoted: true };

  const tail =
    s.nextTierAt === null || !s.nextTierLabel
      ? 'Top tier'
      /* WHOLE POINTS, ROUNDED UP. A decimal belongs on a total that was
         actually scored; on a distance still to run it is false precision —
         and rounding UP is the only direction that cannot understate what the
         card still needs. `141.7 to go` becomes `142 to Silver`. */
      : `${Math.ceil(Math.max(0, s.nextTierAt - s.careerFp)).toLocaleString()} to ${titled(s.nextTierLabel)}`;
  return { line: `${total} career · ${tail}`, promoted: false };
}

export function EntryLineup({
  slots,
  title = 'Starting lineup',
  hint,
  empty = 'Nothing filed',
  emptyBody,
}: {
  slots: PeekSlot[];
  title?: string;
  /** "Locked in", "Can still change before kickoff", "Preseason Week 4". */
  hint?: string;
  empty?: string;
  emptyBody?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Panel title={title} hint={hint} inset={false}>
      {slots.length === 0 ? (
        <EmptyState pad={false} title={empty} body={emptyBody} />
      ) : (
        <View>
          {slots.map((s) => (
            <View key={s.slot} style={[styles.row, { borderColor: c.border }]}>
              <PositionBadge
                label={slotBadgeLabel(s.slot)}
                positions={positionsForSlot(s.slot)}
                size={26}
                width={34}
              />
              <View style={styles.who}>
                <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
                  {s.playerName}
                </Text>
                <View style={styles.meta}>
                  <TierMark tier={s.tier as CardTier} />
                  <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                    {[s.pos, s.team].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {/* The card's own line. Drawn for a card that did not start
                    too — a bye is still a card with a history, and dropping
                    the line on those rows would make the column ragged for a
                    reason that has nothing to do with the card. */}
                {(() => {
                  const story = cardStory(s);
                  if (!story) return null;
                  return (
                    <Text
                      numberOfLines={1}
                      style={[
                        Type.fine,
                        { color: story.promoted ? c.positive : c.textTertiary },
                      ]}>
                      {story.line}
                    </Text>
                  );
                })()}
              </View>
              {/* A card on a bye never started and never will. Drawn at the
                  quiet weight rather than as a nought, the same way an unplayed
                  figure is drawn everywhere in the app. */}
              <Text
                style={[
                  Type.figure,
                  NUMERIC,
                  styles.points,
                  { color: s.started ? c.text : c.textTertiary },
                ]}>
                {s.started ? s.points.toFixed(1) : '—'}
              </Text>
              {s.started ? null : <StatusChip label="NOT STARTED" tone="neutral" />}
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  /* The lineup board's own geometry: badge, two lines of identity, one figure.
     Rows sit on the page with a hairline between them rather than inside a
     surface — the same treatment `LineupRow` gets, so a settled entry reads as
     the same object as the one you are still building. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  points: { minWidth: 46, textAlign: 'right' },
});
