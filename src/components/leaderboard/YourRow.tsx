/**
 * The reader's own row, pinned above the list on every board.
 *
 * THE ANSWER TO THE ONLY QUESTION ANYBODY ARRIVES WITH. A leaderboard is read
 * top-down for about four rows and then scrolled for one thing: where am I. On
 * a board of fifty that is a scroll; on a board of five hundred it is a hunt,
 * and the RPCs cap at five hundred. Pinning the row means the answer is on
 * screen before the reader does anything.
 *
 * IT IS THE ROW, NOT A SUMMARY OF IT, and that is the change worth recording.
 * This was a strip of label/value pairs — RANK, POINTS, AVG/WK, BEST, WEEKS —
 * which said the same things in a different shape, so the reader had to learn
 * two presentations of one fact and could not compare the panel to the list
 * without translating between them. Drawing the actual `BoardRow` means the
 * thing at the top and the thing in the list are the same object: the same
 * three lines, the same figure, the same tier mark, and the same RANK, which is
 * the number the panel exists to deliver.
 *
 * The stat strip is not missed. Everything it carried is on the row's third
 * line or in its second, because that is where those numbers went when the
 * boards stopped being tables — see `BoardRow`.
 *
 * WHEN THE READER IS NOT ON THE BOARD it says why in a sentence, because "you
 * are not here" with no explanation reads as a bug. Each board supplies its own
 * reason: no scored week, no card that has scored, no rung claimed.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Panel } from '@/components/ui/Panel';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BoardRow } from './BoardRow';
import type { BoardRowModel } from './community';

/** "1st", "2nd", "3rd", "11th" — the teens are the reason this is not `n + 'th'`. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function YourRow({
  row,
  field,
  /** What to say when the reader has no row on this board. */
  absent,
  unit,
  /** Overrides the panel's heading, where a board calls its rows something else. */
  title = 'Where you stand',
}: {
  row: BoardRowModel | null;
  /** How many rows the board holds — "3rd of 48" means nothing without it. */
  field: number;
  absent: string;
  unit: string;
  title?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Panel
      title={title}
      hint={row ? `${ordinal(row.rank)} of ${field}` : undefined}
      // The row draws its own gutter and its own rule; a panel surface around
      // it would box a thing whose whole design is not being boxed.
      inset={!row}>
      {row ? (
        <View style={styles.bleed}>
          <BoardRow row={row} isMe unit={unit} />
        </View>
      ) : (
        <Text style={[Type.bodyRelaxed, styles.prose, { color: c.textSecondary }]}>{absent}</Text>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  /* Out through the header's gutter, so the pinned row is the same width as the
     rows below it. Inset, it would be a narrower copy of the thing it is meant
     to be identical to — which is the one way this panel can mislead. */
  bleed: { marginHorizontal: -Spacing.three },
  prose: { padding: Spacing.two + 2, maxWidth: 520 },
});
