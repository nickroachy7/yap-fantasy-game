/**
 * The row of icon-and-label actions that sits at the top of a browsing screen.
 *
 * It is one control doing two jobs, which is why it exists at all: on a phone
 * the Players and Collection screens had FIVE stacked rows of furniture — a
 * segmented control naming the sub-pages, a search field, a position strip, a
 * tier strip, a sort strip — that between them ate about a third of the screen
 * before a single player appeared. Folding them into one bar gives the list
 * back its screen and, more importantly, makes every browsing page read as the
 * same kind of place: the same bar in the same position, with the same position
 * chips beneath it.
 *
 * WHAT IT IS NOT. It is not a general control strip. It carried a screen's
 * filters for one commit and that was wrong for a reason worth writing down:
 * the bar is the same object on every page of a section, so anything page-
 * specific in it changes its size and item count as you move between pages —
 * the Collection read as three items on Sets and seven on Inventory, and the
 * "tabs" appeared to jump around while you were using them. Filters are chips
 * now, on their own line, where a page may have as many or as few as it likes.
 *
 * WIDE WEB DROPS THE LINKS. The rail already lists every sub-page as a row, so
 * repeating them here would put the same navigation on screen twice. Filters
 * stay, because the rail has no opinion about those. Callers mark the links
 * with `nav: true` and pass `wide`; `SectionNav` is what supplies them.
 *
 * HOW THE ACTIVE ITEM IS MARKED, and what it used to be.
 *
 * The glyph fills and both glyph and label go to the app's gold. There is no
 * box. The selected cell was a raised tile — `background` on the tray's
 * `surface`, with a hairline — and it was a lot of furniture to say one word:
 * on a three-item bar the box was the loudest thing on the screen, and it made
 * the strip read as three buttons rather than as one control with a position in
 * it. Colour carries it faster and survives being small, where a few points of
 * lightness between two greys does not.
 *
 * COLOUR IS NOT THE ONLY SIGNAL — the glyph still goes solid, so the state is
 * legible without separating the two hues. Do not drop that half. See
 * `selectionAccent`, which both this and the segmented control read, so the two
 * cannot drift apart again.
 */
import { ScrollView, StyleSheet, Pressable, Text, View, type ColorValue } from 'react-native';

