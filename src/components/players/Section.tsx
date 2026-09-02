/**
 * The two profile pages' section primitive, and the labelled figure that goes
 * inside one.
 *
 * WHY NOT `Panel`
 *
 * `Panel` gives every block a surface, a border and a 12pt inset, and stacks
 * them with a 16pt gap. That is right for a page of unlike objects — the Sets
 * list, the contest sheet — where each panel is a separate thing you might act
 * on. A profile is the opposite: one subject, described from several angles, in
 * a single column. Boxing each angle spends roughly 60pt per block on furniture
 * that says "these are different", which is the one thing they are not, and the
 * page ends up a stack of cards inside a sheet that is already a card.
 *
 * So a section is a RULE and a LABEL. It costs a hairline. The saving is real —
 * four blocks of Overview lost about a screen of height — and what is left on
 * the page is the numbers, which is what a reader came for.
 *
 * FULL BLEED, BY CANCELLING THE FRAME'S GUTTER
 *
 * `PlayerSheetFrame` pads its scroll content by `Spacing.three` and gaps its
 * children by the same. A rule inset 16pt from each edge reads as the top of a
 * box whose sides someone forgot to draw, so `SectionStack` climbs back out to
 * the sheet's edges — the same trick, and the same numbers, as `SheetToneBand`
 * a few files over. Each section then pushes its own padding back in, which is
 * why the rules run edge to edge and the text still lines up with the hero
 * above it.
 *
 * The negative `marginTop` is the other half of that: it closes the frame's
 * 16pt gap between the tone band and the stack, so the first section's rule
 * lands directly under the tab bar instead of floating below it. Which is also
 * why the tab bar on both routes no longer draws a bottom border — the section
 * under it supplies one, and two hairlines 16pt apart is a box again.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function SectionStack({ children }: { children: ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

export function Section({
  label,
  /**
   * A quiet qualifier on the right of the label row — "excludes bonuses", "1
   * start". It is the caveat slot: the sentence that used to run under a panel
   * as body copy fits here as three words, and the ones that do not fit were
   * usually saying something the numbers already say.
   */
  hint,
  /**
   * The body loses the 16pt gutter; the label keeps it.
   *
   * For the one child that has to reach the sheet's edges: the career table
   * scrolls sideways, and a horizontal scroller that starts and ends 16pt short
   * of the screen reads as a stuck table rather than a scrolling one.
   */
  flush = false,
  children,
}: {
  label?: string;
  hint?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      style={[styles.section, flush && styles.sectionFlush, { borderTopColor: c.border }]}>
      {label || hint ? (
        <View style={[styles.head, flush && styles.headFlush]}>
          {label ? (
            <Text numberOfLines={1} style={[Type.micro, styles.headLabel, { color: c.textTertiary }]}>
              {label}
            </Text>
          ) : (
            <View style={styles.headLabel} />
          )}
          {hint ? (
            <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
              {hint}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A row of figures that divides the width evenly however many there are.
 *
 * No fills and no wrap, for the reason the old Overview stat row recorded: a
 * filled tile spends half a phone-width column on its own inset, which is the
 * whole difference between `SEASON FP` and `SEASO…`. Four is the ceiling on a
 * phone; check a fifth before you add it.
 */
export function FigureRow({ children }: { children: ReactNode }) {
  return <View style={styles.figureRow}>{children}</View>;
}

export function Figure({
  label,
  value,
  hint,
  /** The one figure a section is actually about, when it has one. */
  lead = false,
}: {
  label: string;
  value: string;
  hint?: string;
  lead?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.figure}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[NUMERIC, lead ? styles.figureLead : styles.figureValue, { color: c.text }]}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { marginHorizontal: -Spacing.three, marginTop: -Spacing.three },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    gap: Spacing.two + 1,
  },
  sectionFlush: { paddingHorizontal: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  headFlush: { paddingHorizontal: Spacing.three },
  /* Only the label gives way. A hint truncated to "EXCLUDES BONU…" is noise;
     a section title truncated is the one word the block exists to name. */
  headLabel: { flexShrink: 1, minWidth: 0 },
  figureRow: { flexDirection: 'row', gap: Spacing.two },
  figure: { flex: 1, minWidth: 0, gap: 1 },
  figureValue: { fontSize: 17, lineHeight: 21, fontWeight: '700' },
  figureLead: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
});
