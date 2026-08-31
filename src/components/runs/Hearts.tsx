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
 * shape in an app whose icon language is a rotated square (`Gem`), concentric
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
 * Drawn as a path rather than an icon font for the reason `Gem` gives: crisp
 * everywhere, and no dependency to ship a thousand glyphs to draw one.
 */
import { useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Colors, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The heart, faceted, on a 24-box so the path scales by one number.
 *
 * Nine straight segments. The notch at (12, 7.2) and the point at (12, 21.6)
 * are the two vertices the tear runs between — see `TEAR`.
 */
const HEART =
  'M12 7.2L9.3 3.6H4.6L1.9 7.9L2.4 12.2L12 21.6L21.6 12.2L22.1 7.9L19.4 3.6H14.7Z';

/**
 * The line a heart breaks along: notch to point, zigzagging.
 *
 * DELIBERATELY OFF-CENTRE AT EVERY TURN. A symmetrical break reads as a fold or
 * a seam — two halves that were designed to come apart — where the whole point
 * is that this one tore.
 *
 * It is expressed as two CLIP REGIONS rather than as a stroked line, because
 * the two halves have to move independently. Each region is the zigzag plus a
 * generous box off its own side, so clipping the heart with it yields exactly
 * one half with a jagged inner edge.
 */
const TEAR = 'L9.8 11.5L13.4 13.4L10.6 17.2L12 21.6';
const TEAR_LEFT = `M12 -8L12 7.2${TEAR}L-8 21.6L-8 -8Z`;
const TEAR_RIGHT = `M12 -8L12 7.2${TEAR}L32 21.6L32 -8Z`;

/**
 * The blade, drawn pointing straight down and then rotated into place.
 *
 * Long enough to cross the whole heart — the chord at this angle is about 18
 * units and the blade is 19.6 — so that both ends clear the silhouette. Short
 * grip on purpose: the hilt is the part that leaves the 24-box, and every unit
 * of it is a unit the glyph box has to grow by.
 */
const BLADE = 'M10.05 1.4H13.95L13.4 16.4L12 20.8L10.6 16.4Z';
/**
 * Degrees clockwise, about the heart's centre.
 *
 * 42 is chosen so the tip exits just above the heart's own point. Shallower and
 * the blade reads as a slash across the top; steeper and its tip crowds the
 * heart's point, putting two sharp things in the same corner. Rotating about
 * (12, 12) rather than translating is what guarantees the axis runs through the
 * middle at any angle.
 */
const BLADE_ROTATION = 42;

/**
 * The viewBox, padded so the hilt and the tear have somewhere to go.
 *
 * The heart occupies x 1.9–22.1 and y 3.6–21.6. The pommel swings out to about
 * (23.7, -0.8) and the torn halves rotate a unit and a half either way, so the
 * box is opened up by 3.2 on every side. `BOX` is the matching multiplier for
 * the rendered width: a caller asking for `size` gets a HEART about that wide,
 * not a heart shrunk to fit its own padding.
 */
const VIEW_BOX = '-3.2 -3.2 30.4 30.4';
const BOX = 1.32;

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

/**
 * The steel, which is not a theme token because nothing else is made of it.
 *
 * Two values because it sits ON the heart and the heart is not the same red in
 * both schemes. Against dark mode's bright `#FF6369` a near-white blade
 * out-shouts the heart it is stuck in, so it is pulled down; against light
 * mode's much darker `#C4283C` it has to come up or it disappears.
 */
function bladeOf(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? '#B8BDC4' : '#F5F7F9';
}

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
   *   BLADE  identity — this heart is staked. Always steel, never gold.
   *   TICKS  focus    — this page points here. Always gold, on any state.
   *   TEAR   outcome  — this heart is gone.
   *
   * CORNER TICKS RATHER THAN A RING because the blade already runs a diagonal
   * across the glyph, and a box drawn around it argues with that line. Ticks sit
   * in the corners the heart does not use — it is widest through its middle — so
   * they frame without crossing anything. They are also already gold's own motif
   * (`cornerTicks` in `TierColors`), so this is the app's existing vocabulary for
   * "this one is picked" rather than a new invention.
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
  const id = useId();

  const body = color ?? c.negative;
  const steel = bladeOf(scheme);

  /* Drawn last so it sits over the blade, and identical on every state — see
     the note on `lit`. Four L-brackets at the corners of the padded box. */
  const ticks = lit ? (
    <G fill="none" stroke={accent} strokeWidth={1.6} strokeLinecap="square">
      <Path d="M-2 2.2V-2H2.2" />
      <Path d="M21.8 -2H26V2.2" />
      <Path d="M26 21.8V26H21.8" />
      <Path d="M2.2 26H-2V21.8" />
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
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Path d={HEART} fill={fill} />
        {/* POSITIONED BY BASELINE ALONE, which is the only thing every renderer
            agrees on. `alignmentBaseline="central"` plus a compensating `dy`
            was belt AND braces and they fought: iOS honoured both and dropped
            the letter onto the heart's point, where the W bled out of the
            bottom of the glyph.

            So: no baseline attribute, and `y` is the baseline itself. The
            heart is a FACETED one — it narrows to a point at y 21.6 — so the
            letter has to live in the wide band above that, not on the centre of
            the bounding box. Cap height runs from about y 7.5 to the baseline
            at 14.2, which is the widest run of the shape; a glyph sized to the
            box instead put the W's legs out through the point. */}
        <SvgText
          x={12}
          y={14.2}
          fill={c.background}
          fontSize={9.5}
          fontWeight="700"
          textAnchor="middle">
          {result}
        </SvgText>
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
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Path
          d={HEART}
          fill="none"
          stroke={c.textSecondary}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
        {ticks}
      </Svg>
    );
  }

  if (state === 'killed') {
    return (
      <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
        <Defs>
          <ClipPath id={`l${id}`}>
            <Path d={TEAR_LEFT} />
          </ClipPath>
          <ClipPath id={`r${id}`}>
            <Path d={TEAR_RIGHT} />
          </ClipPath>
        </Defs>
        {/* FILLED, not hollow. Two solid shapes with a torn void between them
            read instantly at 12pt; the same halves as outlines become a tangle
            of thin strokes with a gap somewhere in it. Grey rather than a faded
            red, because a faint red pip reads as a warning about the hearts you
            still have.

            TRANSFORMS AS STRINGS ON A `G`, not as `translateX`/`rotation` props
            on the `Path`. Those props are native-only: react-native-svg's web
            build forwards them straight to the DOM, where React rejects them and
            the halves render un-nudged and un-rotated — an untorn grey heart. */}
        <G fill={c.textSecondary} opacity={0.68}>
          <G transform="rotate(-9 12 12) translate(-1.5 0.5)">
            <Path d={HEART} clipPath={`url(#l${id})`} />
          </G>
          <G transform="rotate(9 12 12) translate(1.5 0.5)">
            <Path d={HEART} clipPath={`url(#r${id})`} />
          </G>
        </G>
        {ticks}
      </Svg>
    );
  }

  return (
    <Svg width={size * BOX} height={size * BOX} viewBox={VIEW_BOX}>
      <Path d={HEART} fill={body} />
      {/* THE HILT IS DELIBERATELY OVERSIZED against the blade. Drawn to
          realistic proportions it read as a plain diagonal stick at 26pt —
          pommel, grip and guard all resolving to one grey smudge. The guard is
          now more than twice the blade's width and the pommel is wider than the
          grip, which is what makes the silhouette say "dagger" before any of
          its parts are individually legible. */}
      {state === 'wagered' ? (
        <G transform={`rotate(${BLADE_ROTATION} 12 12)`} fill={steel}>
          <Circle cx={12} cy={-3.9} r={1.5} />
          <Rect x={11.05} y={-3.4} width={1.9} height={3} rx={0.65} />
          <Rect x={7.9} y={-0.4} width={8.2} height={1.8} rx={0.7} />
          <Path d={BLADE} />
        </G>
      ) : null}
      {ticks}
    </Svg>
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
    <View style={{ opacity: dimmed ? 0.42 : 1 }}>
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
  size = 13,
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
           run. Won and tied kept theirs and stay whole. */
        const state =
          e.result === 'L'
            ? 'killed'
            : e.result !== null
              ? 'free'
              : e.entered
                ? 'free'
                : 'pending';
        return (
          <Pip
            key={i}
            size={size}
            state={state}
            result={badge}
            lit={lit}
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
