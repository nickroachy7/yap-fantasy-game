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
 * A ROW OPENS IN PLACE, AND THAT REVERSES A CALL — HALF OF ONE
 * ---------------------------------------------------------------------------
 *
 * Tapping an entrant expanded their slots inside the row once before, and it
 * was rightly taken out: a lineup is the densest object in the game, eight
 * players deep with fixtures and scores, and it was being drawn as a squashed
 * four-column strip so that it would fit under a 40pt row. So rows became doors
 * to `entry/[contest]/[user]`, which drew a team the way a team is drawn
 * everywhere else.
 *
 * The objection was to the DRAWING, not to the disclosure. What comes out of a
 * row now is `EntryLineup` — the identical component, at the identical width,
 * with the identical rows as the lineup of your own sitting at the top of this
 * same page. Nothing is squashed and nothing is a footnote, so the reason the
 * expansion was removed no longer applies to it.
 *
 * And the door had a cost the page could not pay. Comparing yourself with a
 * rival meant leaving the page your own lineup is on to go and look at theirs,
 * then coming back — two navigations to hold eight cards against eight cards,
 * across a transition, from memory. Opened in place they are on one scroll.
 *
 * ONE AT A TIME, and this is the half of the old call that stands. The second
 * complaint about the strip was that only one could be open; the answer is not
 * to open several. A field of twenty-four with four expanded is two hundred
 * rows of page, and the comparison a reader actually wants is against their own
 * entry, which is pinned above the field rather than buried in it.
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
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamLogo } from '@/components/shell/TeamLogo';
import { EntryLineup } from './EntryLineup';
import { useContestLineup } from './use-contest-field';
import { EmptyState } from '@/components/ui/EmptyState';
import { RowSkeleton } from '@/components/lineup/LineupRow';
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
  title = 'The field',
  expect,
  contestId,
  onOpenManager,
}: {
  entrants: FieldEntrant[] | null;
  loading: boolean;
  error: string | null;
  /** What a full lineup looks like here, so a row can say "2 of 3 cards". */
  slotCount: number;
  /**
   * The panel's heading, or "" where something above it is already the heading.
   *
   * A TAB BAR IS A HEADING. On the contest's page this panel sits directly
   * under a tab reading `Rankings`, and a 15pt "The field" beneath it is the
   * screen naming one thing twice in fourteen points. Standing alone — in the
   * kit, or anywhere it is one panel among several — it names itself.
   */
  title?: string;
  /** Entrants the caller already knows about, for the loading skeleton. */
  expect?: number;
  /**
   * Which contest these lineups belong to. Null makes the rows inert.
   *
   * A ROW IS ONLY A DOOR WHERE THERE IS SOMETHING BEHIND IT. `contest_lineup`
   * is keyed on the contest and the manager, so without an id there is nothing
   * to fetch — which is exactly the kit's situation, and why the affordance is
   * derived from this rather than from a separate flag that could disagree with
   * it.
   */
  contestId: string | null;
  /**
   * Open the manager behind a row, as a person rather than as a lineup.
   *
   * THE ROW KEEPS ITS OWN PRESS. Tapping a row opens that manager's LINEUP in
   * place, which is what a reader of a contest wants nine times out of ten; the
   * tenth is "who is this", and that is the NAME. Two targets on one row, and
   * they are siblings rather than one inside the other — a `Pressable` in a
   * `Pressable` is a `<button>` in a `<button>` on web, which React rejects.
   * The name's role is `link`, the one interactive role react-native-web does
   * not render as a button element. See `ManagerRow`, which is the same shape.
   *
   * Absent in the kit, and absent means the name is plain text.
   */
  onOpenManager?: (userId: string, name: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (error) {
    return (
      <Panel title={title}>
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      </Panel>
    );
  }

  /* A heading with nothing under it rather than a spinner. The panel is one
     screen down on a sheet that has already drawn the card and the terms, so a
     loader here is a spinner nobody is looking at. */
  /* SKELETON ROWS, NOT AN EMPTY PANEL.
     The old comment here argued a spinner was pointless because the field sits
     a screen down, and that was true when the field was behind a tab. On one
     page it is the section directly under the lineup, and an empty panel is
     the same re-layout the slots had: the page draws short, the entrants
     arrive, and everything below them jumps.
     `expect` is what the caller already knows about the field — the entrant
     count off the contest row — so the panel holds the height it is about to
     need. Two rows minimum, because a contest with nobody in it still has to
     look like a list that is loading rather than a panel that is broken. */
  if (loading && entrants === null) {
    return (
      <Panel title={title}>
        {Array.from({ length: Math.max(2, Math.min(expect ?? 0, 8)) }, (_, i) => (
          <RowSkeleton key={`field-skeleton-${i}`} />
        ))}
      </Panel>
    );
  }

  return (
    <ContestFieldList
      entrants={entrants ?? []}
      slotCount={slotCount}
      title={title}
      contestId={contestId}
      onOpenManager={onOpenManager}
    />
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
  title = 'The field',
  contestId = null,
  onOpenManager,
}: {
  entrants: FieldEntrant[];
  slotCount: number;
  /** "" where whatever sits above is already the heading. */
  title?: string;
  /** Absent in the kit, where there is no lineup to fetch. */
  contestId?: string | null;
  /** Absent in the kit, and absent means the name is plain text. */
  onOpenManager?: (userId: string, name: string) => void;
}) {
  /* WHOSE TEAM IS OPEN, by user id and one at a time — see the header. State
     rather than a prop because it is a way of reading this list, not a fact
     about the contest: nothing outside the panel has an opinion about which
     row is expanded, and nothing outside it should be re-rendered when that
     changes. */
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      title={title}
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
            <View key={e.userId}>
              <EntrantRow
                entrant={e}
                slotCount={slotCount}
                expanded={open === e.userId}
                onOpen={
                  contestId
                    ? () => setOpen((was) => (was === e.userId ? null : e.userId))
                    : undefined
                }
                onOpenManager={
                  onOpenManager ? () => onOpenManager(e.userId, e.displayName) : undefined
                }
              />
              {open === e.userId && contestId ? (
                <EntrantLineup
                  contestId={contestId}
                  userId={e.userId}
                  slotCount={slotCount}
                  locked={e.locked}
                />
              ) : null}
            </View>
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
  expanded,
  onOpen,
  onOpenManager,
}: {
  entrant: FieldEntrant;
  slotCount: number;
  /** Their lineup is drawn under this row right now. */
  expanded: boolean;
  onOpen?: () => void;
  /** The name becomes a link to their account — see the panel's prop. */
  onOpenManager?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const played = entrant.points > 0;

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityLabel={
        expanded ? `Hide ${entrant.displayName}'s lineup` : `Open ${entrant.displayName}'s lineup`
      }
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.border },
        entrant.isMe && { backgroundColor: c.backgroundMine },
        /* THE OPEN ROW IS LIT, and it is the only thing marking where a block
           of eight rows came from. `backgroundSelected` outranks the tint on
           your own row deliberately: "which one did I open" is a question about
           right now, and "which one is me" is answered again by every other
           row not being lit. */
        expanded && { backgroundColor: c.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.fine, NUMERIC, styles.rank, { color: c.textTertiary }]}>
        {entrant.rank}
      </Text>
      <TeamLogo userId={entrant.userId} name={entrant.displayName} size={22} />
      <View style={styles.who}>
        {onOpenManager ? (
          /* `link`, not `button`: this sits inside the row's own pressable, and
             `link` is the one interactive role react-native-web does not render
             as a real <button> element. A button in a button is the nesting
             React rejects — see the panel's `onOpenManager`. */
          <Pressable
            onPress={onOpenManager}
            accessibilityRole="link"
            accessibilityLabel={entrant.displayName}
            accessibilityHint="Opens this manager's profile"
            hitSlop={6}
            style={({ pressed }) => [styles.nameLink, pressed && styles.namePressed]}>
            <Text numberOfLines={1} style={[Type.body, { color: c.text }]}>
              {entrant.displayName}
            </Text>
          </Pressable>
        ) : (
          <Text numberOfLines={1} style={[Type.body, { color: c.text }]}>
            {entrant.displayName}
          </Text>
        )}
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
          list where every row opens still has to say so — a dense table of
          numbers reads as a table until something marks it as a set of doors.
          Turned down when it is open, which is the one mark that says the block
          below belongs to this row and can be put away again. */}
      {onOpen ? <Chevron color={c.textTertiary} down={expanded} /> : null}
    </Pressable>
  );
}

