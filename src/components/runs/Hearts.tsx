/**
 * The hearts a run is holding, and which of them are riding on something.
 *
 * ---------------------------------------------------------------------------
 * THE RACK SHOWS WHAT YOU HAVE, NOT WHAT YOU COULD HAVE
 * ---------------------------------------------------------------------------
 *
 * This drew `max_hearts` pips and filled them up to `hearts`. A run starts on 3
 * and heals to a ceiling of 5, so a brand-new player opened the app to three
 * filled hearts and two empty ones — nothing lost, drawn as two losses. The
 * first impression the game makes was of damage that had not happened.
 *
 * The fault underneath it: an empty pip meant BOTH "you lost this" and "you
 * could still heal into this", and those cannot share a shape. Headroom is not
 * drawn at all now — the ceiling is a sentence the run panel says once, not a
 * row of ghosts on every screen — which frees the empty pip for the state that
 * actually changes week to week.
 *
 * ---------------------------------------------------------------------------
 * THREE STATES, AND ALL THREE ARE DRAWN
 * ---------------------------------------------------------------------------
 *
 *   SAFE      solid red      yours, and nothing can take it this week
 *   WAGERED   red outline    yours, but riding on a contest not yet settled
 *   BROKEN    grey, cracked  this run held it and lost it
 *
 * BROKEN IS A DIFFERENT SHAPE, not a fainter one. A hollow grey heart and a
 * hollow red heart differ only in hue, which is the one channel that fails on
 * a small glyph at 13pt against a black masthead — and confusing "riding" with
 * "gone" is the single worst misread available here. The crack makes them
 * different objects at a glance, before colour is doing any work at all.
 *
 * WHAT IT IS COUNTED AGAINST is `rack`, the run's high-water mark, NOT its
 * ceiling. Drawing against the ceiling is what made a fresh run — 3 hearts,
 * healing to 5 — open as three filled and two empty, i.e. as two losses that
 * had not happened. See 20260825250000; the rack grows on healing and never
 * narrows, so damage stays visible instead of the row quietly shrinking.
 *
 * Wagered is the state the game was missing and the reason this component was
 * rewritten. A player holding three hearts who has already staked two on this
 * week's slate has ONE left to spend — and before this, nothing said so. They
 * read "3", entered a third contest, and found out at settlement.
 *
 * It stays RED rather than fading toward the empty colour. A wagered heart is
 * not half-lost; it is fully yours and fully exposed, and greying it would make
 * a live stake read as a result already in.
 *
 * ORDER IS WAGERED, THEN SAFE, THEN BROKEN. This was safe-first, on the
 * argument that a rack which reordered as stakes were placed would make the
 * same three hearts look like different hearts week to week. That argument was
 * written when nothing mapped a heart to a CONTEST, and once something does it
 * points the other way.
 *
 * Safe-first fills stakes right-to-left: at two stakes the first contest owns
 * pip 1, and entering a third slides it to pip 0. The tick under a contest you
 * did not touch moves. Wagered-first fills left-to-right from a fixed origin,
 * so contest n owns pip n for the life of the week no matter what you enter
 * after it — which is the stability the old comment was reaching for, applied
 * to the thing that now actually has an identity.
 *
 * Losses still accumulate on the right, so the row still depletes rightward.
 *
 * The heart is a path rather than an icon font for the same reason `Gem` is a
 * rotated square: crisp at every size, no dependency.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** A heart on a 24-box, so the path scales by one number. */
const HEART =
  'M12 21s-7.5-4.7-9.6-9.1C.8 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.3 2.3.4.5.6.8 1.8.8s1.4-.3 1.8-.8C14.7 6.1 16.1 5 18.1 5c3.5 0 5.1 3.6 3.5 6.9C19.5 16.3 12 21 12 21z';

/**
 * The crack: a lightning-bolt zigzag down the middle of the same 24-box, from
 * the notch at the top to the point at the bottom. Deliberately off-centre at
 * each turn — a symmetrical break reads as a fold or a seam rather than a
 * fracture.
 */
const CRACK = 'M12 7.4l-2.1 3.5 3 1.9-2.4 3.4 1.6 2.6';

export type HeartState = 'safe' | 'wagered' | 'broken';

export function Heart({
  size = 13,
  state,
  color,
}: {
  size?: number;
  state: HeartState;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={HEART}
        fill={state === 'safe' ? color : 'none'}
        stroke={color}
        /* The outline has to carry the whole shape once there is no fill, so
           it is heavier than a hairline would be at 13pt. */
        strokeWidth={state === 'safe' ? 0 : 2}
        strokeLinejoin="round"
        /* Only the broken pip recedes, and only part-way — far enough to sit
           behind the live hearts, not so far that the count becomes a squint.
           A wagered one is at full strength: it is a live stake, not a faded
           memory of one. */
        opacity={state === 'broken' ? 0.45 : 1}
      />
      {state === 'broken' ? (
        <Path
          d={CRACK}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.45}
        />
      ) : null}
    </Svg>
  );
}

