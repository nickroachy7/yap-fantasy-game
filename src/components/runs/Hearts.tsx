/**
 * The hearts a run is holding, what each one is riding on, and what it lost.
 *
 * ---------------------------------------------------------------------------
 * THREE STATES, AND THEY ARE THREE DIFFERENT OBJECTS
 * ---------------------------------------------------------------------------
 *
 *   FREE      a whole heart              yours, spendable, nothing can take it
 *   WAGERED   a heart with a blade in it staked on a contest not yet settled
 *   KILLED    a heart torn in two        this run held it and lost it
 *
 * THE OLD SET WAS ONE SHAPE AT THREE INTENSITIES — solid, outlined, outlined-
 * and-cracked — and it failed twice over.
 *
 * First, it inverted the only convention every player already knows. Filled
 * means you have it; hollow means you lost it. Drawing a WAGERED heart as an
 * outline meant a player holding three hearts with two staked read the rack as
 * "I have one left and I have lost two" — the most important number on the
 * screen, reported backwards.
 *
 * Second, a hollow heart with a crack through it IS the broken-heart symbol.
 * Using a fainter version of it for "at risk" made the two states that must
 * never be confused into the same picture at different opacities.
 *
 * So all three are now drawn as what they are. A heart you hold is SOLID
 * whether or not it is staked — because it is equally yours either way — and
 * what marks the stake is a thing done TO it rather than a subtraction from it.
 *
 * ---------------------------------------------------------------------------
 * WHY A BLADE AND NOT A CRACK
 * ---------------------------------------------------------------------------
 *
 * A crack was tried and is the trap described above: a fault line down a heart
 * is the universally understood picture of a heart that has ALREADY broken, so
 * it cannot also mean "this one might". The blade is a foreign object rather
 * than damage, which is exactly the distinction — nothing has happened to this
 * heart yet, something is merely poised to.
 *
 * IT PIERCES THROUGH THE CENTRE, hilt clear on one side and tip clear on the
 * other. A blade buried in the upper corner reads as a knife resting near a
 * heart; one that interrupts the silhouette at BOTH ends reads as a knife
 * through it, and that is what survives being 28pt tall. The composition is a
 * single rotation about the heart's own centre (see `BLADE_ROTATION`), so the
 * axis is guaranteed to pass through the middle no matter what angle is set.
 *
 * The hilt lives in dead space. This heart is widest through its middle and its
 * top corners are empty, so the handle costs no bounding box on the way out —
 * which is what keeps the rail one row tall.
 *
 * ---------------------------------------------------------------------------
 * THE HEART IS FACETED, AND THAT IS LOAD-BEARING
 * ---------------------------------------------------------------------------
 *
 * It was a valentine — round lobes, deep soft notch — which was the only soft
 * shape in an app whose icon language is a rotated square (`Coin`), concentric
 * rings and corner ticks (`TierMotif`). Cut into facets it belongs to that
 * family, and two practical things follow:
 *
 *   A tear runs along a facet, so a KILLED heart reads as something that BROKE
 *   rather than something that got scratched. On a smooth curve the same line
 *   is a scuff.
 *
 *   Straight edges hold at 12pt. The old lobes fought the rasteriser at their
 *   tangents and went mushy in the sidebar.
 *
 * Drawn as a path rather than an icon font for the reason `Coin` gives: crisp
 * everywhere, and no dependency to ship a thousand glyphs to draw one.
 */

