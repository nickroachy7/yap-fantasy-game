/**
 * The row of icon-and-label actions that sits at the top of a browsing screen.
 *
 * It is one control doing two jobs, which is why it exists at all: on a phone
 * the Players and Collection screens had four separate stacked control rows —
 * a search field, a position strip, a tier strip, a sort strip — that between
 * them ate about a third of the screen before a single player appeared. Folding
 * the four into one bar of five targets gives the list back its screen and,
 * more importantly, makes the two pages read as the same kind of place: the
 * same bar in the same position, with the same position chips beneath it.
 *
 * Items are of two kinds and the bar does not distinguish them visually,
 * because to a reader they are the same gesture — "show me the X view":
 *
 *   toggle — reveals a control that was folded away (search, sort, tiers), or
 *            flips a filter on and off (available).
 *   link   — goes to a sibling page (Trend, Shop, Sets).
 *
 * WIDE WEB DROPS THE LINKS. The rail already lists every sub-page as a row, so
 * repeating them here would put the same navigation on screen twice — the same
 * rule `SubNav` follows. Filters stay, because the rail has no opinion about
 * those. Callers mark the links with `nav: true` and pass `wide`.
 *
 * Active is not colour alone: the glyph goes solid, the label goes to full
 * contrast, and the cell gains a fill. Same three signals the tab bar uses, so
 * the two bars cannot be read as meaning different things by the same person.
 */
import { StyleSheet, Pressable, Text, View, type ColorValue } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ActionIconName =
  | 'search'
  | 'trend'
  | 'sort'
  | 'available'
  | 'tiers'
  | 'shop'
  | 'sets';

export type Action = {
  key: string;
  label: string;
  icon: ActionIconName;
  active?: boolean;
  /** A link to a sibling page. Dropped on wide web — see the header. */
  nav?: boolean;
  onPress: () => void;
};

