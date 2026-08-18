/**
 * Recent form as five bars, most recent on the right.
 *
 * Drawn rather than written because five numbers in a 34pt column is four
 * numbers too many, and the question the column answers — "is he trending up
 * or has he fallen off?" — is a shape question, not a value one. The numbers
 * are still in the accessibility label, so nothing is lost to a screen reader.
 *
 * There is no projection here and there should not be: everything on this
 * screen is something that already happened.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { FORM_CEILING, FORM_GAMES } from './model';

const BAR_W = 4;
const BAND_H = 14;
const MIN_H = 2;

export function FormBars({ values, width }: { values: number[]; width: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (values.length === 0) {
    return <Text style={[Type.body, { width, color: c.textTertiary }]}>—</Text>;
  }

  const recent = values.slice(-FORM_GAMES);
  const label = `Last ${recent.length} games: ${recent.map((v) => v.toFixed(1)).join(', ')} fantasy points`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.wrap, { width }]}>
      {recent.map((v, i) => {
        const h = Math.max(MIN_H, Math.min(1, v / FORM_CEILING) * BAND_H);
        const latest = i === recent.length - 1;
        return (
          <View
            // Index is the key on purpose: these are positions in a fixed-length
            // window, not identities, and two games can score the same.
            key={i}
            style={[
              styles.bar,
              { height: h, backgroundColor: latest ? c.text : c.textTertiary },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bars grow from a shared baseline, so height alone carries the value.
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: BAND_H },
  bar: { width: BAR_W, borderRadius: 1 },
});
