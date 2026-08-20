/**
 * The slot a player's photograph will occupy, holding a silhouette until there
 * is one to put in it.
 *
 * WE HOLD NO LICENCE FOR PLAYER IMAGERY. No photo, no logo, no jersey — that
 * has been true since the first row was drawn, and it is why the directory led
 * with a position badge instead of a headshot: the badge was the same slot
 * doing an honest job.
 *
 * This is the other honest option, and a better one now that the row has
 * somewhere else to say the position. Drawing the SLOT — a frame at the size a
 * headshot would be, with a generic figure in it — reserves the space, so the
 * day a licensed image arrives it drops in without a row moving. A row designed
 * around a 26pt badge would have had to be redesigned around a 40pt portrait.
 *
 * A ROUNDED SQUARE, NOT A CIRCLE. The frame is the crop the real photograph
 * will arrive in, so it should be the crop we actually want: a circle eats the
 * corners of a headshot, and every other container on these screens — chips,
 * facts, trays, the cards themselves — is a rounded rectangle. A ring of
 * circles down the directory was the one shape in the app that agreed with
 * nothing around it. The radius is proportional so a 40pt row slot and a 56pt
 * hero portrait sit at the same visual softness.
 *
 * DELIBERATELY UNIFORM. Every player gets the same silhouette. Varying it by
 * position or tier would make it look like it MEANS something, and a placeholder
 * that implies information it does not have is worse than an obvious blank —
 * the position is on the line beside it and the tier is not a fact about a
 * player at all.
 *
 * NO INITIALS EITHER, which is the usual fallback and wrong here. Two-letter
 * monograms down a list read as a second badge column, and this row already
 * retired one.
 *
 * Built from views rather than an SVG or an icon font, like `TabIcon`: this
 * project has neither, and a head over a clipped circle costs no dependency.
 * The shoulders are a full circle clipped to its top half by the parent, which
 * keeps the outline weight even all the way round the arch — an arch drawn with
 * corner radii leaves a visible flat along the bottom.
 */
import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Side. 40 is what a headshot wants beside a 15pt name over two more
 * lines — big enough to read as a portrait rather than as an icon, and the
 * same width as the lineup's badge column, so the two screens' names still
 * start at the same x.
 */
export const AVATAR_SIZE = 40;

/**
 * Corner radius for a given side, so the frame reads the same at every size.
 * `Radius.chip` is the floor: below it the shape stops being a rounded square
 * and starts being a square.
 */
function frameRadius(size: number): number {
  return Math.max(Radius.chip, Math.round(size * 0.2));
}

/**
 * The figure ALONE, with no well around it.
 *
 * Split out because the collection card's photo region is already a frame — a
 * full-bleed band across the top of the card — and nesting `PlayerAvatar`
 * inside it would have drawn a rounded box inside a rounded box, which reads as
 * a thumbnail pasted onto a card rather than as the card's own picture area.
 * The card supplies the frame; this supplies what stands in it.
 *
 * `height` is the figure's total height, so a caller sizes it against the space
 * it has rather than against a notional avatar diameter. Everything else is a
 * proportion of that, and the proportions are the same ones the row's avatar
 * uses — one silhouette in the app, at two scales.
 */
export function PlayerSilhouette({ height, color }: { height: number; color: string }) {
  /* The same 0.28 / 0.62 of a SQUARE the avatar draws, restated against height:
     the figure's own box is 0.62 tall where the avatar's is 1.0, so a head that
     is 0.28 of the square is 0.45 of the figure. Derived rather than re-picked,
     so the two cannot drift apart. */
  const square = height / 0.62;
  const head = square * 0.28;
  const body = square * 0.62;

  return (
    <>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: color }} />
      <View
        style={{ width: body, height: body * 0.42, overflow: 'hidden', marginTop: square * 0.07 }}>
        <View style={{ width: body, height: body, borderRadius: body / 2, backgroundColor: color }} />
      </View>
    </>
  );
}

export function PlayerAvatar({ size = AVATAR_SIZE }: { size?: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The well is one step in from the page, the figure one step in from the
     well: a placeholder must read as an empty frame, not as a portrait of
     nobody, and two quiet steps do that where a single silhouette on the page
     background would sit forward of the name beside it. */
  const well = scheme === 'dark' ? c.surface : c.surfaceSunken;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.well,
        { width: size, height: size, borderRadius: frameRadius(size), backgroundColor: well },
      ]}>
      {/* The figure sits ON the bottom edge rather than floating in the middle:
          that is where a head and shoulders land in a real headshot crop, and
          it is the difference between a frame awaiting a photograph and a
          pictogram of a person. The square is what makes it possible — a
          circle's bottom edge is a point, so anything resting on it has to
          float clear of it instead. */}
      <PlayerSilhouette height={size * 0.62} color={c.textTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  well: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
});