export function ActionBar({ actions, wide }: { actions: Action[]; wide: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const shown = wide ? actions.filter((a) => !a.nav) : actions;
  if (shown.length === 0) return null;

  return (
    <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}>
      {shown.map((a) => (
        <Pressable
          key={a.key}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(a.active) }}
          accessibilityLabel={a.label}
          style={({ pressed }) => [
            styles.item,
            a.active ? { backgroundColor: c.backgroundSelected } : null,
            pressed ? styles.pressed : null,
          ]}>
          <ActionIcon
            name={a.icon}
            color={a.active ? c.text : c.textSecondary}
            focused={Boolean(a.active)}
          />
          <Text
            numberOfLines={1}
            style={[Type.micro, styles.label, { color: a.active ? c.text : c.textTertiary }]}>
            {a.label.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Drawn, not imported — the house rule `TabIcon` sets out at length: this
 * project has no icon font and no SVG runtime, and every glyph in it is
 * composed from rounded rectangles and circles in a fixed box so they share a
 * weight and cannot drift.
 *
 * Separate from `TabIcon` rather than added to it. That set is the five
 * SECTIONS of the app, drawn at 24pt in the tab bar and the rail; these are
 * verbs inside a page, drawn at 18. Merging them would put "sort" in a union
 * whose whole job is naming a destination.
 */
const STROKE = 1.6;

function ActionIcon({
  name,
  color,
  focused,
  size = 18,
}: {
  name: ActionIconName;
  color: ColorValue;
  focused: boolean;
  size?: number;
}) {
  const u = size / 24;
  const stroke = Math.max(1, STROKE * u);
  const skin = focused
    ? { backgroundColor: color }
    : { borderWidth: stroke, borderColor: color, backgroundColor: 'transparent' as const };
  const box = [styles.box, { width: size, height: size }];
  const bar = (w: number, h = 2) => ({
    width: w * u,
    height: h * u,
    borderRadius: 1 * u,
    backgroundColor: color,
  });

  switch (name) {
    case 'search':
      /* A lens up in the corner and its handle below it, both placed
         absolutely: laid out in flow the handle sat ON the lens, and once the
         lens filled on selection the whole glyph read as a plain dot. The
         handle is a 2pt bar, which cannot hold a 1.6pt outline and read as
         anything, so it stays solid in both states. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={[
              {
                position: 'absolute',
                top: 3 * u,
                left: 3 * u,
                width: 12 * u,
                height: 12 * u,
                borderRadius: 6 * u,
              },
              skin,
            ]}
          />
          <View
            style={{
              position: 'absolute',
              right: 3.5 * u,
              bottom: 4 * u,
              width: 7 * u,
              height: 2 * u,
              borderRadius: 1 * u,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'trend':
      /* A rising line with a head. Three ascending bars would have been the
         obvious reuse of the leaderboard glyph, and would have meant "chart"
         where this means "moving". */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[bar(16), { transform: [{ rotate: '-32deg' }] }]} />
          <View
            style={{
              position: 'absolute',
              right: 2 * u,
              top: 3 * u,
              width: 7 * u,
              height: 7 * u,
              borderTopWidth: 2 * u,
              borderRightWidth: 2 * u,
              borderColor: color,
              borderTopRightRadius: 1.5 * u,
            }}
          />
        </View>
      );

    case 'sort':
      // Descending bars: the shape of an ordered list, not of a menu.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 3 * u, alignItems: 'flex-start' }}>
            <View style={bar(16)} />
            <View style={bar(11)} />
            <View style={bar(6)} />
          </View>
        </View>
      );

    case 'available':
      // A slot with a plus: something you could add, which is what an
      // unrostered player is.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={[
              { width: 15 * u, height: 15 * u, borderRadius: 5 * u, alignItems: 'center', justifyContent: 'center' },
              skin,
            ]}>
            <View
              style={{
                position: 'absolute',
                width: 8 * u,
                height: 2 * u,
                borderRadius: 1 * u,
                backgroundColor: focused ? '#00000000' : color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: 2 * u,
                height: 8 * u,
                borderRadius: 1 * u,
                backgroundColor: focused ? '#00000000' : color,
              }}
            />
          </View>
        </View>
      );

    case 'tiers':
      /* Stacked ranks, widest at the bottom — the same idea the tier pips
         carry, at a size where pips would be mud. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 2.5 * u, alignItems: 'center' }}>
            <View style={[{ width: 6 * u, height: 4 * u, borderRadius: 1 * u }, skin]} />
            <View style={[{ width: 11 * u, height: 4 * u, borderRadius: 1 * u }, skin]} />
            <View style={[{ width: 16 * u, height: 4 * u, borderRadius: 1 * u }, skin]} />
          </View>
        </View>
      );

    case 'shop':
      // A bag: body plus handle.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={{
              width: 8 * u,
              height: 5 * u,
              borderTopLeftRadius: 4 * u,
              borderTopRightRadius: 4 * u,
              borderWidth: stroke,
              borderBottomWidth: 0,
              borderColor: color,
              marginBottom: -1 * u,
            }}
          />
          <View style={[{ width: 16 * u, height: 11 * u, borderRadius: 3 * u }, skin]} />
        </View>
      );

    case 'sets':
      /* Four cells with one filled: a set is a collection with a hole in it,
         and the hole is the whole point of the screen. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 2.5 * u }}>
            {[0, 1].map((row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 2.5 * u }}>
                {[0, 1].map((col) => {
                  const filled = focused || (row === 0 && col === 0);
                  return (
                    <View
                      key={col}
                      style={[
                        { width: 7 * u, height: 7 * u, borderRadius: 2 * u },
                        filled
                          ? { backgroundColor: color }
                          : { borderWidth: stroke, borderColor: color },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  /* Equal widths rather than hugging their labels: five cells of the same size
     read as one control, where five different widths read as a sentence of
     buttons. */
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: Spacing.one + 2,
    borderRadius: 9,
  },
  label: { letterSpacing: 0.4 },
  box: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
