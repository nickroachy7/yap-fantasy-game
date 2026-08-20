/**
 * What you own, as a block of tiles above the grid.
 *
 * WHAT THIS HAS BEEN, IN ORDER, AND WHY IT IS BOXES AGAIN
 *
 * It started as a six-cell stat grid, and that grid was removed for a good
 * reason: it cost ~60pt of a phone's screen to carry five numbers, and it sat
 * above FOUR rows of facets and a search field, so the first card was below the
 * fold before a single card had been drawn. It became one wrapping line of
 * label/value pairs, which was the right trade at the time.
 *
 * The four rows of facets are gone. They are one row of position chips and
 * three round buttons now — see `CollectionFilters` — which handed back most of
 * what the grid had been costing. A wrapping line of ten small words was the
 * cheapest thing that could work under that old pressure, and with the pressure
 * gone it read as leftover text rather than as a part of the page.
 *
 * ONE STRIP, NOT FIVE TILES. `PlayerHero`'s filled fact tiles are the obvious
 * thing to reuse here and they are wrong on this screen for a reason that does
 * not apply on a profile: five filled boxes would sit directly above a GRID of
 * filled boxes, and the summary would compete with the cards it is a summary
 * of. The page's subject is the collection; this is context for it.
 *
 * A single hairline frame with the cells divided inside it is the same "one
 * object" reading for a fraction of the ink: one border instead of five fills,
 * and no second background tone on a screen that already has three.
 *
 * EQUAL COLUMNS, WHICH THE TILES COULD NOT DO. The cell count varies — three
 * for a new collection, up to six once there are duplicates and injuries in it
 * — and tiles growing from a fixed basis wrapped, so five tiles put four on one
 * row and stretched the fifth across the next. Cells that each take `flex: 1`
 * of one row always divide evenly, at any count and any width. That is what
 * keeps this slim: it is one row, always, and it cannot grow a second.
 *
 * The numbers are over the WHOLE collection, never the current filter. The
 * result line below answers "how many match"; this answers "what do I own", and
 * a summary that moved every time a chip was pressed would answer neither.
 *
 * Facts that would read zero for most players — duplicates, injuries — are
 * dropped rather than printed as 0. A zero still costs a whole tile.
 *
 * SIX CHARACTERS IS THE LABEL BUDGET, measured rather than guessed, and equal
 * columns make it stricter rather than looser: at six cells on a 375pt phone a
 * cell is 57pt, leaving ~49 for the label at `Type.micro`. "UNCERTAIN" needs 56
 * and "SELLS FOR" the same, so both truncated. Hence UNSURE and VALUE — and OUT
 * rather than UNAVAILABLE — with the full sense kept in each cell's
 * accessibility label. The gem mark beside VALUE is what makes it unambiguous
 * that the figure is gems rather than cards.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectionStats } from './types';

function Cell({
  label,
  value,
  tone,
  mark,
  first,
  accessibilityLabel,
}: {
  label: string;
  value: number;
  /** Colours the FIGURE only — the label stays quiet, as in every other cell. */
  tone?: string;
  /** Drawn before the figure. The sell value carries the gem. */
  mark?: React.ReactNode;
  /** The divider is a LEFT border, so the leading cell must not draw one. */
  first?: boolean;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.cell, !first && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border }]}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <View style={styles.figureRow}>
        {mark}
        <Text numberOfLines={1} style={[Type.figure, NUMERIC, { color: tone ?? c.text }]}>
          {value.toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

export function CollectionSummary({ stats }: { stats: CollectionStats }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  /* Built as a list rather than as JSX in place, because the divider is a LEFT
     border and only the leading cell may skip it — and which cell leads depends
     on what this collection happens to contain. Conditional JSX cannot answer
     "am I first" without every branch knowing about every branch before it. */
  const cells: { key: string; label: string; value: number; tone?: string; mark?: React.ReactNode; a11y: string }[] = [
    { key: 'cards', label: 'CARDS', value: stats.cards, a11y: `${stats.cards} cards` },
    { key: 'players', label: 'PLAYERS', value: stats.players, a11y: `${stats.players} players` },
  ];
  if (stats.duplicates > 0) {
    cells.push({
      key: 'dupes',
      label: 'DUPES',
      value: stats.duplicates,
      a11y: `${stats.duplicates} duplicates`,
    });
  }
  cells.push({ key: 'teams', label: 'TEAMS', value: stats.teams, a11y: `${stats.teams} teams` });
  if (stats.unavailable > 0) {
    cells.push({
      key: 'out',
      label: 'OUT',
      value: stats.unavailable,
      tone: c.negative,
      a11y: `${stats.unavailable} players ruled out`,
    });
  }
  if (stats.uncertain > 0) {
    cells.push({
      key: 'unsure',
      label: 'UNSURE',
      value: stats.uncertain,
      tone: c.warning,
      a11y: `${stats.uncertain} players uncertain`,
    });
  }
  /* What the whole collection is worth if sold. It earns its place twice: it is
     the only figure here denominated in gems rather than cards, and it is how
     anyone finds out selling exists at all — the action itself lives on the card
     page, where there is room to show what a copy has earned before you give it
     up. Last, because it is the one cell that is not a count of cards. */
  if (stats.sellValue > 0) {
    cells.push({
      key: 'value',
      label: 'VALUE',
      value: stats.sellValue,
      mark: <Gem color={gold} size={8} />,
      a11y: `Worth ${stats.sellValue} gems if every card were sold`,
    });
  }

  return (
    <View style={[styles.strip, { borderColor: c.borderStrong }]}>
      {cells.map((cell, i) => (
        <Cell
          key={cell.key}
          label={cell.label}
          value={cell.value}
          tone={cell.tone}
          mark={cell.mark}
          first={i === 0}
          accessibilityLabel={cell.a11y}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* No fill. The frame is the whole treatment — a background tone here would be
     a fourth surface on a screen that already has the page, the cards and the
     chips, and it is what made the filled-tile version shout.

     WHICH IS WHY THE FRAME OUTWEIGHS ITS DIVIDERS. Both started at a hairline
     of `border`, identical, so the outer edge read as one more internal rule
     and the strip did not close into a container at all. 1.5pt of `borderStrong`
     outside, hairline `border` within — roughly four times the weight, which is
     what makes this one object rather than five columns sitting next to each
     other.

     WIDTH IS THE LEVER, NOT COLOUR, and that is a constraint rather than a
     preference. `borderStrong` is already the token for "around a panel, where
     the edge is doing real work", and the next value up the ramp is
     `textTertiary` — a text colour, three steps lighter, which on a 5pt-tall
     frame would read as a drawn rectangle rather than an edge. Going further
     than this means adding a token between the two, not borrowing one. */
  strip: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: Radius.panel,
    overflow: 'hidden',
  },
  /* `flex: 1` with `minWidth: 0`: equal columns at any count, and the label is
     allowed to ellipsise rather than force the row wider than the screen. */
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one + 2,
  },
  figureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