import {
  heartBroken,
  heartFull,
  heartLoss,
  heartTie,
  heartWin,
} from '@/components/icons/glyphs';
import { GRID, type Glyph } from '@/components/icons/system';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { Colors, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * ---------------------------------------------------------------------------
 * THE GEOMETRY THAT USED TO LIVE HERE
 * ---------------------------------------------------------------------------
 *
 * A faceted `HEART` path, a `BLADE`, a rotation constant, two tear-clip regions
 * and a `bladeOf` steel ramp — hand-built geometry, all deleted when the drawn
 * artwork landed. Everything it rendered is now one imported glyph per state;
 * see `Art` below.
 *
 * The arguments those constants carried are NOT deleted, because they are about
 * meaning rather than coordinates and they still bind:
 *
 *   FILLED MEANS YOU HOLD IT. An earlier rack drew "at risk" as an outline, so
 *   a heart you definitely held looked hollow and the most important number on
 *   the screen read backwards. A staked heart is still solid.
 *
 *   THE BLADE WAS A FOREIGN OBJECT, NOT DAMAGE — and it is gone anyway, for a
 *   reason that has nothing to do with that distinction being wrong. It held:
 *   a crack through a heart is the universal picture of one that has ALREADY
 *   broken, so it could not also mean "this one might". What it did not survive
 *   is a ROW of them. See `HeartState`.
 *
 *   THE TORN HEART IS GREY, NOT FADED RED. A faint red pip in a row of solid
 *   ones reads as a warning about the hearts you still have.
 *
 * The one thing the swap genuinely retired is the SVG `<Text>` letter and the
 * baseline fight it documented — iOS and web disagreed about
 * `alignmentBaseline`, and the W ended up through the heart's point. A letter
 * punched into a path cannot drift.
 */

/**
 * The viewBox, and the multiplier that turns a caller's `size` into a rendered
 * box.
 *
 * THESE WERE SIZED FOR GEOMETRY THAT NO LONGER EXISTS. The constructed heart
 * spanned x 1.9-22.1 inside a 24 grid, and the box was opened up by 3.2 on
 * every side so the dagger's pommel and the torn halves had somewhere to go —
 * a heart at `size` rendered about `size * 0.88` of actual heart.
 *
 * The drawn artwork bleeds nothing: the sword, the tear and the letters are all
 * inside the drawing, and the icon system centres every glyph on an 18-unit
 * keyline inside its 24 box. Left on the old padded viewBox the same call site
 * rendered `size * 0.78` — visibly smaller than what it replaced, and a rack
 * with a band of dead space down both sides of every pip.
 *
 * So the box is now the art's own bounds plus a margin for the focus ticks, and
 * `BOX` is tuned so a rack at a given `size` reads slightly LARGER than the
 * geometry it replaced rather than slightly smaller: `size * 1.05` of heart.
 */
const VIEW_BOX = '2 2 20 20';
const BOX = 1.17;

/**
 * What a heart IS to the run.
 *
 * ---------------------------------------------------------------------------
 * `wagered` NO LONGER HAS A DRAWING OF ITS OWN
 * ---------------------------------------------------------------------------
 *
 * It had one for a fortnight — `heartWagered`, a sword laid diagonally through
 * the heart — and the argument for it is a few lines up: the blade is a foreign
 * object rather than damage, so it says "something is poised to happen to this"
 * where a crack would say "something already has".
 *
 * The drawing was doing that job and a second one nobody asked it to. A row of
 * three staked hearts is three swords, and at pip size the blades read before
 * the hearts do — a rack of struck-through marks that looks like a row of
 * things CANCELLED, which is the one thing a staked heart is not. It is the
 * reading a reader arrives at without being told, and it beat the intended one.
 *
 * So a held heart is a held heart, staked or not, and the states differ in what
 * they are worth rather than in what they look like:
 *
 *   free      a whole red heart.
 *   wagered   the same whole red heart. Riding on a contest.
 *   pending   grey at a third — a contest that WANTS a heart and has none yet.
 *   killed    the torn glyph, grey. Gone.
 *
 * WHAT THIS COSTS, STATED SO IT IS A CHOICE AND NOT A GAP: inside `Hearts` —
 * the run's own rack — free and wagered are now indistinguishable, and that
 * rack reports "hearts you hold" alone. The distinction did not vanish with the
 * artwork; it moved to the two places that can carry it in words. Every pip
 * still announces itself to a screen reader, and the masthead figure is now the
 * FREE count rather than the held one, so staking is visible as the number
 * moving. See `AppHeader`.
 *
 * `ContestHearts` is untouched by any of this: its row is entered-vs-not, which
 * is `wagered` against `pending`, and those are still red against grey.
 */
/**
 * A PIP: the size every row of one-heart-per-contest draws at.
 *
 * It lives here rather than at either call site because BOTH the lineup rail
 * and the lobby's header draw that row, they are meant to be the identical
 * object — see `LobbyHero` — and a number copied into two files is a number
 * that drifts the first time either is touched.
 *
 * IT HAS COME DOWN FROM 24, TO 20, TO 16, TO 14, AND NOW TO 12. The first two
 * cuts were about rank: at 24 in a filled tray the rack was the heaviest thing
 * on the row and read as the row's subject, which stopped being true when the
 * masthead took over reporting the run, and 20 was still the loudest mark in a
 * row of deliberately quiet ones.
 *
 * THE LAST TWO CAME FROM THE ARTWORK, and they moved the floor rather than
 * testing it. 16 was held as a hard floor on the grounds that a pip is a drawn
 * heart with a BLADE through it or a tear down it — compound shapes, whose
 * parts stop separating well before the silhouette does. The blade is gone (see
 * `HeartState`), so the busiest thing these rows draw is a plain heart, and a
 * plain heart holds at sizes a sword through one cannot.
 *
 * WHAT THE FLOOR IS NOW, stated so the next cut has something to test against.
 * It is not this number. The binding constraint is the TORN heart — `killed` is
 * the only state left with internal structure, two halves and a gap, and it is
 * the first thing to turn into a smudge on the way down. A row of whole hearts
 * would go smaller than a row that might contain a broken one, and the pips are
 * one component, so the broken one sets the size for all of them.
 *
 * At 12 the rendered box is ~14pt (`BOX` is 1.17) and the tear still separates.
 * Below this, check `killed` before anything else — the whole hearts will look
 * fine and will not be the thing that broke.
 *
 * THE TOUCH TARGET DOES NOT FOLLOW IT DOWN. `Pip` reaches out with `hitSlop` to
 * meet the platform's 44, and that slop is a fixed distance rather than a share
 * of the drawing — so shrinking the mark widens the gap it has to cross, and it
 * still crosses it. See the note there.
 */
export const PIP_SIZE = 12;

export type HeartState = 'free' | 'wagered' | 'killed' | 'pending';

/**
 * How a contest that has settled came out.
 *
 * A SEPARATE AXIS FROM `HeartState`, not three more values on it. State says
 * what a heart IS to the run — held, staked, gone — and every pip has one. This
 * says what a finished contest DID with the heart it borrowed, and only the
 * handful of pips belonging to a recapped week have one at all. Folding them
 * into one union would have made every `switch` in this file answer a question
 * most of its callers are not asking.
 */
export type HeartResult = 'W' | 'L' | 'T';

export function Heart({
  size = 13,
  state,
  /**
   * A SETTLED CONTEST'S OUTCOME, drawn on the heart it was played with.
   *
   * Overrides `state` entirely: a heart carrying a result is not held, staked
   * or lost — it is a receipt. Green with a W, red with an L, grey with a T,
   * and the letter is what carries the meaning so the pair survives greyscale
   * and a red-green deficiency, exactly as `TierMark`'s initial does.
   *
   * These live only while the week that produced them is still being recapped
   * (`recap_slate`, 20260830030000). When the window closes they go, and the
   * rack is the run's own again.
   */
  result = null,
  /**
   * The page in view is about THIS heart — the contest it is staked on, or,
   * on the lobby tile, the fact that it is still free to spend.
   *
   * ---------------------------------------------------------------------------
   * ONE MARK, WHATEVER THE HEART IS
   * ---------------------------------------------------------------------------
   *
   * This was two different treatments and it was wrong: a staked heart in focus
   * turned its blade gold, and a free heart in focus grew a dashed box. Same
   * question — "is this the one you are looking at?" — answered by two unrelated
   * objects, so the reader had to learn the answer twice and could not compare
   * the two states at a glance.
   *
   * The channels are separated now and each carries exactly one meaning:
   *
   *   TICKS  focus    — this page points here. Always gold, on any state.
   *   TEAR   outcome  — this heart is gone.
   *
   * THERE WAS A THIRD, AND IT IS GONE: a BLADE for identity, saying this heart
   * is staked. The state still exists and still drives the labels; what it no
   * longer has is artwork of its own. See `HeartState`.
   *
   * CORNER TICKS RATHER THAN A RING, which the blade used to be the reason for
   * — a box argued with the diagonal running across the glyph. The reason has
   * outlived it, because the heart itself is the same shape either way: ticks
   * sit in the corners a heart does not use, it being widest through its
   * middle, so they frame without crossing anything. They are also already
   * gold's own motif (`cornerTicks` in `TierColors`), so this is the app's
   * existing vocabulary for "this one is picked" rather than a new invention.
   *
   * FOCUS IS NOT DRAWN BY COLOUR ALONE. `Hearts` also holds the lit pip at full
   * strength and recedes the rest, which is the signal that survives being small
   * and survives a reader who cannot separate gold from steel. The ticks are the
   * confirmation, not the whole message.
   */
  lit = false,
  /** Overrides the body fill. For the trade row's inline glyph, which is sized
      to a line of text rather than to a rack. */
  color,
}: {
  size?: number;
  state: HeartState;
  result?: HeartResult | null;
  lit?: boolean;
  color?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);
  /* Clip ids are global in the DOM on web, and a rack draws several of these
     side by side. Without a per-instance id every torn heart on the screen
     clips against the first one's regions. */

  const body = color ?? c.negative;

  /* Drawn last so it sits over the blade, and identical on every state — see
     the note on `lit`. Four L-brackets at the corners of the padded box. */
  const ticks = lit ? (
    <G fill="none" stroke={accent} strokeWidth={1.6} strokeLinecap="square">
      <Path d="M2 6V2H6" />
      <Path d="M18 2H22V6" />
      <Path d="M22 18V22H18" />
      <Path d="M6 22H2V18" />
    </G>
  ) : null;

  /**
   * THE RECEIPT. One filled heart, one letter, no blade and no tear.
   *
   * The letter is set in the PAGE's colour rather than in white or black, so it
   * reads as a hole punched through the heart on either scheme — the same trick
   * `YapLogo` uses for the bot's face slots, and the reason `ink` is a prop
   * there. `Text` from react-native-svg rather than an overlaid RN `Text`,
   * because the glyph has to scale with the viewBox: an absolutely-positioned
   * label would need its own font arithmetic per call site and would drift the
   * first time a caller asked for a size nobody had tried.
   */
  if (result !== null) {
    const fill =
      result === 'W' ? c.positive : result === 'L' ? c.negative : c.textSecondary;
    const glyph = result === 'W' ? heartWin : result === 'L' ? heartLoss : heartTie;
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Art glyph={glyph} fill={fill} />
        {ticks}
      </Svg>
    );
  }

  /**
   * AN EMPTY VESSEL: a contest that wants a heart and has not been given one.
   *
   * Outlined rather than filled, which is the one place this file uses an
   * outline and it is the correct place for it. `theme.ts`'s rule is that
   * FILLED MEANS YOU HAVE IT — the old rack broke that by drawing "at risk" as
   * an outline, so a heart you definitely held looked hollow. Here the hollow
   * heart is a heart you have NOT committed, which is the rule pointing the
   * right way round for once.
   *
   * Grey rather than red for the same reason the torn heart is grey: a faint
   * red pip in a row of solid ones reads as a warning about the hearts you do
   * have.
   */
  if (state === 'pending') {
    /* A contest that wants a heart and has not been given one. Held back with
       opacity rather than an outline: these drawings are 70-370 point contours
       and a stroke follows every wobble in them, so the outline that worked for
       the constructed heart becomes a tangle here. Grey rather than red, for
       the reason the torn heart is grey. */
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Art glyph={heartFull} fill={c.textSecondary} opacity={0.34} />
        {ticks}
      </Svg>
    );
  }

  if (state === 'killed') {
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Art glyph={heartBroken} fill={c.textSecondary} opacity={0.68} />
        {ticks}
      </Svg>
    );
  }

  return (
    <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
      {/* ONE DRAWING FOR BOTH. A wagered heart used to carry `heartWagered` —
          a sword laid through it — and it does not any more: see the note on
          `HeartState`. */}
      <Art glyph={heartFull} fill={body} />
      {ticks}
    </Svg>
  );
}

