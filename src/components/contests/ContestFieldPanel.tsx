/**
 * The people in a contest: the leaderboard, and the way into any one of them.
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
 * named. It lives on the contest's page rather than on the card because it is a
 * list you read, not a shape you glance at.
 *
 * ---------------------------------------------------------------------------
 * A ROW IS A DOOR, NOT A DISCLOSURE
 * ---------------------------------------------------------------------------
 *
 * Tapping an entrant used to expand their slots INSIDE the row, which meant a
 * lineup — the densest object in the game, eight players deep with fixtures and
 * scores — was drawn as a squashed four-column strip so it would fit under a
 * 40pt row. It also meant only one could be open at a time, on a page where the
 * comparison you actually want is against a lineup two rows down.
 *
 * So a row navigates to `entry/[contest]/[user]`, which draws their team the
 * way a team is drawn everywhere else. The panel is a leaderboard and nothing
 * else.
 *
 * ---------------------------------------------------------------------------
 * AND IT NEVER SAYS "NOT YET"
 * ---------------------------------------------------------------------------
 *
 * Lineups used to open one at a time, as their last card kicked off, so for the
 * five days a contest spends being decided every row read "opens when their
 * last card kicks off". A page whose whole subject is who else is in this thing
 * answered "not yet" for exactly the stretch anybody was reading it.
 *
 * That rule is gone (`20260830010000`). What survives is `locked`, which no
 * longer gates anything and is drawn as what it is: whether the lineup you are
 * about to open can still change before kickoff.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '@/components/shell/AppHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { FieldEntrant } from './use-contest-field';

export function ContestFieldPanel({
  entrants,
  loading,
  error,
  slotCount,
  onOpen,
}: {
  entrants: FieldEntrant[] | null;
  loading: boolean;
  error: string | null;
  /** What a full lineup looks like here, so a row can say "2 of 3 cards". */
  slotCount: number;
  onOpen: (entrant: FieldEntrant) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (error) {
    return (
      <Panel title="The field">
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      </Panel>
    );
  }

  /* A heading with nothing under it rather than a spinner. The panel is one
     screen down on a sheet that has already drawn the card and the terms, so a
     loader here is a spinner nobody is looking at. */
  if (loading && entrants === null) return <Panel title="The field" />;

  return (
    <ContestFieldList entrants={entrants ?? []} slotCount={slotCount} onOpen={onOpen} />
  );
}

/**
 * The list, without the fetch.
 *
 * SPLIT SO THE KIT CAN HOLD ONE. The carousel's own header records what
 * happened the last time a contest component had no fixture behind it: a bug
 * that only existed on web, in a component only reachable behind the auth gate,
 * on a screen nobody swipes during development. A panel whose every state
 * requires a real contest, a real field and a real kickoff time to see is that
 * situation again.
 */
export function ContestFieldList({
  entrants: rows,
  slotCount,
  onOpen,
}: {
  entrants: FieldEntrant[];
  slotCount: number;
  /** Absent in the kit, where there is nowhere to navigate to. */
  onOpen?: (entrant: FieldEntrant) => void;
}) {
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
              entrant={e}
              slotCount={slotCount}
              onOpen={onOpen ? () => onOpen(e) : undefined}
            />
          ))}
        </View>
      )}
    </Panel>
  );
}

/**
 * WHAT A ROW CAN STILL TELL YOU, in order of what a reader wants: a prize is
 * the end of the story, an unfinished lineup is the most actionable thing about
 * a rival, and after that it is whether what you would be opening is settled or
 * still being edited.
 */
function subLine(e: FieldEntrant, slotCount: number): string {
  if (e.prize !== null && e.prize > 0) return `Won ${e.prize} coins`;
  if (e.filled < slotCount) return `${e.filled} of ${slotCount} cards`;
  return e.locked ? 'Locked in' : 'Still editing';
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
  entrant,
  slotCount,
  onOpen,
}: {
  entrant: FieldEntrant;
  slotCount: number;
  onOpen?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const played = entrant.points > 0;

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${entrant.displayName}'s lineup`}
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
          {subLine(entrant, slotCount)}
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
      {/* The affordance, and the only thing on the row that is not a fact. A
          list where every row leads somewhere still has to say so — a dense
          table of numbers reads as a table until something marks it as a set
          of doors. */}
      {onOpen ? <Chevron color={c.textTertiary} /> : null}
    </Pressable>
  );
}

/** Two borders on a rotated square, which is the app's chevron everywhere. */
function Chevron({ color }: { color: string }) {
  return <View style={[styles.chev, { borderColor: color }]} />;
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
  chev: {
    width: 7,
    height: 7,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    marginLeft: Spacing.half,
    flexShrink: 0,
  },
});
