/**
 * The line across the grid where the roster cap falls.
 *
 * WHAT IT SAYS. Everything below it is over the limit — cards you hold that you
 * cannot set a lineup around until you commit or sell down to thirty. The
 * roster bar above the grid already gives the number; this gives the SHAPE of
 * it, which is what a bar of two figures cannot: which cards, in the order you
 * are currently looking at them.
 *
 * IT IS A CUT IN THE CURRENT SORT, NOT A VERDICT ON THE CARDS. Nothing marks a
 * particular copy as "the one over the limit" — the cap is a count, and which
 * thirty you keep is entirely the player's call. So the line is positional: it
 * sits after the thirtieth row in whatever order the grid is in, and moving the
 * sort moves it. Sorted by career FP that reads as "your best thirty"; sorted
 * by acquired it reads as "the thirty you have had longest". Both are useful
 * and both are the same statement — cut here and you are legal.
 *
 * WHICH IS WHY IT IS HIDDEN UNDER A FILTER. The thirtieth QB on screen is not
 * the thirtieth card you hold, so a line drawn there would be pointing at
 * nothing. See the grid, which decides when to draw this.
 *
 * AND WHY IT ONLY APPEARS OVER THE CAP. Under it there is nothing to divide:
 * every card you hold is on the right side of the line, and drawing one anyway
 * would be a permanent mark on a screen with no problem on it. The threshold is
 * the same one the roster bar uses to turn red.
 *
 * DRAWN IN SVG RATHER THAN AS A DASHED BORDER. React Native honours
 * `borderStyle: 'dashed'` only when every edge carries the same width, so a
 * top-only dashed rule is a solid rule on Android and a coin toss elsewhere.
 * `react-native-svg` is already a dependency — the wordmark and the heart rack
 * are both drawn with it — and a `Line` with a dash array is exact on every
 * platform, at the dash length we asked for.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Long dash, short gap — a cut mark rather than a dotted underline. */
const DASH = [6, 5];

export function RosterCut({ cap }: { cap: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      style={styles.cut}
      accessible
      accessibilityRole="summary"
      /* Said as a sentence, because the visual — a line with cards under it —
         is the whole of what a sighted reader gets and none of it survives
         being read out as "ROSTER LIMIT 30". */
      accessibilityLabel={`Roster limit of ${cap} cards. Everything below this line is over the limit.`}>
      <Rule color={c.negative} />
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[Type.micro, NUMERIC, { color: c.negative }]}>
        {`ROSTER LIMIT · ${cap}`}
      </Text>
      <Rule color={c.negative} />
    </View>
  );
}

/**
 * One half of the rule.
 *
 * `width="100%"` inside a `flex: 1` box rather than a measured number: the grid
 * is laid out at three to seven columns and re-measures on rotation, and a rule
 * that had to be told its own width would be one more thing to keep in step
 * with the column count.
 */
function Rule({ color }: { color: string }) {
  return (
    <View style={styles.rule}>
      <Svg width="100%" height={1}>
        <Line
          x1="0"
          y1="0.5"
          x2="100%"
          y2="0.5"
          stroke={color}
          strokeWidth={1}
          strokeDasharray={DASH}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * THE SPACE ABOVE IS THIS COMPONENT'S; THE SPACE BELOW IS THE GRID'S.
   *
   * A separator is rendered INSIDE the cell it follows — see
   * `VirtualizedListCellRenderer` — so it lands flush against the bottom of its
   * row, and the list's own row gap falls underneath it rather than either
   * side. Without the padding above, the line touches the cards it is cutting
   * away from and floats 12pt clear of the ones it is cutting off.
   *
   * 12 above and 4 here, and the caller makes up the difference below. The
   * collection grid used to supply it for free — its own 12pt row gap fell
   * under the separator — and now that the collection is a list of touching
   * rows there is no gap to borrow, so the screen pads this out to match. 16 of
   * clear air on each side of the rule is what makes it read as a division
   * rather than as an underline on the row above.
   */
  cut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two + 4,
    paddingBottom: Spacing.one,
  },
  rule: { flex: 1, height: 1 },
});
