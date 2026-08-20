/**
 * The person: how old, how big, how long he has been doing this, and where he
 * came from.
 *
 * WHY IT IS DOWN HERE AND NOT IN THE HEADER
 *
 * It was in the header, as a row of labelled figures under the player's name,
 * and it never sat right at any size. The reason turned out not to be the
 * layout — it was tried boxed, unboxed, full-width, and inside the text column
 * beside a larger portrait — but the placement.
 *
 * A profile header answers WHO IS THIS: the name, the club, the position, the
 * shirt number, and whatever designation qualifies him this week. Those are
 * identity. A height and a weight are ATTRIBUTES: read once, never compared
 * between two players, and nobody has ever started a quarterback because he is
 * 6'2". Setting them as a labelled grid directly under the name claimed they
 * were scannable data and promised a comparison the header could not pay off,
 * which is what made every arrangement of them feel like furniture.
 *
 * They are the same class of fact as the college that already moved here, so
 * they now keep it company rather than being split across two screens by
 * nothing more than how long each string is.
 *
 * IT ALSO FIXES THE ARITHMETIC. In the header these four had ~274pt between the
 * portrait and the sheet edge — 68pt a cell, which is not enough for `225 lbs`
 * under a label without both feeling squeezed. Down here the row has the full
 * measure and the cells are half as wide again.
 *
 * NO FILLS, deliberately, and that is not just inherited from the header. This
 * sits under `TeamContext` and the usage panel, both of which are filled
 * `backgroundElement` cards. A third filled block would read as a third panel
 * of equal standing; this is a footnote about the person, and the quietest
 * thing on the tab is exactly the rank it should have.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerBio } from './profile';

/**
 * "10th Season" -> "10th". The cell is narrow and the label above it already
 * says EXP, so the word "Season" is the half that gets truncated AND the half
 * that carries no information. "Rookie" has no suffix and is left alone.
 */
function experienceLabel(raw: string): string {
  return raw.replace(/\s*seasons?$/i, '').trim() || raw;
}

/**
 * "220 lbs" -> ["220", "lbs"]; "6' 3\"" and "28" come back whole.
 *
 * The feed hands weight over as one string with its unit inside it, and in a
 * row of figures that reads as a word rather than a number — the eye scanning
 * the row stops on the only cell with letters in it. Setting the unit small and
 * quiet keeps the figure the figure.
 *
 * Deliberately only splits a trailing ALPHABETIC word. A height is `6' 3"`,
 * whose marks are part of the measurement rather than a unit after it, and
 * anything unrecognised is passed through untouched rather than guessed at.
 */
function splitUnit(value: string): [string, string | null] {
  const m = /^(.*\d)\s+([A-Za-z]+)$/.exec(value.trim());
  return m ? [m[1], m[2]] : [value, null];
}

export function BioFacts({ bio }: { bio: PlayerBio }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Each is omitted entirely when unknown rather than rendered as a dash: an
     empty "WT —" tells the reader nothing they wanted, and with no fills a
     missing cell leaves no hole to notice. */
  const facts: { label: string; value: string }[] = [];
  if (bio.age !== null && bio.age !== undefined) facts.push({ label: 'AGE', value: String(bio.age) });
  if (bio.height) facts.push({ label: 'HT', value: bio.height });
  if (bio.weight) facts.push({ label: 'WT', value: bio.weight });
  if (bio.experience) facts.push({ label: 'EXP', value: experienceLabel(bio.experience) });

  if (facts.length === 0 && !bio.college) return null;

  return (
    <View>
      {facts.length > 0 ? (
        <View style={styles.row}>
          {facts.map((f) => {
            const [figure, unit] = splitUnit(f.value);
            return (
              <View key={f.label} style={styles.cell}>
                <Text style={[Type.micro, { color: c.textTertiary }]}>{f.label}</Text>
                <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: c.text }]}>
                  {figure}
                  {unit ? (
                    <Text style={[styles.unit, { color: c.textTertiary }]}>{` ${unit}`}</Text>
                  ) : null}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* College is not a measurement, so it does not get a cell in the row —
          it is the one fact here that is a place rather than a quantity, and it
          is the widest. A line under a hairline keeps the row's four columns
          even instead of letting one long string stretch a fifth. */}
      {bio.college ? (
        <View
          style={[
            styles.college,
            facts.length > 0 && { marginTop: Spacing.two + 1, paddingTop: Spacing.two - 1, borderTopWidth: StyleSheet.hairlineWidth },
            { borderTopColor: c.border },
          ]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>COLLEGE</Text>
          <Text numberOfLines={1} style={[Type.fine, styles.collegeValue, { color: c.textSecondary }]}>
            {bio.college}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* No wrap. The cells divide the measure evenly however many there are, which
     is what lets them lose their boxes — a `flexBasis` is what let one long
     value escape onto a line of its own back when this was six tiles. */
  row: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, gap: 2 },
  /** The scale's 15pt step. An unboxed value has to carry its cell alone. */
  figure: { fontSize: 15, lineHeight: 19, fontWeight: '600' },
  /** Subordinate to the number it qualifies — see `splitUnit`. */
  unit: { fontSize: 10, fontWeight: '600' },
  college: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  collegeValue: { flexShrink: 1 },
});