/**
 * ---------------------------------------------------------------------------
 * THE ARTWORK IS NOW DRAWN, NOT CONSTRUCTED
 * ---------------------------------------------------------------------------
 *
 * Every state below used to be built from `HEART` plus a blade, a clip pair or
 * an SVG `<Text>`. It is now one imported drawing per state, generated and
 * traced through the pipeline in `src/components/icons/`.
 *
 * WHAT THAT CHANGED, AND WHAT IT DID NOT. The geometry is new; every rule this
 * file argued for is kept. Filled still means you hold it. The blade is still a
 * foreign object rather than damage, so a staked heart never reads as a hurt
 * one. The torn heart is still grey rather than faded red, because a faint red
 * pip reads as a warning about the hearts you still have. The letters are still
 * knocked out of the body rather than laid on it.
 *
 * The letters in particular are now part of the drawing rather than an SVG
 * `<Text>` positioned by baseline. That removes the per-renderer baseline
 * fight this file documents at length — iOS and web disagreed about
 * `alignmentBaseline`, and the W ended up through the heart's point — because
 * a hole in a path cannot drift.
 */
function Art({ glyph, fill, opacity }: { glyph: Glyph; fill: string; opacity?: number }) {
  /* The drawings are authored in their own box (1000) and this file's viewBox
     is the 24 grid padded for the hilt and the tear, so one scale puts them on
     the same footing as the geometry they replace. */
  const k = GRID / (glyph.source ?? GRID);
  return (
    <G transform={`scale(${k})`} fill={fill} opacity={opacity}>
      {glyph.parts.map((part, i) => (
        <Path key={i} d={part.d} />
      ))}
    </G>
  );
}

