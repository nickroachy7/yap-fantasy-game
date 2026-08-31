/**
 * "2 over the cap. Sell or commit 2 cards."
 *
 * THE ONE OVER-CAP NOTICE, drawn by the Collection grid and the lineup board.
 *
 * ---------------------------------------------------------------------------
 * A BAND, DELIBERATELY, ON A SCREEN THAT SPENT WEEKS DELETING BANDS
 * ---------------------------------------------------------------------------
 *
 * This inventory used to open with four stacked bands before a single card, and
 * most of the work here was collapsing them into one strip. So a full-width
 * notice under that strip needs a reason, and it has one: it is CONDITIONAL.
 * Under the cap this renders nothing at all — no height, no border, no reserved
 * space. It appears only when there is something to be done, which is the exact
 * rule `RosterBar`'s own note argues for and the exact rule the old always-on
 * roster band broke.
 *
 * Being over the cap is not a fact you glance at. It blocks the thing this
 * screen exists to feed: you cannot hold a thirty-first card, so packs stop
 * being worth opening until you act. That earns a sentence.
 *
 * ---------------------------------------------------------------------------
 * TWO SCREENS, ONE SENTENCE
 * ---------------------------------------------------------------------------
 *
 * The lineup board draws this too, and drew `RosterBar` before it — whose call
 * site says, correctly, that it should be "the same bar the Collection grid
 * uses, so the count and the remedy are worded once". That stopped being true
 * the moment this component existed and the Collection stopped using the bar,
 * which is how a rule about consistency quietly becomes two different notices
 * for one condition. Both screens draw THIS now.
 *
 * The two contexts are not the same and the sentence does not need to be
 * different for them. On the Collection the cap blocks what you can HOLD; on
 * the lineup it blocks what you can CHANGE. Either way the state is one number
 * over a limit and the remedy is the same two verbs, and a reader who has just
 * met this wall on one screen should meet the same words on the other rather
 * than wonder whether they are two problems.
 *
 * IT IS LAYOUT-NEUTRAL for that reason: no gutter of its own, just the bar and
 * the gap under it. Each screen places it in whatever container already carries
 * its margins — inside the grid's list header here, above the slots there.
 *
 * ---------------------------------------------------------------------------
 * IT NAMES BOTH EXITS AND RECOMMENDS NEITHER
 * ---------------------------------------------------------------------------
 *
 * "Sell 2 cards" would be the shorter sentence and it would be the app making an
 * economic decision on the player's behalf. Committing a card to a set frees the
 * same slot, keeps its value on the collection board and moves a set along;
 * selling pays double and destroys the card for good. Which of those someone
 * wants depends on what they are chasing, and it is genuinely their call.
 *
 * This is the third place that rule has had to be defended in this feature —
 * `RosterBar` states it, the over-cap dialog carried it, and it survives here.
 * Anything that later shortens this line to one verb is choosing for the player.
 *
 * WHAT DID GET CUT was the tail. It read "…to get back under", which is the
 * only thing selling or committing a card COULD do about being over a cap, so
 * it was a clause spent restating the first half of its own sentence — and at
 * `Type.strong` it pushed the notice onto two lines. The number, the state and
 * the two verbs are the whole message.
 *
 * ---------------------------------------------------------------------------
 * RED, NOT AMBER, AND LOUD ENOUGH TO BE READ AS RED
 * ---------------------------------------------------------------------------
 *
 * `RosterBar` used amber for "near the cap" and red for "over" — two volumes for
 * two states. There is no near state here: this draws only when you are over,
 * and over is a blocked screen rather than a warning about a future one. The
 * count in the row above stays one colour in every state precisely so this can
 * be the only loud thing on the screen when it appears.
 *
 * IT WAS TOO QUIET AT FIRST. The first version borrowed `BulkBar`'s error line
 * exactly — a hairline in `negative` around `backgroundElement`, body text in
 * `text` — on the reasoning that one app should draw "something is wrong" one
 * way. That reasoning was right about the vocabulary and wrong about the
 * volume: an error inside the bulk bar is already inside a surface the reader is
 * staring at, having just pressed something. This has to catch someone who is
 * scrolling a grid and not looking for it, so it carries the tint as well as the
 * edge, and the sentence is `Type.strong` rather than `Type.fine`.
 *
 * THE TINT IS DECLARED HERE BECAUSE THE PALETTE HAS NO DANGER SURFACE.
 * `theme.ts` ships `negative` as a foreground and stops; every other tinted
 * surface in the app comes off a TIER family, and there is no red tier. These
 * two values are that missing token in the one place that needs it — dark red
 * over black, pale red under it, both carrying `negative` text at a comfortable
 * contrast. If a `surfaceNegative` is ever added to the palette, this is the
 * first thing that should move onto it.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerState } from '@/context/PlayerContext';

/**
 * The danger surface `theme.ts` does not have. See the header.
 *
 * Dark is `negative` at roughly a tenth over the page's black — enough to read
 * as a red panel at arm's length without becoming a slab. Light is its
 * counterpart under white, tuned so `negative` (#C4283C) sits on it above 7:1.
 */
const SURFACE = { dark: '#2A1116', light: '#FDECEF' } as const;

export function RosterAlert({ roster }: { roster: PlayerState['roster'] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The whole component is the condition. See the header — nothing is reserved
     and nothing is drawn until the cap is actually broken. */
  if (!roster?.isOver) return null;

  const n = roster.overBy;
  const message = `${n} over the cap. Sell or commit ${n} ${n === 1 ? 'card' : 'cards'}.`;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Your roster is ${message}`}
      style={[styles.bar, { borderColor: c.negative, backgroundColor: SURFACE[scheme] }]}>
      <Text style={[Type.strong, { color: c.negative }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* `BulkBar`'s error line's radius and rhythm — same vocabulary — but a full
     point of border rather than a hairline, and the padding a step up. A
     hairline reads as a container's edge; 1pt reads as a mark on the page.

     NO horizontal margin: this is layout-neutral so both screens can place it.
     See the header. */
  bar: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
});
