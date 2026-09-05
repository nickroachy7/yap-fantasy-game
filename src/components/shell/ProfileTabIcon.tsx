/**
 * The Profile tab's icon, which is the manager's own logo once they have set
 * one.
 *
 * ---------------------------------------------------------------------------
 * IT FALLS BACK TO THE GLYPH, NOT TO INITIALS
 * ---------------------------------------------------------------------------
 *
 * Everywhere else in the app a missing logo becomes two letters in a circle,
 * because everywhere else the thing beside it is a NAME and the placeholder is
 * standing in for a picture of a person.
 *
 * The bottom bar is four drawn glyphs on a 24pt grid. Two letters down there
 * would be the one item in the bar made of text, at a size where a two-letter
 * monogram is a smudge, and it would break the hollow/solid convention that
 * carries the active state for a reader who cannot use tint — see `NavIcon`.
 * So: a picture if there is one, and otherwise exactly the bar this app already
 * has.
 *
 * ---------------------------------------------------------------------------
 * THE RING IS THE FOCUS STATE
 * ---------------------------------------------------------------------------
 *
 * A photograph cannot go hollow, so the shape cannot carry focus the way the
 * other three tabs' do. The ring does instead: it takes the bar's own active
 * tint when this tab is selected and the inactive one when it is not, which is
 * a weight change as well as a colour change and therefore survives greyscale.
 *
 * `color` is passed straight through from the navigator rather than read from
 * the palette, so the ring is the same ink as the label under it — including
 * on the glass, where the bar tints itself against what is behind it.
 */
import { Image } from 'expo-image';
import { StyleSheet, type ColorValue } from 'react-native';

import { NavIcon } from '@/components/icons/NavIcon';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { teamLogoUrl } from '@/lib/team-logo';
import type { TabIconName } from '@/components/shell/TabIcon';

export function ProfileTabIcon({
  name,
  color,
  focused,
  size = 24,
}: {
  name: TabIconName;
  /* Whatever the navigator hands its `tabBarIcon` — which is `ColorValue`, not
     `string`, because a tint may be a platform colour object. It is only ever
     passed straight back into a style, so it never needs to be one. */
  color: ColorValue;
  focused: boolean;
  size?: number;
}) {
  const { session } = useAuth();
  const { logo } = usePlayer();
  const url = session ? teamLogoUrl(session.user.id, logo) : null;

  if (!url) {
    return <NavIcon name={name} color={color as string} focused={focused} size={size} />;
  }

  return (
    <Image
      source={{ uri: url }}
      /* The label under it already says "Profile", so the picture adds nothing
         a screen reader needs and repeating the word would have the tab
         announce itself twice. */
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.logo,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          /* Heavier when selected — see the header. 1 to 1.75 is the smallest
             step that is legible at 24pt without the ring starting to eat the
             picture inside it. */
          borderWidth: focused ? 1.75 : 1,
        },
      ]}
      contentFit="cover"
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  logo: { overflow: 'hidden' },
});