/**
 * The pips one contest is holding: `start` is the first, `count` how many.
 *
 * A count rather than a flag because `hearts_at_risk` is a NUMBER. Every
 * contest priced so far stakes exactly one, so a single index would work today
 * and be wrong the first week it does not — a two-heart contest would underline
 * one pip and quietly misreport what is on the line.
 */
export type HeartSpan = { start: number; count: number };

/** One pip, receding when another contest owns the highlight. */
function Pip({
  size,
  state,
  color,
  dimmed,
}: {
  size: number;
  state: HeartState;
  color: string;
  dimmed: boolean;
}) {
  const style = useAnimatedStyle(
    () => ({ opacity: withTiming(dimmed ? 0.62 : 1, { duration: 200 }) }),
    [dimmed],
  );
  return (
    <Animated.View style={style}>
      <Heart size={size} state={state} color={color} />
    </Animated.View>
  );
}

/**
 * The mark under a pip. Grey under every wagered heart, gold under the one this
 * contest holds.
 *
 * The gold rides as a SEPARATE layer over the grey rather than the colour being
 * animated: a colour interpolation between them passes through a muddy olive
 * that reads as a third state, and crossfading two solid layers cannot.
 */
function Tick({
  width,
  mode,
  accent,
  dim,
}: {
  width: number;
  mode: 'focus' | 'staked' | 'none';
  accent: string;
  dim: string;
}) {
  const base = useAnimatedStyle(
    () => ({ opacity: withTiming(mode === 'none' ? 0 : 1, { duration: 180 }) }),
    [mode],
  );
  const lit = useAnimatedStyle(
    () => ({ opacity: withTiming(mode === 'focus' ? 1 : 0, { duration: 180 }) }),
    [mode],
  );
  return (
    <Animated.View style={[styles.tick, { width, backgroundColor: dim }, base]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: accent, borderRadius: 1 }, lit]}
      />
    </Animated.View>
  );
}

export function Hearts({
  hearts,
  wagered = 0,
  /**
   * The span a PARTICULAR contest has on the line, drawn under that contest's
   * card in the lineup carousel. Null dims nothing, which is every other
   * caller.
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
   * beyond `hearts` is drawn BROKEN. Defaults to the hearts held, which draws
   * no damage at all, so a caller that does not know the rack cannot
   * accidentally invent losses.
   */
  rack,
  size = 13,
  /**
   * Draw the tick rail under the pips: grey under every wagered heart, gold
   * under `focus`.
   *
   * OFF by default, and that is not just a size concern. The masthead and the
   * death screen show the rack with no contest in view, and a rail there would
   * promise a mapping the screen cannot act on — a row of grey marks under
   * hearts, pointing at nothing.
   */
  rail = false,
}: {
  hearts: number;
  wagered?: number;
  focus?: HeartSpan | null;
  rack?: number;
  size?: number;
  rail?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  const held = Math.max(0, hearts);
  /* Clamped to what is actually held. Risking two hearts while holding one is
     legal — settlement floors the balance at zero — and the honest way to draw
     it is every heart you have marked, not a third pip that does not exist. */
  const atRisk = Math.min(Math.max(0, wagered), held);
  const total = Math.max(rack ?? held, held, 1);

  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => {
        /* WAGERED FIRST — see the header. Stakes fill from pip 0 rightward, so
           a contest keeps its pip no matter what is entered after it. */
        const state: HeartState =
          i < atRisk ? 'wagered' : i < held ? 'safe' : 'broken';
        const focused =
          focus !== null && i >= focus.start && i < focus.start + focus.count;
        return (
          <View key={i} style={styles.pip}>
            <Pip
              size={size}
              state={state}
              /* Broken goes grey rather than staying red at low opacity: a faint
                 red pip reads as a warning about the hearts you still have. */
              color={state === 'broken' ? c.textSecondary : c.negative}
              /* Only recede when something is actually highlighted. With no
                 focus the rack is a plain count and every pip is at strength. */
              dimmed={focus !== null && !focused}
            />
            {rail ? (
              <Tick
                width={Math.max(6, size - 5)}
                mode={focused ? 'focus' : state === 'wagered' ? 'staked' : 'none'}
                accent={accent}
                dim={c.border}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  pip: { alignItems: 'center', gap: 3 },
  tick: { height: 2, borderRadius: 1, overflow: 'hidden' },
});
