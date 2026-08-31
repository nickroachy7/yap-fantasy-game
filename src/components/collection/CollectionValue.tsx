/**
 * "VALUE ◆ 232" — what the collection would fetch if every copy were sold.
 *
 * ---------------------------------------------------------------------------
 * THE LABEL IS THE POINT OF THIS COMPONENT
 * ---------------------------------------------------------------------------
 *
 * There are TWO gem figures on this screen and they mean opposite things. The
 * header carries the player's wallet — gems they have, to spend. This one is
 * gems they could GET, by destroying the collection it is measured over. Same
 * glyph, same gold, eight points apart, and nothing but a word between them.
 *
 * An unlabelled `◆ 232` under an unlabelled `◆ 1,501` reads as a second balance,
 * which is the worst available misreading: it makes the player think they are
 * richer than they are. So the word comes first, before the glyph, where it is
 * read before the number rather than as a footnote to it.
 *
 * ---------------------------------------------------------------------------
 * NO BORDER, AND THAT IS A CONSEQUENCE OF THERE BEING ONE FIGURE
 * ---------------------------------------------------------------------------
 *
 * This box used to hold six cells — four tier counts, the value, the cap — and a
 * border was doing real work grouping them. The tier counts have gone to the
 * account screen, where `TierBreakdown` already draws the spread as a
 * proportional bar with a full legend and can answer "how many golds" properly
 * rather than in four digits on a toolbar.
 *
 * What is left is one number, and a border around one number is furniture. It
 * also cost more than it looked: with the frame gone, the round menus and the
 * Select button are the ONLY bordered objects on the row, so the reader sorts it
 * into "things that tell me" and "things I press" without a caption.
 *
 * IT CANNOT TRUNCATE. Diamond sells for 500 and the roster caps at thirty, so
 * this can reach five digits. An earlier version let its container shrink and a
 * collection worth 2142 gems rendered as `214` — not clipped, not ellipsised, a
 * DIFFERENT NUMBER in identical styling. Every figure here is a bare integer, so
 * every truncation is a plausible smaller one. Nothing in this component shrinks
 * or caps its lines; the row's give is the spacer beside it.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Spacing, Type, getTierTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function CollectionValue({ sellValue }: { sellValue: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = getTierTheme('gold', scheme).colors;

  return (
    <View
      accessible
      accessibilityRole="text"
      /* Spoken as the sentence the label is short for. "Value 232" would leave
         a screen reader with the same ambiguity the glyph leaves an eye. */
      accessibilityLabel={`Collection value, ${sellValue} gems if every card were sold`}
      style={styles.row}>
      <Text style={[Type.label, styles.label, { color: c.textTertiary }]}>Value</Text>
      <Gem size={10} color={gold.accent} />
      {/* `Type.section`, not `Type.figure`.

          `figure` is "the one number a panel exists to show" and this is not in
          a panel — it is one item on a toolbar strip, beside a 32pt button and
          two 32pt circles, and at 18/22 it was both the largest thing above the
          grid and the thing setting the row's height. A readout does not have to
          shout to be the first thing read; being the only gold on the row
          already does that. */}
      <Text style={[Type.section, NUMERIC, { color: gold.accent }]}>{sellValue}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* `flexShrink: 0`: the spacer beside this is the row's give, never the
     figure. See the header. */
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  /* Uppercased here rather than in the string, so the casing is a style
     decision and the word stays readable in the source. */
  label: { textTransform: 'uppercase' },
});