/**
 * The pips one contest is holding: `start` is the first, `count` how many.
 *
 * A count rather than a flag because `hearts_at_risk` is a NUMBER. Every
 * contest priced so far stakes exactly one, so a single index would work today
 * and be wrong the first week it does not — a two-heart contest would light one
 * blade and quietly misreport what is on the line.
 */
export type HeartSpan = { start: number; count: number };

/**
 * One pip, receding when the page is pointing somewhere else.
 *
 * BRIGHTNESS IS THE PRIMARY FOCUS SIGNAL and the ticks are the confirmation,
 * not the other way round. A lit pip at full strength against dimmed
 * neighbours is legible at any size, in greyscale, and while the row is
 * mid-animation — the ticks are 1.6pt of gold and none of those things are
 * true of them alone.
 *
 * ---------------------------------------------------------------------------
 * IT IS A PLAIN STYLE, AND THAT IS A DELIBERATE RETREAT FROM REANIMATED
 * ---------------------------------------------------------------------------
 *
 * A 200ms crossfade belongs here on the merits — the rack does not move between
 * pages, so the highlight travelling is the only motion in the row and a cut is
 * abrupt. It was written twice and removed twice, because both spellings failed
 * the same way and failed SILENTLY:
 *
 *   useAnimatedStyle(() => ({ opacity: withTiming(...) }), [dimmed])
 *   a shared value written from a useEffect, the `PackReveal` pattern
 *
 * In both, every pip animated once and then froze at whatever opacity it was
 * passing through, for the life of the screen. Swiping moved the gold ticks
 * correctly — those are plain render output — while the brightness stayed
 * wherever it had stalled. So the rack reported the right heart with the wrong
 * emphasis, which is strictly worse than not animating: brightness is the
 * PRIMARY focus signal here and the ticks are only its confirmation.
 *
 * Verified in the browser, not inferred: stepping the gallery carousel across
 * all three pages left the three pips pinned at page one's values while the
 * ticks tracked correctly.
 *
 * The suspect is this project's React Compiler build — memoising the worklet
 * closure so it only ever sees the first `dimmed` — but the cause was not run to
 * ground, and that is the point: an animation whose failure mode is "the most
 * important signal on the row quietly stops updating" is not worth carrying on
 * an unproven mechanism. A plain style cannot desync from its prop. If the fade
 * is wanted later, prove it on device AND on web across a full swipe before
 * trusting it.
 */
