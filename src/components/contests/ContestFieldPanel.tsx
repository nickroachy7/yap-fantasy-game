/**
 * The people in a contest, and their lineups once those have locked.
 *
 * ---------------------------------------------------------------------------
 * WHY A CONTEST NEEDS A FIELD DRAWN AS PEOPLE
 * ---------------------------------------------------------------------------
 *
 * The card over your lineup deliberately draws the community as a DISTRIBUTION
 * and not as an opponent — there are no pairings in this game and a face
 * opposite yours would be inventing one. That is right for the card, which
 * answers "am I winning" in one glance.
 *
 * It is not the whole of what a contest is. A distribution has nobody in it,
 * and a game whose entire premise is "you are somewhere in a base of managers"
 * had never once shown the base. This panel is the other half: the same field,
 * named. It lives here rather than on the card because it is a list you read,
 * not a shape you glance at, and because this is the page you come back to
 * after the games rather than the one you file from.
 *
 * ---------------------------------------------------------------------------
 * THE REVEAL RULE, AND WHY IT IS PER LINEUP
 * ---------------------------------------------------------------------------
 *
 * Players lock ONE AT A TIME, so a week drains over four days rather than
 * shutting at once. Open everybody's lineup immediately and the last person to
 * file reads the whole field's shape before choosing, which is a real edge and
 * a growing one as the base grows. Open them never and the best hour of the
 * week — everybody scoring at once, nothing left to change — is a column of
 * numbers with nothing behind it.
 *
 * So a lineup opens when every card in it has kicked off, decided by the server
 * (`contest_field.open`, 20260826030000) and never guessed at here. A row that
 * is not open yet says so in its own words rather than simply not responding to
 * a tap: a dead press is indistinguishable from a bug.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '@/components/shell/AppHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import {
  useContestField,
  useContestLineup,
  type FieldEntrant,
} from './use-contest-field';

export function ContestFieldPanel({ contestId }: { contestId: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { entrants, loading, error } = useContestField(contestId);

  if (error) {
    return (
      <Panel title="The field">
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      </Panel>
    );
  }

  if (loading && entrants === null) return <Panel title="The field" />;

  return <ContestFieldList entrants={entrants ?? []} contestId={contestId} />;
}

/**
 * The list, without the fetch.
 *
 * SPLIT SO THE KIT CAN HOLD ONE. The carousel's own header records what
 * happened the last time a contest component had no fixture behind it: a bug
 * that only existed on web, in a component only reachable behind the auth gate,
 * on a screen nobody swipes during development. A panel whose every state
 * requires a real contest, a real field and a real kickoff time to see is that
 * situation again — the reveal rule in particular has four states and three of
 * them are hard to arrange on purpose.
 */