/** Two borders on a rotated square, which is the app's chevron everywhere. */
function Chevron({ color, down = false }: { color: string; down?: boolean }) {
  return <View style={[styles.chev, down && styles.chevDown, { borderColor: color }]} />;
}

/**
 * One rival's team, opened out of their row.
 *
 * A COMPONENT SO THAT MOUNTING IS THE FETCH. `useContestLineup` idles on a null
 * contest and keys its result to the request that asked for it, so collapsing a
 * row genuinely stops the read and opening another cannot draw the first one's
 * cards under the second one's name — the mismatch that hook's own header is
 * written about.
 *
 * NO HEADING. `EntryLineup` titles itself "Starting lineup" wherever it stands
 * alone; here the row directly above it is the heading, and a second one would
 * be the panel naming the same thing twice in fourteen points. The hint keeps
 * the one fact the row does not carry — whether these cards can still change.
 */
function EntrantLineup({
  contestId,
  userId,
  slotCount,
  locked,
}: {
  contestId: string;
  userId: string;
  slotCount: number;
  locked: boolean;
}) {
  const { slots, loading } = useContestLineup(contestId, userId);
  return (
    <EntryLineup
      title=""
      slots={slots ?? []}
      loading={loading && slots === null}
      placeholder={slotCount}
      hint={locked ? 'Locked in' : 'Can still change before kickoff'}
      empty="Nothing filed"
      emptyBody="This entry has no cards in it yet."
    />
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
  nameLink: { alignSelf: 'flex-start', maxWidth: '100%' },
  namePressed: { opacity: 0.6 },
  pressed: { opacity: 0.6 },
  /* Fixed width so the avatars line up whatever the field's size — a rank
     column that grows from 1 to 26 would shunt every name half a character
     right as the base grew. */
  rank: { width: 18, textAlign: 'right' },
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
  /* A quarter turn on from the ›, so the same two borders point down. The mark
     is drawn from its own corner rather than its centre, so it also needs a
     point of lift to sit on the row's centre line once turned. */
  chevDown: { transform: [{ rotate: '135deg' }], marginTop: -3 },
});