/**
 * HOW FAR AN UNFOCUSED PIP RECEDES.
 *
 * It was 0.42, which was correct while a gold bracket was drawn around the pip
 * in focus: brightness only had to SUPPORT a mark that was already unmissable,
 * and dimming much harder would have buried the settled receipts a reader is
 * meant to be able to count at a glance.
 *
 * `ContestHearts` has no mark any more (see the note there), so brightness is
 * not the primary signal — it is the ONLY one, and 0.42 is not a wide enough
 * gap to carry that alone. A tied heart is already drawn in `textSecondary`, so
 * at 0.42 a grey pip in focus and a red pip out of it sat at roughly the same
 * weight and the row pointed at nothing in particular.
 *
 * 0.24 is the floor that still reads as a heart rather than a smudge on black,
 * checked against the dimmest state the row can draw — a tied receipt, which is
 * grey before this is applied at all.
 */
const DIMMED = 0.24;

function Pip({
  size,
  state,
  result = null,
  lit,
  dimmed,
  onPress,
  label,
}: {
  size: number;
  state: HeartState;
  result?: HeartResult | null;
  lit: boolean;
  dimmed: boolean;
  onPress?: () => void;
  label: string;
}) {
  const body = (
    <View style={{ opacity: dimmed ? DIMMED : 1 }}>
      <Heart size={size} state={state} result={result} lit={lit} />
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      /* The pips are 26pt drawn and sit 5pt apart, which is under the 44pt
         minimum on its own. The hit slop reaches out to meet it without moving
         anything: half the gap either side, and the row's own padding above and
         below. Overlapping slop between neighbours is fine — the nearer centre
         wins — and is much better than a rack that is decorative on a phone. */
      hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }}
      style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
}