export function ContestFieldList({
  entrants: rows,
  contestId,
}: {
  entrants: FieldEntrant[];
  /** Null in the kit, where a row's peek is a fixture rather than a fetch. */
  contestId: string | null;
}) {
  /* One open at a time. Two lineups expanded in a sheet this tall means
     scrolling past one to read the other, and the comparison people actually
     make is against their OWN lineup, which is a tab away and always visible. */
  const [openUser, setOpenUser] = useState<string | null>(null);

  return (
    <Panel
      title="The field"
      /* The count belongs to the heading rather than to a row: it is a fact
         about the contest, and repeating it per row is how a list starts
         restating its own length. */
      hint={rows.length === 1 ? '1 entered' : `${rows.length} entered`}
      inset={false}>
      {rows.length === 0 ? (
        <EmptyState
          pad={false}
          title="Nobody has filed yet"
          body="Entries appear here as they come in. Being first is worth something in a contest that pays by place."
        />
      ) : (
        <View>
          {rows.map((e) => (
            <EntrantRow
              key={e.userId}
              contestId={contestId}
              entrant={e}
              expanded={openUser === e.userId}
              onToggle={() => setOpenUser(openUser === e.userId ? null : e.userId)}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

/**
 * One entrant.
 *
 * THE RANK IS THE LEADING COLUMN because this list is sorted by it and a table
 * whose order has no visible cause reads as arbitrary. It is the server's own
 * `rank()`, ties included — two players on the same score share a place, which
 * is why the same number can appear twice and why nothing here renumbers them.
 *
 * YOUR OWN ROW IS TINTED, not badged. "You" as a chip would compete with the
 * result chip that shares that corner, and the tint is the same one every list
 * in the app uses to say the reader is in it.
 */
function EntrantRow({
  contestId,
  entrant,
  expanded,
  onToggle,
}: {
  contestId: string | null;
  entrant: FieldEntrant;
  expanded: boolean;
  onToggle: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const played = entrant.points > 0;

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={
          entrant.open
            ? `${expanded ? 'Hide' : 'Show'} ${entrant.displayName}'s lineup`
            : `${entrant.displayName}'s lineup is not open yet`
        }
        style={({ pressed }) => [
          styles.row,
          { borderColor: c.border },
          entrant.isMe && { backgroundColor: c.backgroundMine },
          pressed && styles.pressed,
        ]}>
        <Text style={[Type.fine, NUMERIC, styles.rank, { color: c.textTertiary }]}>
          {entrant.rank}
        </Text>
        <View style={[styles.avatar, { borderColor: c.border }]}>
          <Text style={[Type.micro, { color: c.textSecondary }]}>
            {initialsOf(entrant.displayName)}
          </Text>
        </View>
        <View style={styles.who}>
          <Text numberOfLines={1} style={[Type.body, { color: c.text }]}>
            {entrant.displayName}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
            {/* WHAT THIS ROW CAN STILL TELL YOU, in order of what a reader
                wants. A prize is the end of the story; a lineup you may open is
                an invitation; anything else is the state it is waiting in. */}
            {entrant.prize !== null && entrant.prize > 0
              ? `Won ${entrant.prize} gems`
              : entrant.open
                ? expanded
                  ? 'Hide lineup'
                  : 'See lineup'
                : 'Lineup opens when their last card kicks off'}
          </Text>
        </View>
        <Text style={[Type.strong, NUMERIC, { color: played ? c.text : c.textTertiary }]}>
          {played ? entrant.points.toFixed(1) : '—'}
        </Text>
        {entrant.result === null ? null : (
          <StatusChip
            label={entrant.result}
            tone={
              entrant.result === 'W' ? 'positive' : entrant.result === 'L' ? 'negative' : 'neutral'
            }
          />
        )}
      </Pressable>

      {expanded && contestId ? <Peek contestId={contestId} entrant={entrant} /> : null}
    </View>
  );
}

/**
 * Their lineup, or the reason you cannot see it.
 *
 * THE SERVER'S REFUSAL IS SHOWN AS WRITTEN. `contest_lineup` raises rather than
 * returning an empty set precisely so that "they have not filed" and "you may
 * not look yet" stay different sentences — swallowing that here and drawing a
 * blank would put the distinction back in the bin it was taken out of.
 */
function Peek({ contestId, entrant }: { contestId: string; entrant: FieldEntrant }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { slots, loading, error } = useContestLineup(contestId, entrant.userId);

  if (loading && slots === null) return null;

  if (error) {
    return (
      <View style={[styles.peek, { backgroundColor: c.backgroundElement }]}>
        <Text style={[Type.fine, { color: c.textSecondary }]}>{error}</Text>
      </View>
    );
  }

  const rows = slots ?? [];
  if (rows.length === 0) {
    return (
      <View style={[styles.peek, { backgroundColor: c.backgroundElement }]}>
        <Text style={[Type.fine, { color: c.textSecondary }]}>
          Nothing filed in this lineup.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.peek, { backgroundColor: c.backgroundElement }]}>
      {rows.map((s) => (
        <View key={s.slot} style={styles.peekRow}>
          <Text style={[Type.micro, styles.peekSlot, { color: c.textTertiary }]}>
            {s.slot.toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, styles.peekName, { color: c.text }]}>
            {s.playerName}
          </Text>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            {[s.pos, s.team].filter(Boolean).join(' · ')}
          </Text>
          <Text
            style={[
              Type.fine,
              NUMERIC,
              styles.peekPoints,
              /* A card on a bye never started and never will. Drawn at the
                 quiet weight rather than as a nought, the same way an unplayed
                 figure is drawn everywhere else in the app. */
              { color: s.started ? c.text : c.textTertiary },
            ]}>
            {s.started ? s.points.toFixed(1) : '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  /* Fixed width so the avatars line up whatever the field's size — a rank
     column that grows from 1 to 26 would shunt every name half a character
     right as the base grew. */
  rank: { width: 18, textAlign: 'right' },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /* Takes the spare width, so a long handle truncates rather than pushing the
     score and the chip off the right edge. */
  who: { flex: 1, minWidth: 0, gap: 1 },
  /* Inset and tinted: it belongs to the row above it rather than being the next
     row down. */
  peek: {
    gap: Spacing.one,
    padding: Spacing.two,
    marginBottom: Spacing.one,
    borderRadius: Radius.control,
  },
  peekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  peekSlot: { width: 32 },
  peekName: { flex: 1, minWidth: 0 },
  peekPoints: { width: 40, textAlign: 'right' },
});
