/**
 * The card a list row sits in — a contest on the lobby, a set on the sets board.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TWO LISTS SHARE ONE SHELL
 * ---------------------------------------------------------------------------
 *
 * They already looked nearly alike and were not: `ContestCard` drew a border
 * per card, while the sets board drew ONE border around a whole group and
 * separated the rows inside it with hairlines. Same radius, same corner, two
 * different objects — a stack of cards on one page and a bordered table on the
 * other.
 *
 * The stack is the better of the two, and not only because it is what the
 * contests page already does. A divided table says its rows are parts of one
 * thing; a set is not part of the set above it, it is a separate errand with
 * its own progress and its own reward. Cards say that, and they say it the same
 * way on both pages, which is the point of putting the shell here rather than
 * copying six lines of style.
 *
 * ---------------------------------------------------------------------------
 * PRESSABLE ONLY WHEN IT LEADS SOMEWHERE
 * ---------------------------------------------------------------------------
 *
 * A contest card is pressable as a whole — `ContestCard`'s own note explains
 * why a button inside would compete with the terms for a corner already saying
 * something. A set row is NOT: it carries its own claim button beside a
 * pressable body, so the shell has to be an inert `View` there or the row would
 * be a button inside a button, which React rejects on web outright.
 *
 * So `onPress` is optional and the element changes with it, rather than a
 * `Pressable` that sometimes does nothing.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RowCard({
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  /** Omit for a card that holds its own controls — see the note above. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* `borderStrong` rather than `border`, which is what separates a card from
     the PAGE rather than from its neighbours. The sets board used a hairline
     because its line was an internal divider inside one container; a card's
     edge is the whole boundary of the object and carries the heavier value.
     ---------------------------------------------------------------------------
     THE FILL IS NOT REDUNDANT, and the corners are why. Carried over from
     `ContestCard`, where it was learned the expensive way.
     `overflow: 'hidden'` clips the content to the rounded outline, and a clip
     is antialiased — so along each corner's curve the fill fades out over about
     a pixel while the border is drawn at full strength on top of it. Between
     the two there was a hair of TRANSPARENCY, and what showed through it was
     the page: four corners with a dark bite taken out of the material just
     inside the line. Barely visible at rest, and obvious the moment the card
     moved.
     One opaque fill behind the whole card and there is nothing to show through.
     It matters for any child that paints to the edge — the contest card's zones
     do. */
  const edge = { borderColor: c.borderStrong, backgroundColor: c.surface };

  if (!onPress) {
    return <View style={[styles.card, edge, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, edge, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* `overflow: 'hidden'` is load-bearing rather than tidy: the zones inside a
     contest card paint their own backgrounds to the edge, and without the clip
     they square off the corners the border has just rounded. */
  card: { borderWidth: 1, borderRadius: Radius.panel, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
});