/**
 * One heart per contest on the board, in the carousel's own order.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `Hearts`
 * ---------------------------------------------------------------------------
 *
 * `Hearts` draws a RUN: hearts held, hearts lost, and the rack they sit in. It
 * is the right object for the lobby, the sidebar, the death screen and the
 * contest rules panel, all of which are asking "how is this run doing".
 *
 * The board's rail is asking something else, and the difference showed up as a
 * bug the moment the free contest became unconditional (`20260830030000`): the
 * carousel held four cards and the rail drew three pips, because a contest you
 * had not entered yet spent no heart and therefore produced nothing. Swiping
 * onto it lit nothing at all. A row that is a switcher for the cards above it
 * has to have one pip per card or it is not a switcher, it is a coincidence.
 *
 * So this takes ENTRIES, not a run. Every contest on the board contributes its
 * `heartsAtRisk`, whatever state that heart is in:
 *
 *   pending    the contest is on the board and you have not entered it
 *   entered    a heart is riding on it right now
 *   W / L / T  it settled, and this is the receipt
 *
 * THE RECEIPT EXPIRES; WHAT IT SETTLED INTO DOES NOT. `showResult` is a day-old
 * clock the board applies (see `recentlySettled`) so a finished week stops
 * shouting and the player looks forward. When it lapses the badge goes and the
 * pip falls back to WHAT THE HEART ACTUALLY IS now — torn if that contest took
 * it, whole if it did not.
 *
 * It must not fall back to `entered`, which was the obvious bug in the way:
 * `entered` means a heart is riding on this RIGHT NOW, and drawing it on a
 * contest that finished on Sunday claims a stake the player does not have. Nor
 * to `pending`, which claims they never entered at all. The heart's own two
 * states were already the truthful answer and needed no fourth invented for
 * them.
 *
 * Order is the carousel's, so pip N is card N and tapping one is the same
 * gesture as swiping to it.
 *
 * A CONTEST THAT RISKS NO HEARTS CONTRIBUTES NO PIP, and would break the
 * one-to-one. None is priced that way today — every contest in the schema
 * stakes exactly one — but `hearts_at_risk` is a number and 0 is legal, so the
 * first free-of-charge contest will need an answer here rather than silently
 * going missing from its own row.
 */
