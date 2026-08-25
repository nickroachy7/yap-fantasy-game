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
 * ORDER IS SAFE, THEN WAGERED, THEN EMPTY, so the row always depletes to the
 * right. A rack that reordered itself as stakes were placed would make the same
 * three hearts look like different hearts week to week.
 *
 * The heart is a path rather than an icon font for the same reason `Gem` is a
 * rotated square: crisp at every size, no dependency.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
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

export function Hearts({
  hearts,
  wagered = 0,
  /**
   * One pip to bring forward, dimming the rest — the heart a PARTICULAR contest
   * has on the line, drawn under that contest's card in the lineup carousel.
   *
   * It is an index into the rack rather than a flag on a heart, because a heart
   * is not a thing the schema knows about: `run.wagered` is a count, so nothing
   * says which pip a given contest is risking. The carousel assigns them in its
   * own order — the nth contest with a stake owns the nth wagered pip — which
   * keeps the count honest and the highlight stable as you swipe. Null dims
   * nothing, which is every other caller.
   */
  focus = null,
  /**
   * Pips to draw in total — the run's `rack` (its high-water mark). Anything
   * between `hearts` and this is drawn BROKEN. Defaults to the hearts held,
   * which draws no damage at all, so a caller that does not know the rack
   * cannot accidentally invent losses.
   */
  rack,
  size = 13,
}: {
  hearts: number;
  wagered?: number;
  focus?: number | null;
  rack?: number;
  size?: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const held = Math.max(0, hearts);
  /* Clamped to what is actually held. Risking two hearts while holding one is
     legal — settlement floors the balance at zero — and the honest way to draw
     it is every heart you have marked, not a third pip that does not exist. */
  const atRisk = Math.min(Math.max(0, wagered), held);
  const total = Math.max(rack ?? held, held, 1);

  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => {
        const state: HeartState =
          i < held - atRisk ? 'safe' : i < held ? 'wagered' : 'broken';
        /* The rack recedes rather than the focused pip getting louder. Making
           one heart brighter than red means inventing a second red, and the
           two would then have to be told apart at 13pt; taking the others down
           says the same thing with the colour the app already has. */
        const dimmed = focus !== null && i !== focus;
        return (
          <View key={i} style={dimmed ? styles.dim : undefined}>
            <Heart
              size={size}
              state={state}
              /* Broken goes grey rather than staying red at low opacity: a faint
                 red pip reads as a warning about the hearts you still have. */
              color={state === 'broken' ? c.textSecondary : c.negative}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  /* Far enough back that the focused pip is unmistakable, not so far that the
     rack stops being readable as a count — the row still has to answer "how
     many do I have" while it answers "which one is on this contest". */
  dim: { opacity: 0.3 },
});
