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

import { Icon } from '@/components/icons/Icon';
import {
  cards as cardsGlyph,
  contests as contestsGlyph,
  filters as filtersGlyph,
  lineup as lineupGlyph,
  pack as packGlyph,
  search as searchGlyph,
  sets as setsGlyph,
  standings as standingsGlyph,
  tierGold,
} from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import {
  ActionDiameter,
  Colors,
  Radius,
  selectionAccent,
  Spacing,
  Type,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { horizontalStrip } from '@/components/ui/scroll-strip';

export type ActionIconName =
  | 'lineup'
  | 'contests'
  | 'search'
  | 'select'
  | 'trend'
  | 'sort'
  | 'filters'
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
   * IT IS NO LONGER A CIRCLE. It is a filled pill carrying its own word, at
   * the tray's height — see `DetachedAction`, which argues the reversal. What
   * `detached` still means is unchanged: outside the tray, not a place.
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
    /* Pinned RIGHT when there is no tray, so a lone door sits where the app's
       other trailing controls sit rather than at the gutter. With a tray it is
       inert: the tray takes the width and pushes the buttons to that edge
       anyway. */
    <View style={[styles.row, tray.length === 0 && styles.rowDetachedOnly]}>
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
      {/* NOT DRAWN EMPTY. The tray paints its own surface and border, so a
          section whose only child is detached — Collection and Sets, which have
          Packs and nothing else — would otherwise show an empty pill sitting
          beside the round button, which reads as a control that failed to
          load rather than as a section with one action. */}
      {tray.length === 0 ? null : (
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
      )}

      {detached.length > 0 ? (
        <View style={[styles.detachedGroup, tray.length === 0 && styles.detachedGroupSolo]}>
          {detached.map((a) => (
            <DetachedAction key={a.key} action={a} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * THE PACKS DOOR: a ringed disc at the end of the strip, the tray's own height,
 * carrying the pack's mark and nothing else.
 *
 * ---------------------------------------------------------------------------
 * IT WAS A QUIET CIRCLE, TWICE, AND BOTH ARGUMENTS ARE NOW OVERRULED
 * ---------------------------------------------------------------------------
 *
 * The two notes this replaces are worth stating because they were not wrong
 * about anything except the priority. The first said a saturated disc with a
 * solid glyph was the loudest object in the chrome — brighter than the tab you
 * are actually on, permanent on every page of the section — so it went to
 * `surface` and the hairline, in the tray's own material, and let SHAPE alone
 * carry the distinction: a circle among rectangles is a different kind of
 * object. The second said the accent belongs on the one mark that says an act
 * COSTS something, and that packs merely opens a room; what you spend is
 * decided inside it.
 *
 * Both are consistent design rules and both lost to a product fact: opening
 * packs is the loop this app is built on, and a glyph-only circle in the
 * chrome's own grey is the quietest thing that could possibly be true of it.
 * It named nothing — a small mark, no word — and it ranked itself below two
 * tabs that merely switch which of your own cards you are looking at. When the
 * loudest control on a screen and the most important act on it disagree, the
 * act wins.
 *
 * ---------------------------------------------------------------------------
 * NOT PART OF THE NAV, BUT OF THE SAME FAMILY AS IT
 * ---------------------------------------------------------------------------
 *
 * That is the whole brief and it is narrower than "make it pop". It stays a
 * separate object — its own pill, outside the tray, one gap clear of it, and
 * never carrying the tray's highlight — because it is not a place you can be.
 * But EVERYTHING ELSE IS THE TRAY'S: the same height (see the stretch below),
 * the same corner, an 18pt glyph beside a `Type.micro` label in caps, the same
 * gap between the two. Read it as a cell that was lit and set aside, not as a
 * button somebody dropped in from another screen.
 *
 * WHAT MAKES IT A DOOR IS THE FILL, and only the fill.
 *
 * `selectionAccent` — the app's green, the same one the tray's active cell
 * inks its glyph and word with. Two earlier passes reached further for
 * "different": `Brand.lime`, which says Yap and nothing else and read as a
 * second logo shouting beside the nav, and the packs sheet's gold, which is
 * coherent with the room it opens but is a foreign slab in this row. The
 * answer was the colour already in the row.
 *
 * AT THREE STRENGTHS, not one. A solid accent disc was the version before this
 * and it was too intense — a saturated mid-tone the size of a button, beside a
 * tray of near-black. So: a 16% wash inside (see `wash`), the full accent on a
 * 1pt ring, the full accent on the mark. Same hue, a third of the shout, and
 * the ring is still a harder edge than any other object in the row has, which
 * is what keeps it from receding into chrome.
 *
 * ONE MARK, AND THE SHAPE IS ROUND AGAIN.
 *
 * Two revisions passed through here on the way: "PACKS" in the tray's own caps
 * beside the glyph, and then `+` beside the glyph with the word gone. Both were
 * answering "how do I make it say more", and the pill's real cost was the width
 * — every mark added to it is width taken off a tray that has two words of its
 * own to fit, and a labelled cell in a row of labelled cells reads as a THIRD
 * place, which is the confusion `detached` exists to prevent.
 *
 * So the content went back to what the circle always had: the pack, alone. What
 * changed is the two things that were actually wrong with the circle — it was
 * chrome-grey in the tray's own material, and it floated at 44 in a 38pt row.
 * A round button is not the problem; a round button pretending to be furniture
 * was. This one is a disc the tray's own height, in the app's accent, one gap
 * clear of it.
 *
 * The screen reader hears "Packs" — `accessibilityLabel` is the label, and it
 * is not optional now that no text is drawn.
 *
 * IT MATCHES THE TRAY'S HEIGHT rather than standing at `ActionDiameter`. A 44pt
 * disc beside a 38pt tray was a floating object in a row built for something
 * else; at the tray's height the two read as one control with two parts —
 * places on the left, the door on the right — and the strip gets 6pt shorter,
 * which on a phone is 6pt of the list you came to read. The height is taken by
 * `stretch` and the width by `aspectRatio`, so it follows the tray if the tray
 * ever changes and stays a circle at whatever height it lands on.
 */
export function DetachedAction({ action }: { action: Action }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const accent = selectionAccent(scheme);

  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={({ pressed }) => [
        styles.detached,
        { backgroundColor: wash(accent), borderColor: accent },
        pressed ? styles.pressed : null,
      ]}>
      {/* The mark takes the FULL accent, the same green the ring is drawn in,
          so the button is one colour at three strengths — solid on the edge and
          the drawing, a wash inside. `accessibilityLabel` carries "Packs" for
          anyone who cannot see it; that is not optional now that no text is
          drawn.

          HOLLOW, not `focused`. The solid variant fills the pack's whole
          silhouette, which reads as a blob at this size; outlined, the seam and
          the flap read, and it matches the weight of the ring around it. */}
      <ActionIcon name={action.icon} color={accent} focused={false} size={20} />
    </Pressable>
  );
}

/**
 * The accent at 16%, which is the fill inside the packs ring.
 *
 * A SOLID accent disc was the first answer and it was too much: the green is a
 * saturated mid-tone sized to carry near-black text, and a whole button of it
 * beside a near-black tray was the only thing on the screen anybody could look
 * at. A wash keeps the hue — the button is still unmistakably the green one —
 * and spends the full strength on the ring and the mark, where an edge and a
 * drawing need it.
 *
 * `rgba` rather than a second swatch in `theme.ts`, and deliberately: this is
 * the accent, not a colour of its own, and a named `selectionSoft` would invite
 * everything else to reach for it. It is translucent for the same reason the
 * app's other washes are — it sits over whatever surface it lands on, so it
 * cannot be wrong about the ground beneath it.
 */
function wash(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.16)`;
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

/**
 * The four of these names that have drawn artwork.
 *
 * The header above sets out why this set is CONSTRUCTED rather than imported,
 * and that reasoning still holds for the other ten: they are rectangles and
 * circles on a 24pt grid, they cost no bytes and no dependency, and they
 * survive a native binary too old for `react-native-svg`.
 *
 * These four are different because they name OBJECTS rather than operations. A
 * sort control or a select control is a diagram of an action and geometry says
 * it exactly; an inventory, a set, a shop and a rank are things in the game
 * with a look of their own, and a drawn mark says more about them than a grid
 * of squares can.
 *
 * One drawing each, no idle variant — unlike the bottom bar these never carry
 * focus by shape, because `ActionBar` already marks the active item with a
 * filled pill behind it. See `NavIcon` for the case where focus does need the
 * second artwork.
 */
const DRAWN_ACTIONS: Partial<Record<ActionIconName, Glyph>> = {
  /* `cards`, not `collection`. The two are different pictures of the same
     section: `collection` is the SECTION's mark and belongs to the tab that
     names it, while this cell is the board of cards inside it. Drawing the
     section's own mark on one of its two pages said "Collect" twice and left
     Sets as the only cell that named what it held. */
  inventory: cardsGlyph,
  sets: setsGlyph,
  /* `pack`, not `shop`. A storefront is where you go; a pack is what you come
     back with, and the button is a door to one specific thing rather than to a
     shop with departments. It also stops the round button being the only
     storefront in an app whose every other mark is an object. */
  shop: packGlyph,
  tiers: tierGold,
  contests: contestsGlyph,
  search: searchGlyph,
  lineup: lineupGlyph,
  filters: filtersGlyph,
  standings: standingsGlyph,
};

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
  const drawn = DRAWN_ACTIONS[name];
  if (drawn) {
    return <Icon glyph={drawn} color={String(color)} size={size} focused />;
  }

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

    case 'select':
      /* A CHECKBOX, which is the one glyph in this set whose two states are the
         thing it depicts rather than a fill applied to it. The box is always an
         outline and the TICK is what appears — empty box off, ticked box on —
         so it reads as "choose cards" at rest and "you are choosing" while the
         button is lit.
         
         That is why it ignores `skin`, unlike every case below. `skin` fills the
         shape in `color` when focused, and `ToggleButton` passes the page colour
         as `color` on a lit button — so a filled box would leave the tick the
         same colour as the box it sits in, which is no tick at all. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={{
              position: 'absolute',
              top: 3 * u,
              left: 3 * u,
              width: 18 * u,
              height: 18 * u,
              borderRadius: 4 * u,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          {focused ? (
            <>
              <View
                style={{
                  position: 'absolute',
                  left: 6.5 * u,
                  top: 12 * u,
                  width: 5 * u,
                  height: stroke,
                  borderRadius: 1 * u,
                  backgroundColor: color,
                  transform: [{ rotate: '45deg' }],
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: 9 * u,
                  top: 10.5 * u,
                  width: 9 * u,
                  height: stroke,
                  borderRadius: 1 * u,
                  backgroundColor: color,
                  transform: [{ rotate: '-45deg' }],
                }}
              />
            </>
          ) : null}
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

    case 'filters':
      /* SLIDERS: three tracks with a handle each, at three different stops.
 
         Added rather than borrowed, because the fourteen names above had no
         honest one for "narrow this list". `sort` is descending bars and its
         own comment insists that is the shape of an ORDER — which on the
         players board is the control immediately beside this one, so reusing it
         would put two different jobs behind one picture. `available` is a slot
         with a plus meaning "you could add this", which is a statement about a
         roster and not about a list. Drawing a fifth wrong meaning onto an
         existing glyph is how an icon set stops meaning anything.
 
         It is three rectangles and three circles on the same 24pt grid as
         everything else here, so it costs no dependency and cannot drift in
         weight from its neighbours. The handles sit at different stops on
         purpose: three centred handles read as a stack of bars, which is `sort`
         again. Off-centre, the picture is unmistakably "these are set to
         something", which is exactly what the button holds.
 
         THE HANDLES ARE SOLID IN BOTH STATES, which breaks this set's usual
         outline-off / filled-on rule for the same reason `search`'s handle
         does: a 4pt circle carrying a 1.6pt outline is a ring with a one-point
         hole, which at 18pt reads as a smudge rather than as a handle. The lit
         state is carried by `color`, which the button already swaps to the
         accent. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 4 * u, alignItems: 'flex-start' }}>
            {[15, 8, 12].map((stop) => (
              <View key={stop} style={{ width: 18 * u, height: 4 * u, justifyContent: 'center' }}>
                <View style={[bar(18, 1.5), { position: 'absolute' }]} />
                <View
                  style={{
                    position: 'absolute',
                    left: (stop - 2) * u,
                    width: 4 * u,
                    height: 4 * u,
                    borderRadius: 2 * u,
                    backgroundColor: color,
                  }}
                />
              </View>
            ))}
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

    case 'lineup':
      /* A roster: three slots, each a marker and the name beside it. The same
         idea as the 24pt tab glyph of the same name, redrawn at 18 rather than
         scaled — `TabIcon`'s version sizes its column at 20 units, which at
         this box leaves the bars a point and a half wide and reads as fuzz.
         Two slots instead of three for the same reason. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ gap: 3 * u }}>
            {[9, 6].map((barWidth, i) => (
              <View
                key={i}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5 * u }}>
                <View style={[{ width: 5 * u, height: 5 * u, borderRadius: 1.75 * u }, skin]} />
                <View
                  style={{
                    width: barWidth * u,
                    height: 2 * u,
                    borderRadius: u,
                    backgroundColor: color,
                    opacity: focused ? 1 : 0.75,
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      );

    case 'contests':
      /* Two fields facing each other across a halfway line. NOT a trophy and
         NOT a podium: `standings` is already the podium and means "where
         everyone finished", where this means "the fixtures you are in" — two
         glyphs that both said prize would be the bar telling you the same
         thing twice.

         The divider stays solid on both states. It is the one part that
         carries the meaning — two boxes with nothing between them is a grid,
         and a grid is what `sets` draws. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * u }}>
            <View style={[{ width: 6 * u, height: 13 * u, borderRadius: 2 * u }, skin]} />
            <View
              style={{
                width: 1.5 * u,
                height: 15 * u,
                borderRadius: u,
                backgroundColor: color,
                opacity: 0.55,
              }}
            />
            <View style={[{ width: 6 * u, height: 13 * u, borderRadius: 2 * u }, skin]} />
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
  /* The tray and whatever sits beside it. `alignItems: 'center'` is the row's
     default for anything that is not a door — the door itself opts back into
     `stretch` so it can match the tray's height. See `detachedGroup`. */
  /* The tray, then the detached buttons. No `justifyContent` is needed: the
     tray takes every point the buttons do not, so it ends exactly one gap to
     their left whatever the width. The buttons are still grouped into one node
     so that gap stays theirs rather than opening up between them. */
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowDetachedOnly: { justifyContent: 'flex-end' },
  /* `stretch` on BOTH axes is what makes the door the tray's height: the row
     centres its children, so the group has to opt out for itself, and its own
     `alignItems` has to pass the full height on to the button inside it.

     With no tray there is nothing to take a height FROM — a stretched child in
     a row of stretched children is just its own content — so the solo case
     pins `ActionDiameter`, which is the height the button used to be and still
     the platform's minimum target. */
  detachedGroup: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  detachedGroupSolo: { alignSelf: 'center', height: ActionDiameter },
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
  /* GLYPH BESIDE THE WORD, and the cells SHARE the tray with no cap on how
     wide one may get.

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

     THE CELL WAS A COLUMN — glyph over label, 45pt — and a flat version had
     already been tried once and reverted. The revert note is worth keeping
     because it is half right: that attempt let the cells HUG their labels, so
     Inventory and Sets came out different widths and the bar stopped reading as
     one control with a position in it. It concluded that flat was the mistake.
     The unequal widths were.

     They came from dropping `flexGrow`/`flexBasis`, which have nothing to do
     with the axis inside the cell. Kept — as they are here — the cells still
     split the tray evenly and only their contents lie down: same widths, same
     even division, 30pt instead of 45. That is a row of chrome shorter above
     every browsing screen in the app, which on a phone is the top of the list
     you came to read.

     EXACTLY TWO CHILDREN, and that is a constraint rather than a description.
     It survives the axis change and is the reason the change is safe: a cell is
     a flex box in a flex row, so a third element in ONE cell resizes every cell
     in the bar. As a column that showed up as height — the "Soon" badge Sets
     used to carry made the Collection strip 66pt where every other section's
     was 55 — and as a row it would show up as width, pushing that cell's
     siblings narrower than the same items elsewhere. Either way it is one cell
     deciding the shape of the whole control. Anything that wants to say more
     about a destination belongs in the rail, which is a list of rows, or on the
     destination itself. */
  item: {
    flexGrow: 1,
    flexBasis: 0,
    /* Still a floor, and it moved with the axis. It is what the longest label
       needs BESIDE an 18pt glyph rather than under it — "AVAILABLE" at 9pt, the
       gap, and the glyph — and it is what lets the bar scroll rather than
       ellipsise if a section ever carries enough items to overflow the row.
       Laid out flat a cell is about a third wider than it was, so the old 62
       would have let three items ellipsise on a phone instead of scrolling. */
    minWidth: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    /* Wider than the 3 that separated the two lines. Vertical space between a
       glyph and the word under it reads as one object; horizontal space is the
       only thing keeping them from touching, and 3 has them colliding. */
    gap: Spacing.two - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.control,
  },
  label: { letterSpacing: 0.4 },
  /* NO HEIGHT AND NO WIDTH. It takes the first from the group above and the
     second from the word inside it — `flexShrink: 0` is what stops the tray
     stealing that width back when the labels are long.

     `Radius.panel`, the tray's own radius, rather than a capsule. The two sit
     one gap apart and are now the same height; a capsule beside a rounded
     rectangle at matching heights reads as two controls that failed to agree,
     where the same corner reads as one row. NO BORDER — the fill carries it,
     and a hairline on a saturated pill only muddies its edge. */
  /* NO WIDTH AND NO HEIGHT of its own. The height comes from the group above,
     which stretches to the tray; `aspectRatio` turns that into the width, so
     the disc is exactly as wide as the row is tall whatever the tray does.
     `flexShrink: 0` is what stops a long tray squeezing it out of round.

     The radius is a number no height can exceed rather than half of one, since
     there is no height here to halve. */
  detached: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 999,
    /* A drawn ring, not the app's hairline — the hairline is what a piece of
       chrome uses to separate itself from the page, and at that weight this
       circle went back to being a smudge. But 1.5 (the glyph's own stroke) put
       more ink in the edge than in the mark it surrounds, which made the button
       read as a ring with something inside it rather than as a pack. 1 is the
       lightest weight that still holds a full-strength colour. */
    borderWidth: 1,
  },
  box: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
