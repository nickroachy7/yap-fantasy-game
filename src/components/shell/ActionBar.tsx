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

import { ActionDiameter, Colors, Radius, selectionAccent, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { horizontalStrip } from '@/components/ui/scroll-strip';

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
  /**
   * Drawn as a round button AFTER the tray rather than as a cell inside it.
   *
   * The tray is a set of peers with a position in it — the highlight says which
   * one you are on, and every cell is somewhere you can BE. Packs is not: it is
   * an errand, not a room. As a cell it looked like a fifth board you navigate
   * to, and then had no highlight of its own to show once you were "on" it.
   *
   * NOT THE SAME QUESTION AS `takeover`, though it is tempting — this was
   * derived from it for one revision and turned Search into a circle, which is
   * wrong: Search is a third way to browse the players board and belongs beside
   * Trend and Leaders. `sections.ts` declares the two independently and says
   * why at length.
   *
   * The geometry is `ToggleButton`'s grown to `ActionDiameter` — the app
   * already has a round-control language and this is the same object, just the
   * loudest one.
   */
  detached?: boolean;
  onPress: () => void;
};

export function ActionBar({ actions, wide }: { actions: Action[]; wide: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  const shown = wide ? actions.filter((a) => !a.nav) : actions;
  if (shown.length === 0) return null;

  /* The tray holds the places; anything detached sits outside it. Split rather
     than sorted, so a takeover declared FIRST in `sections.ts` — Search is —
     still lands at the end of the row, where the app's other round controls
     already live. */
  const tray = shown.filter((a) => !a.detached);
  const detached = shown.filter((a) => a.detached);

  return (
    <View style={styles.row}>
      {/* The tray HUGS its cells and the row pins it left, so it is only ever
       * as wide as the words in it.
       *
       * It used to fill the row and share that width between equal cells. That
       * was right when a Collection bar carried seven items, and wrong the day
       * the takeovers moved out: every section is a TWO-item tray now, two
       * cells wanted 159pt each, `maxWidth` capped them at 132, and centring
       * the remainder left 54pt of empty tray split across the two ends. The
       * cap could not be lifted to close it — 132 was measured precisely
       * because a two-item bar at half a phone each was the one that sprawled —
       * so the fix is the other direction: stop claiming width the cells do not
       * want.
       *
       * IT STILL SCROLLS WHEN IT HAS TO. `flexShrink` lets a tray wider than
       * the row give way rather than push the detached buttons off the edge,
       * and `horizontalStrip` stops it bouncing when there is nowhere to go —
       * a horizontal ScrollView bounces by default whether or not it has
       * anywhere to scroll, which made every section nav feel like a carousel
       * with nothing in it. See that file. */}
      <ScrollView
        horizontal
        {...horizontalStrip}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Fills whatever width the detached buttons leave. See `styles.scroll`.
        style={styles.scroll}
        contentContainerStyle={[styles.bar, { backgroundColor: c.surface, borderColor: c.border }]}>
        {tray.map((a) => (
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

      {detached.length > 0 ? (
        <View style={styles.detachedGroup}>
          {detached.map((a) => (
            <DetachedAction key={a.key} action={a} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * An errand, as a round button beside the tray.
 *
 * FILLED IN THE APP'S GOLD rather than outlined like the inventory's filter
 * buttons, and that is the one place this departs from `ToggleButton`. Those
 * four are toggles whose fill IS their state, so an outlined resting state has
 * something to mean. This one has no state — it opens a sheet — so an outline
 * would read as a switch that is permanently off, and the fill is free to do
 * the other job instead: the circle carries a glyph and no label, and gold is
 * what makes it the thing to press rather than a mark nobody labelled.
 *
 * IT IS THE TALLEST THING IN THE ROW AFTER THE TRAY, at `ActionDiameter`
 * rather than the `ControlDiameter` the filter buttons use. A 32pt disc beside
 * a 53pt tray read as floating in a row built for something else; 44 closes
 * most of that gap and takes the width it needs off the tray, which has it to
 * give — see the note on `item`.
 */
function DetachedAction({ action }: { action: Action }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={({ pressed }) => [
        styles.detached,
        { backgroundColor: accent },
        pressed ? styles.pressed : null,
      ]}>
      {/* `focused` so the glyph is the SOLID variant: it sits on the accent,
          where a 1.6pt outline in the same dark ink reads as a smudge. */}
      <ActionIcon name={action.icon} color={c.background} focused size={20} />
    </Pressable>
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
 *
 * EXPORTED, because the bar is no longer the only thing that draws these verbs.
 * The collection's filter buttons are `search`, `tiers`, `sort` and `available`
 * — the exact four this set was drawn for — and a second hand-rolled set of
 * glyphs meaning the same four things is precisely the drift this file's own
 * header warns about.
 */
const STROKE = 1.6;

export function ActionIcon({
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
  /* The tray and whatever sits beside it. `alignItems: 'center'` is what keeps
     a 32pt button centred against a taller tray rather than stretched to its
     height, which is the default in a row. */
  /* The tray, then the detached buttons. No `justifyContent` is needed: the
     tray takes every point the buttons do not, so it ends exactly one gap to
     their left whatever the width. The buttons are still grouped into one node
     so that gap stays theirs rather than opening up between them. */
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  detachedGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Takes the width the detached buttons leave, so the tray runs from the
     gutter to one gap short of them.

     `flexGrow: 0` used to live here as a guard, and the reason is worth
     keeping: react-native-web gives every ScrollView `flexGrow: 1,
     flexShrink: 1`, so inside a COLUMN with room to spare — a `scroll={false}`
     screen whose content is short, e.g. Sets — the bar grew to fill the whole
     page and its active item rendered as a 370pt block. Nothing errored; the
     bar just quietly became the page.

     It is safe here only because the parent is a ROW, where these values govern
     the horizontal axis — the one the tray should fill — and height comes from
     the row's `alignItems`. Do NOT lift this back out of the row without
     putting `flexGrow: 0` back with it. */
  scroll: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Grows with the ScrollView above it, so the tray is a bar rather than a
    // huddle of cells at one end of one.
    flexGrow: 1,
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  /* GLYPH OVER THE WORD, and the cells SHARE the tray with no cap on how wide
     one may get.

     There was a `maxWidth: 132`, and dropping it is the deliberate part. It was
     measured for a bar with no button beside it: two uncapped cells each took
     half a phone, which sprawled, so the cap held them in and centred the
     remainder. The takeovers moving out changed the sum — the tray now ends one
     gap short of a 32pt button — but the cap did not move with it, so a
     two-item tray carried 54pt of empty tray split across its two ends. Capping
     and centring is the wrong shape for a bar that already stops short of the
     row: the dead space reads as the control failing to reach the button beside
     it rather than as breathing room.

     So the cells fill what the tray has. On a 402pt phone that is ~155pt each
     for Collection and Players, and ~161 for Leaderboard, which has no button
     to leave room for.

     A FLAT VERSION WAS TRIED AND REVERTED — glyph beside the word, hugging its
     labels, ~26pt instead of ~45. It bought real height back on three screens
     and gave the cells unequal widths to do it. The height was not the problem
     being solved.

     EXACTLY TWO CHILDREN, glyph over label, and that is a constraint rather
     than a description. A cell is a flex column in a flex row, so a third line
     in ONE cell stretches every cell in the bar: the "Soon" badge Sets used to
     carry made the Collection strip 66pt where every other section's was 55,
     and — because these cells centre their content — pushed its siblings
     visibly lower than the same items elsewhere. Anything that wants to say
     more about a destination belongs in the rail, which is a list of rows, or
     on the destination itself. */
  item: {
    flexGrow: 1,
    flexBasis: 0,
    // Still a floor: it is what "AVAILABLE" needs at 9pt, and it is what lets
    // the bar scroll rather than ellipsise if a section ever carries enough
    // items to overflow the row.
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.control,
  },
  label: { letterSpacing: 0.4 },
  detached: {
    width: ActionDiameter,
    height: ActionDiameter,
    borderRadius: ActionDiameter / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  box: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
