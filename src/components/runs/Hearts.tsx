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
 * THREE STATES, AND WHY THE MIDDLE ONE IS THE POINT
 * ---------------------------------------------------------------------------
 *
 *   SAFE      solid       yours, and nothing can take it this week
 *   WAGERED   red outline yours, but riding on a contest that has not settled
 *   EMPTY     grey ghost  the rack a death screen counts down from
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

export type HeartState = 'safe' | 'wagered' | 'empty';

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
        /* Only the empty pip recedes. A wagered one is at full strength because
           it is a live stake, not a faded memory of one. */
        opacity={state === 'empty' ? 0.32 : 1}
      />
    </Svg>
  );
}

export function Hearts({
  hearts,
  wagered = 0,
  /**
   * Pips to draw in total. Defaults to the hearts held, which is what the
   * chrome wants. The death screen passes the run's ceiling so it can show an
   * emptied rack rather than nothing at all.
   */
  rack,
  size = 13,
}: {
  hearts: number;
  wagered?: number;
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
          i < held - atRisk ? 'safe' : i < held ? 'wagered' : 'empty';
        return (
          <Heart
            key={i}
            size={size}
            state={state}
            /* Empty goes grey rather than staying red at low opacity: a faint
               red pip reads as a warning about the hearts you still have. */
            color={state === 'empty' ? c.textSecondary : c.negative}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
