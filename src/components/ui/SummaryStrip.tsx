/**
 * A row of headline figures inside one hairline frame: the strip that sits at
 * the top of a browsing screen and says what you are looking at.
 *
 * WHY THIS EXISTS AS ITS OWN FILE. It was written twice — once in
 * `CollectionSummary` for the inventory and once as `SetsStrip` inside
 * `SetsList` — with the same frame weight, the same divider, the same
 * `Type.micro` label over a `Type.figure` value, and the same optional gem.
 * Two copies of one object is a promise that they will drift, and they did: the
 * inventory's learned weighted columns and a label that can be a component, the
 * sets one did not, and by the time anyone looked they were visibly different
 * things in the same position on two tabs of the same section.
 *
 * There is a third strip in the app and it is deliberately NOT this one.
 * `account/StatStrip` is a WRAPPING GRID of tiles — six on a web measure become
 * two rows of three on a phone — and it draws its gridlines as gaps over a
 * backdrop precisely because per-tile borders double up at the wrap. This one
 * cannot wrap, which is the whole reason it can be a frame with dividers
 * inside it. Merging them would mean one component with two layout engines.
 *
 * NO FILL. The frame is the whole treatment — a background tone here would be
 * a fourth surface on a screen that already has the page, the cards and the
 * chips, and it is what made an earlier filled-tile version shout.
 *
 * WHICH IS WHY THE FRAME OUTWEIGHS ITS DIVIDERS. Both started at a hairline of
 * `border`, identical, so the outer edge read as one more internal rule and the
 * strip did not close into a container at all. 1.5pt of `borderStrong` outside,
 * hairline `border` within — roughly four times the weight, which is what makes
 * this one object rather than N columns sitting next to each other.
 *
 * WIDTH IS THE LEVER, NOT COLOUR, and that is a constraint rather than a
 * preference. `borderStrong` is already the token for "around a panel, where
 * the edge is doing real work", and the next value up the ramp is
 * `textTertiary` — a text colour, three steps lighter, which on a 5pt-tall
 * frame would read as a drawn rectangle rather than an edge. Going further than
 * this means adding a token between the two, not borrowing one.
 *
 * IT CANNOT GROW A SECOND ROW. The cells are flex children of a row with no
 * `flexWrap`, so they always divide the width however many there are and
 * whatever their weights. That is the invariant callers rely on when they pin
 * the strip above a list.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type SummaryCell = {
  key: string;
  /** Rendered uppercase at 9pt. Ignored when `labelNode` is given. */
  label?: string;
  /**
   * Drawn INSTEAD of `label`, for a cell whose name is not a word — the
   * inventory's tier cells pass `TierMark`, the app's own one-letter tier.
   */
  labelNode?: ReactNode;
  /**
   * PRE-FORMATTED. The strip cannot know whether a figure wants a thousands
   * separator, a decimal or neither, so that stays with the caller who knows
   * what the number is.
   */
  value: string;
  /** Colours the FIGURE only — the label stays quiet, in every cell. */
  tone?: string;
  /** Drawn before the figure. A gem on anything denominated in gems. */
  mark?: ReactNode;
  /**
   * Share of the row this cell takes. Defaults to an equal share.
   *
   * NOT ALL CELLS ARE EQUAL, and the reason is arithmetic. Six equal columns on
   * a 375pt phone are ~57pt each, ~45 of it usable — which holds a two-digit
   * count with room to spare and does NOT hold `2,142` beside a gem, which
   * needs ~59. Weighting is safe: it changes how the width divides, never
   * whether it divides.
   */
  weight?: number;
  accessibilityLabel: string;
};

export function SummaryStrip({
  cells,
  action,
}: {
  cells: SummaryCell[];
  /**
   * One control on the strip's own line, to the right of it and OUTSIDE its
   * frame.
   *
   * The collection and the sets board both draw a round Packs button, and it
   * used to sit on a line of its own above this — a full row of chrome holding
   * one 44pt circle and otherwise empty, on the two screens where vertical
   * space pays for cards. Beside the strip it costs nothing: the strip is
   * shorter than the row it was already given, and the button is the same
   * height as it.
   *
   * OUTSIDE the border rather than as a last cell, because it is not a figure.
   * The frame draws a row of counts divided by hairlines, and a control inside
   * it would read as one of them.
   */
  action?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const strip = (
    <View style={[styles.strip, action ? styles.stripInRow : null, { borderColor: c.borderStrong }]}>
      {cells.map((cell, i) => {
        const weight = cell.weight ?? 1;
        return (
          <View
            key={cell.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={cell.accessibilityLabel}
            style={[
              styles.cell,
              { flexGrow: weight, flexShrink: weight },
              /* The divider is a LEFT border, so the leading cell must not draw
                 one — otherwise it doubles with the frame. */
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border },
            ]}>
            {cell.labelNode ?? (
              <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
                {cell.label}
              </Text>
            )}
            <View style={styles.figureRow}>
              {cell.mark}
              <Text
                numberOfLines={1}
                style={[Type.figure, NUMERIC, { color: cell.tone ?? c.text }]}>
                {cell.value}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  if (!action) return strip;

  return (
    <View style={styles.row}>
      {strip}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Takes the width the action leaves. Without it the strip sizes to its cells
     and the pair sits huddled at the left of the row. */
  stripInRow: { flex: 1, minWidth: 0 },
  strip: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: Radius.panel,
    overflow: 'hidden',
  },
  /* `flexBasis: 0` so the weights divide the WHOLE row rather than the leftover
     after content, and `minWidth: 0` so a cell shrinks below its content
     instead of forcing the row wider than the screen. */
  cell: {
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one + 2,
  },
  figureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
