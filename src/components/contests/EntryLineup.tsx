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