import { Colors, Radius, selectionAccent, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ActionIconName =
  | 'search'
  | 'trend'
  | 'sort'
  | 'available'
  | 'tiers'
  | 'shop'
  | 'sets'
  | 'inventory'
  | 'directory'
  | 'standings'
  | 'scoring';

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
  const accent = selectionAccent(scheme);

  const shown = wide ? actions.filter((a) => !a.nav) : actions;
  if (shown.length === 0) return null;

  return (
    /* The bar SCROLLS when it has to.
     *
     * Items grow to share the width when they fit — five cells of equal size
     * read as one control — and stop shrinking at 62pt, which is what "AVAILABLE"
     * needs at 9pt. A Collection page carries seven items (three pages plus four
     * facets) and that is 470pt of content in a 343pt phone: without the scroll
     * the last two labels ellipsised into nothing, and with a hard cap on the
     * item count the seventh would simply have been unreachable. */
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      /* `flexGrow: 0`, and it is load-bearing. React-native-web gives every
         ScrollView `flexGrow: 1, flexShrink: 1` by default, so inside a column
         that has room to spare — a `scroll={false}` screen whose content is
         short, e.g. Sets — the bar grew to fill the WHOLE page and its active
         item rendered as a 370pt block. Nothing errored; the bar just quietly
         became the page. */
      style={styles.scroll}
      contentContainerStyle={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}>
      {shown.map((a) => (
        <Pressable
          key={a.key}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(a.active) }}
          accessibilityLabel={a.label}
          /* No background and no border on either state — see the header. The
             cell is a hit target now, nothing more, which is why both states
             share one style and the row cannot change height as the selection
             moves. */
          style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}>
          <ActionIcon
            name={a.icon}
            color={a.active ? accent : c.textSecondary}
            focused={Boolean(a.active)}
          />
          <Text
            numberOfLines={1}
            style={[Type.micro, styles.label, { color: a.active ? accent : c.textTertiary }]}>
            {a.label.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
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

    case 'inventory':
      /* Two cards, one behind the other — what you own, which is the same
         object the tab bar draws for the section, said smaller. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={{
              position: 'absolute',
              left: 3 * u,
              top: 4 * u,
              width: 9 * u,
              height: 13 * u,
              borderRadius: 2 * u,
              borderWidth: stroke,
              borderColor: color,
              transform: [{ rotate: '-10deg' }],
            }}
          />
          <View
            style={[
              {
                position: 'absolute',
                right: 3 * u,
                top: 5 * u,
                width: 9 * u,
                height: 13 * u,
                borderRadius: 2 * u,
              },
              skin,
            ]}
          />
        </View>
      );

    case 'directory':
      // A list of names: three rows, each a marker and a line.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 3 * u }}>
            {[13, 10, 12].map((w, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 * u }}>
                <View style={[{ width: 4 * u, height: 4 * u, borderRadius: 1.5 * u }, skin]} />
                <View style={bar(w, 2)} />
              </View>
            ))}
          </View>
        </View>
      );

    case 'standings':
      // A podium: the middle column tallest, which is the one thing a
      // leaderboard glyph has to say.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 * u }}>
            {[8, 14, 11].map((h, i) => (
              <View
                key={i}
                style={[{ width: 4 * u, height: h * u, borderRadius: 1.5 * u }, skin]}
              />
            ))}
          </View>
        </View>
      );

    case 'scoring':
      // A rules sheet: a page with lines on it.
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={[
              {
                width: 14 * u,
                height: 17 * u,
                borderRadius: 2.5 * u,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2.5 * u,
              },
              skin,
            ]}>
            {[8, 6, 8].map((w, i) => (
              <View
                key={i}
                style={{
                  width: w * u,
                  height: 1.5 * u,
                  borderRadius: 1 * u,
                  // On the solid state the lines are cut OUT of the page, which
                  // is the only way a filled rectangle can still read as one.
                  backgroundColor: focused ? '#00000000' : color,
                }}
              />
            ))}
          </View>
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
  scroll: { flexGrow: 0, flexShrink: 0 },
  bar: {
    flexDirection: 'row',
    // Grows to the full width when the items do not fill it, so the bar is a
    // bar rather than a huddle of buttons on the left; the items inside it are
    // centred rather than left-packed, because a capped item cannot fill it.
    flexGrow: 1,
    justifyContent: 'center',
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  /* Equal widths rather than hugging their labels: five cells of the same size
     read as one control, where five different widths read as a sentence of
     buttons.
     
     THE MAXIMUM IS BACK, AND WIDER THAN THE ONE THAT FAILED.
     
     A note here used to say there was no cap, on the grounds that a 104pt one
     left dead tray at either end of a three-item bar. That reasoning also
     asserted "Leaderboard was never two", which was simply wrong — it is
     Standings and Scoring — so the case the cap existed to guard was live the
     whole time, and the Leaderboard's two cells each took half a phone while
     the Players' three took a third. The same control was a different size in
     every tab.
     
     132 is measured, not chosen: three items on a 375pt phone have 327pt to
     share after the page gutter, the tray padding and the gaps — 109 each — so
     three and above still FILL and the old complaint cannot come back. Only a
     two-item bar is capped, which is the one that sprawled. */
  /* EXACTLY TWO CHILDREN, glyph over label, and that is a constraint rather
     than a description. A cell is a flex column in a flex row, so a third line
     in ONE cell stretches every cell in the bar: the "Soon" badge Sets used to
     carry made the Collection strip 66pt where every other section's was 55,
     and — because these cells centre their content — pushed Inventory and Shop
     visibly lower than the same items elsewhere. Anything that wants to say
     more about a destination belongs in the rail, which is a list of rows, or
     on the destination itself. */
  item: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 62,
    maxWidth: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.control,
  },
  label: { letterSpacing: 0.4 },
  box: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
