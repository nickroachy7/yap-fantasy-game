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
 * somewhere else to say the position. Drawing the SLOT — a circle at the size a
 * headshot would be, with a generic figure in it — reserves the space, so the
 * day a licensed image arrives it drops in without a row moving. A row designed
 * around a 26pt badge would have had to be redesigned around a 40pt portrait.
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

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Diameter. 40 is what a headshot wants beside a 15pt name over two more
 * lines — big enough to read as a portrait rather than as an icon, and the
 * same width as the lineup's badge column, so the two screens' names still
 * start at the same x.
 */
export const AVATAR_SIZE = 40;

export function PlayerAvatar({ size = AVATAR_SIZE }: { size?: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The well is one step in from the page, the figure one step in from the
     well: a placeholder must read as an empty frame, not as a portrait of
     nobody, and two quiet steps do that where a single silhouette on the page
     background would sit forward of the name beside it. */
  const well = scheme === 'dark' ? c.surface : c.surfaceSunken;
  const ink = c.textTertiary;

  const head = size * 0.3;
  const body = size * 0.56;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.well,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: well },
      ]}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: ink }} />
      <View style={{ width: body, height: body * 0.42, overflow: 'hidden', marginTop: size * 0.06 }}>
        <View
          style={{ width: body, height: body, borderRadius: body / 2, backgroundColor: ink }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  well: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
