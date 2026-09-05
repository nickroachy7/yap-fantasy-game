/**
 * A manager's team logo, and the initials that stand in until there is one.
 *
 * ---------------------------------------------------------------------------
 * A CIRCLE, AND THE ONE IN THIS APP THAT IS ALLOWED TO BE
 * ---------------------------------------------------------------------------
 *
 * `PlayerAvatar` argues at length that a portrait slot should be a rounded
 * SQUARE — a circle eats the corners of a headshot, and every other container
 * on these screens is a rounded rectangle. That argument is about a PHOTOGRAPH
 * of a person, cropped by us, that we do not have.
 *
 * This is the opposite object in every respect that matters. It is a mark, not
 * a portrait; it is composed by the manager inside a square cropper they can
 * see; and it is the one thing on the screen that is theirs rather than the
 * league's. Round is what a team badge is, everywhere, and the distinction is
 * useful rather than inconsistent: a circle in this app means a PERSON, and a
 * rounded square means a player card. The two never have to be told apart by
 * reading them.
 *
 * ---------------------------------------------------------------------------
 * INITIALS ARE THE FALLBACK, AND THEY WERE ALREADY THE THING HERE
 * ---------------------------------------------------------------------------
 *
 * Every site this replaces — the rail, the account page, the friends list, a
 * manager's profile, a contest's field — was already drawing `initialsOf(name)`
 * in a bordered circle. So the fallback is not a downgrade invented for this
 * feature; it is exactly what shipped, and a manager who never uploads anything
 * sees no change at all.
 *
 * THE SAME PLACEHOLDER FOR "no logo" AND FOR "not fetched yet", deliberately.
 * The batch read behind `useTeamLogo` settles a frame or two after the row
 * paints, and two different placeholders would mean a visible flicker on every
 * list for every manager without a picture — which is most of them, for a while.
 *
 * ---------------------------------------------------------------------------
 * THE OWNER PASSES THEIR OWN MARK IN
 * ---------------------------------------------------------------------------
 *
 * `mark` overrides the lookup. `PlayerContext` already holds the signed-in
 * manager's logo state and updates it the instant an upload returns, so the
 * account page and the rail and the tab bar read from there rather than waiting
 * on a network round trip to be told about a picture this device just made.
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '@/components/shell/AppHeader';
import { useTeamLogo } from '@/components/shell/use-team-logos';
import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { teamLogoUrl, type LogoMark } from '@/lib/team-logo';

export function TeamLogo({
  userId,
  name,
  size = 28,
  /**
   * The ring. Defaults to the page's hairline border, which is what every
   * circle this replaces already drew; the account page passes its accent so
   * the manager's own logo is the one framed in the colour of their tier.
   */
  borderColor,
  /** Skip the lookup — see the header. */
  mark,
  /**
   * The placeholder's well and lettering, for a caller that is not on the
   * page's own background.
   *
   * The wide rail is the only one: it is permanently dark whatever the app's
   * scheme is, so the themed `surfaceSunken` behind two themed letters would be
   * a light chip on a black column in light mode. It passes its own pair.
   *
   * These do NOT touch the image branch. A photograph needs no help from the
   * palette, and the ring is `borderColor` either way.
   */
  background,
  textColor,
}: {
  userId: string | null | undefined;
  name: string;
  size?: number;
  borderColor?: string;
  mark?: LogoMark;
  background?: string;
  textColor?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Called unconditionally, and cheap when `mark` is supplied: passing null
     registers no id and issues no request. Hooks cannot be skipped on a
     condition, and this is the shape that obeys that without a wasted read. */
  const fetched = useTeamLogo(mark ? null : userId);
  const url = userId ? teamLogoUrl(userId, mark ?? fetched) : null;

  const ring = borderColor ?? c.border;
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: ring,
  };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        /* HIDDEN, exactly as the placeholder below is. Every caller draws the
           manager's name in text beside this, so a labelled image is the row
           saying the same name twice to a screen reader. The one surface that
           shows a logo with no name next to it is the bottom bar, and that has
           its own component with its own answer — see `ProfileTabIcon`. */
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.frame, frame]}
        /* `cover`, because the manager cropped this square themselves in the
           picker and a square in a circle loses only the corners they chose to
           leave. `contain` would letterbox their crop inside its own frame. */
        contentFit="cover"
        transition={120}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.frame,
        styles.placeholder,
        frame,
        { backgroundColor: background ?? c.surfaceSunken },
      ]}>
      <Text
        style={[
          Type.micro,
          {
            color: textColor ?? c.textSecondary,
            /* Scaled off the diameter rather than picked per caller: this is
               drawn at 28, 40, 56 and 64pt across the app, and a fixed size
               that reads right in a leaderboard row is a smudge in the account
               page's frame. 0.34 keeps two letters clear of the ring at all
               four. */
            fontSize: Math.round(size * 0.34),
            lineHeight: Math.round(size * 0.4),
            letterSpacing: size >= 40 ? 0.4 : 0.8,
          },
        ]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