export function ContestHearts({
  entries,
  focus = null,
  size = PIP_SIZE,
  gap = 5,
  onPress,
}: {
  entries: {
    result: HeartResult | null;
    entered: boolean;
    /**
     * Whether the W/L/T badge is still being shown for this one.
     *
     * Separate from `result` because the result is still what decides the
     * heart's SHAPE once the badge is gone. Defaults on: every caller outside
     * the board's rail draws a receipt for as long as it has one.
     */
    showResult?: boolean;
  }[];
  /** The card in view, as a span into `entries`. */
  focus?: HeartSpan | null;
  size?: number;
  gap?: number;
  /** Tap a pip, go to its card. Index-aligned with `entries`. */
  onPress?: (index: number) => void;
}) {
  return (
    <View style={[styles.row, { gap }]}>
      {entries.map((e, i) => {
        const lit = focus !== null && i >= focus.start && i < focus.start + focus.count;
        const badge = e.showResult === false ? null : e.result;
        /* A LOST CONTEST TOOK THE HEART, so the pip is torn whether or not the
           badge is still up — that is not a receipt, it is the state of the
           run. Won and tied kept theirs and stay whole.

           AN ENTERED CONTEST THAT HAS NOT SETTLED IS A WAGERED HEART, and this
           used to draw it as `free`. That was wrong by this file's own
           definition — the note above says `entered` means a heart is riding on
           this RIGHT NOW — and it made the rack claim a stake was spendable on
           the one screen where that decides whether you enter anything else. It
           went unnoticed because the old blade was a thin grey stick that read
           as noise at 13pt, so free and staked looked much the same either way;
           the drawn sword is the difference being visible for the first time.

           ORDER MATTERS HERE. `result` is checked first throughout: a settled
           contest is never wagered, whatever `entered` still says. */
        const state =
          e.result === 'L'
            ? 'killed'
            : e.result !== null
              ? 'free'
              : e.entered
                ? 'wagered'
                : 'pending';
        return (
          <Pip
            key={i}
            size={size}
            state={state}
            result={badge}
            /**
             * NO MARK ON THE PIP IN FOCUS — brightness is the whole signal.
             *
             * This drew `Heart`'s gold corner ticks, and that was the right
             * call while the rack floated on the page: with nothing around a
             * pip, a bracket is the only way to frame one.
             *
             * The rack sits in a tray now (see `RunRail`), and inside a
             * container the brackets stopped working on two counts. They are
             * drawn at the padded edge of the box, which is WIDER than the
             * heart, so at a 5pt gap each mark reached into its neighbours and
             * the row read as a crop tool rather than a pager. And they are
             * gold — the same colour as the button at the end of the row, so
             * one row said "you are here" and "press me" in one hue and the eye
             * could not rank them.
             *
             * `Heart` keeps `lit`, and `Hearts` keeps using it: that rack is a
             * RUN drawn on its own ground, which is the case the ticks were
             * designed for and still the case they are right for.
             */
            lit={false}
            /* Recede only when the row IS pointing somewhere. */
            dimmed={focus !== null && !lit}
            onPress={onPress ? () => onPress(i) : undefined}
            /* The words follow the drawing, badge or no badge. A pip whose
               receipt has lapsed still announces what happened rather than
               going quiet — a screen reader has no 24-hour glance to have
               caught it in. */
            label={
              e.result === 'W'
                ? 'A contest you won. Show it'
                : e.result === 'L'
                  ? 'A contest you lost. Show it'
                  : e.result === 'T'
                    ? 'A contest that tied. Show it'
                    : e.entered
                      ? 'A contest you are in. Show it'
                      : 'A contest you have not entered. Show it'
            }
          />
        );
      })}
    </View>
  );
}

