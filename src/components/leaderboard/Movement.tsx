/**
 * Which way a manager moved, in two characters.
 *
 * It lived in `StandingsRow` while that file drew the points board as a table
 * of columns. The board is rows of three lines now — see `BoardRow` — and the
 * table went with it, but the movement mark is used by three separate surfaces
 * (the podium, the "your standing" panel, and the row itself), so it outlived
 * the file it was declared in and now has one of its own.
 *
 * COLOUR-CODED AND GLYPH-CODED AND SIGNED, all three, because colour alone
 * fails for a red/green colour-blind reader and this is a two-character cell
 * with no room for a word.
 */
import { DASH } from '@/components/ui/DataTable';
import { Text } from 'react-native';

import { Colors, NUMERIC, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function MovementMark({
  movement,
  known,
  style,
}: {
  movement: number | null;
  /** False while the week boards are still loading — unknown, not "new". */
  known: boolean;
  style?: object;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Unknown, new, and held are all an em dash: three different reasons there is
     no movement to state, and none of them is movement. `NEW` was a word in a
     column of two-character marks — the widest thing in it, on the rows that
     had the least to say — and on a board where most managers are new it was
     the loudest repeated element on the screen. The distinction survives where
     it can be read properly: `movementLabel` still says which of the three a
     screen reader is looking at. */
  if (!known || movement === null || movement === 0) {
    return <Text style={[Type.micro, { color: c.textTertiary }, style]}>{DASH}</Text>;
  }

  const up = movement > 0;
  return (
    <Text style={[Type.micro, NUMERIC, { color: up ? c.positive : c.negative }, style]}>
      {up ? '▲' : '▼'}
      {Math.abs(movement)}
    </Text>
  );
}

export function movementLabel(movement: number | null, known: boolean): string {
  if (!known) return '';
  if (movement === null) return ', new to the board';
  if (movement === 0) return ', held position';
  return movement > 0 ? `, up ${movement}` : `, down ${Math.abs(movement)}`;
}