export function Hearts({
  hearts,
  wagered = 0,
  /**
   * The span a PARTICULAR contest has on the line, drawn under that contest's
   * card. Null highlights nothing, which is every caller outside the carousel.
   *
   * It is an index into the rack rather than a flag on a heart, because a heart
   * is not a thing the schema knows about: `run.wagered` is a count, so nothing
   * says which pip a given contest is risking. The carousel assigns them in its
   * own order — contests take pips left to right in carousel order — which
   * keeps the count honest and the mapping fixed for the week.
   */
  focus = null,
  /**
   * Pips to draw in total — the run's `rack` (its high-water mark). Anything
   * beyond `hearts` is drawn KILLED. Defaults to the hearts held, which draws
   * no damage at all, so a caller that does not know the rack cannot
   * accidentally invent losses.
   */
  rack,
  size = 13,
  /** Gap between pips. Wider than it was: the hilt now leaves the heart's own
      footprint, so adjacent pips need room or the blades touch. */
  gap = 5,
  /**
   * Make the rack a NAVIGATOR: tap a pip, go to the page it belongs to.
   *
   * The rack already answers "which heart is this page about". Pressing turns
   * that into a two-way link — the reader can go from a heart to its contest as
   * well as from a contest to its heart — which is the difference between a
   * legend and a control. Optional, because the masthead, the lobby and the
   * death screen all draw the same rack with nowhere to send anybody.
   */
  onPressPip,
  /**
   * Where each pip leads, index-aligned with the rack. `null` — or an index past
   * the end — means that pip is inert and draws no press target, which is how a
   * killed heart stays unpressable: the contest that took it is over.
   */
  pipTarget,
}: {
  hearts: number;
  wagered?: number;
  focus?: HeartSpan | null;
  rack?: number;
  size?: number;
  gap?: number;
  onPressPip?: (page: number) => void;
  pipTarget?: (number | null)[];
}) {
  const held = Math.max(0, hearts);
  /* Clamped to what is actually held. Risking two hearts while holding one is
     legal — settlement floors the balance at zero — and the honest way to draw
     it is every heart you have marked, not a third pip that does not exist. */
  const atRisk = Math.min(Math.max(0, wagered), held);
  const total = Math.max(rack ?? held, held, 1);

  return (
    <View style={[styles.row, { gap }]}>
      {Array.from({ length: total }, (_, i) => {
        /* WAGERED FIRST. Stakes fill from pip 0 rightward, so a contest keeps
           its pip no matter what is entered after it — the carousel's span
           arithmetic depends on this order and on nothing else. Losses
           accumulate on the right, so the rack still depletes rightward. */
        const state: HeartState =
          i < atRisk ? 'wagered' : i < held ? 'free' : 'killed';
        /* The two ways a page can point at a pip, resolved to one flag before
           anything is drawn. `focus` is a contest naming the heart it holds;
           `available` is the lobby tile naming every heart still spendable. */
        const lit = focus !== null && i >= focus.start && i < focus.start + focus.count;
        /* Recede only when the caller IS pointing somewhere. With no focus the
           rack is a plain count and every pip is at full strength. */
        const pointing = focus !== null;
        const target = pipTarget?.[i];
        const press =
          onPressPip && target !== null && target !== undefined
            ? () => onPressPip(target)
            : undefined;
        return (
          <Pip
            key={i}
            size={size}
            state={state}
            lit={lit}
            dimmed={pointing && !lit}
            onPress={press}
            label={
              state === 'wagered'
                ? 'Heart staked on a contest. Show it'
                : state === 'free'
                  ? 'Free heart. Enter a contest to stake it'
                  : 'Heart lost'
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.55 },
});
