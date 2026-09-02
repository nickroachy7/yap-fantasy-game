/**
 * Where one copy sits among every copy of the same player, on a scale from
 * nothing to the best copy in the game.
 *
 * WHY A SCALE AND NOT A RANK
 *
 * "#12 of 15" is arithmetic: the reader has to know the spread before the
 * position means anything, and the spread is exactly what a rank throws away.
 * Twelfth of fifteen is a disaster when the top copy has 184 and the rest are
 * bunched at 150, and it is nothing at all when eleven copies have never been
 * started. The scale shows the spread and the position in one object, and the
 * rank rides along as the section's hint for anyone who wants the number.
 *
 * WHAT THE MARKS ACTUALLY ARE, AND WHY THERE ARE SO FEW
 *
 * `player_market` returns totals, the best copy, your best, and a per-tier
 * best — not every copy's career FP. So this plots what exists: your copy, the
 * average, the best in the game, and each tier's best. Four to six marks.
 *
 * That is a deliberate refusal rather than a compromise. A dot per copy was
 * drawn first and it was fifteen dots of which four were real; the other eleven
 * would have been positions invented to make the picture look like a
 * distribution. If the RPC ever returns the full set this component takes it
 * without changing shape — pass more into `marks`.
 *
 * HOW THE LABELS ARE KEPT APART
 *
 * By construction, not by collision testing. YOURS is the only thing ABOVE the
 * axis; the average and the best are the only things BELOW it. So the mark a
 * reader is looking for can never be covered by the other two, whatever the
 * values are — including the case that broke the first version, a copy on 0.0
 * whose dot lands at the far left in the middle of the cluster of copies that
 * have also never been started.
 *
 * The remaining pair — average and best, both below — can only collide if the
 * average IS the best, which means every copy has earned the same, which means
 * there is nothing to compare. The scale does not draw at all in that case; see
 * the `best <= 0` guard.
 *
 * NO PERCENTAGE TRANSFORMS. React Native cannot translate by a percentage, so a
 * label cannot be centred on its own mark the way CSS would do it. Each label
 * therefore ANCHORS: left-aligned from its position in the left half, right-
 * aligned to it in the right half. A label can never leave the box, which is
 * the property that actually matters, and it costs one ternary.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Side of the dot marking your copy. The others are derived from it. */
const YOU_DOT = 13;
const BEST_DOT = 9;
const MARK_DOT = 7;

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const round = (n: number) => Math.round(n).toLocaleString();

/**
 * A dot's offset so it stays inside the track at both ends.
 *
 * Zero at the left edge, minus its whole width at the right, and half way in
 * between — so the mark reads as centred on its value everywhere except the two
 * ends, where a centred dot would hang off the box instead.
 */
const nudge = (pct: number, size: number) => -(size * (pct / 100));

export function EarningsScale({
  yours,
  average,
  best,
  marks,
  bestLabel,
}: {
  /** This copy, or your best copy. Null when you hold none of the player. */
  yours: number | null;
  average: number | null;
  /** The top of the scale. Everything is measured against it. */
  best: number;
  /** Other real positions — each tier's best copy. Zeroes are dropped. */
  marks: number[];
  /** Who holds the best copy, printed under the scale. */
  bestLabel?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* NOBODY HAS EARNED ANYTHING, so there is no scale to draw — every mark would
     sit on the same point at the left edge and the picture would say "you are
     level with the best copy in the game", which is true and deeply misleading.
     The caller prints a sentence instead. */
  if (best <= 0) return null;

  const at = (v: number) => Math.min(100, Math.max(0, (v / best) * 100));

  const youPct = yours === null ? null : at(yours);
  const avgPct = average === null ? null : at(average);

  /* The tier bests, minus the one that IS the best copy — drawing a grey dot
     under the gold one is a mark that says nothing and hides the one that
     does. */
  const ticks = marks
    .filter((m) => m > 0 && m < best)
    .map(at);

  return (
    <View>
      <View style={styles.scale}>
        {/* ---- YOURS, above the line ------------------------------------- */}
        {youPct !== null ? (
          <>
            <Text
              style={[
                Type.micro,
                styles.above,
                { color: c.text },
                youPct <= 50 ? { left: `${youPct}%` } : { right: `${100 - youPct}%` },
              ]}>
              {`YOURS ${oneDp(yours as number)}`}
            </Text>
            <View
              style={[
                styles.stem,
                styles.stemUp,
                { backgroundColor: c.borderRaised },
                youPct <= 50 ? { left: `${youPct}%` } : { right: `${100 - youPct}%` },
              ]}
            />
          </>
        ) : null}

        <View style={[styles.axis, { backgroundColor: c.backgroundSelected }]} />

        {/* ---- the other copies that top their tier ---------------------- */}
        {ticks.map((pct) => (
          <View
            key={pct}
            style={[
              styles.mark,
              { left: `${pct}%`, marginLeft: nudge(pct, MARK_DOT), backgroundColor: c.borderRaised },
            ]}
          />
        ))}

        {/* ---- the best copy in the game --------------------------------- */}
        <View
          style={[
            styles.best,
            { left: '100%', marginLeft: -BEST_DOT, backgroundColor: c.warning },
          ]}
        />

        {/* LAST, so it paints over any mark it lands on. A copy that ties a
            tier best would otherwise be hidden behind that tier's grey dot —
            which is the one mark on here that must always be findable. The
            ring is the sheet's own ground rather than a colour, so the dot
            separates from a neighbour without introducing a fourth hue. */}
        {youPct !== null ? (
          <View
            style={[
              styles.you,
              {
                left: `${youPct}%`,
                marginLeft: nudge(youPct, YOU_DOT),
                backgroundColor: c.text,
                borderColor: c.surfaceSheet,
              },
            ]}
          />
        ) : null}

        {/* ---- the average, below the line ------------------------------- */}
        {avgPct !== null ? (
          <>
            <View
              style={[
                styles.stem,
                styles.stemDown,
                { backgroundColor: c.borderRaised },
                avgPct <= 50 ? { left: `${avgPct}%` } : { right: `${100 - avgPct}%` },
              ]}
            />
            <Text
              style={[
                Type.fine,
                NUMERIC,
                styles.below,
                { color: c.textTertiary },
                avgPct <= 50 ? { left: `${avgPct}%` } : { right: `${100 - avgPct}%` },
              ]}>
              {`avg ${round(average as number)}`}
            </Text>
          </>
        ) : null}

        <Text style={[Type.fine, NUMERIC, styles.below, styles.bestText, { color: c.warning }]}>
          {`best ${round(best)}`}
        </Text>
      </View>

      {bestLabel ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>{bestLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Three bands: the label above (0–14), the axis and its dots (14–34), the
     labels below (38–). Fixed, because everything in it is absolutely
     positioned against these numbers. */
  scale: { height: 56, marginBottom: Spacing.two - 2 },
  axis: { position: 'absolute', left: 0, right: 0, top: 26, height: StyleSheet.hairlineWidth },
  above: { position: 'absolute', top: 0 },
  below: { position: 'absolute', top: 40 },
  bestText: { right: 0 },
  stem: { position: 'absolute', width: StyleSheet.hairlineWidth },
  stemUp: { top: 14, height: 12 },
  stemDown: { top: 27, height: 11 },
  mark: {
    position: 'absolute',
    top: 26 - MARK_DOT / 2,
    width: MARK_DOT,
    height: MARK_DOT,
    borderRadius: MARK_DOT / 2,
  },
  best: {
    position: 'absolute',
    top: 26 - BEST_DOT / 2,
    width: BEST_DOT,
    height: BEST_DOT,
    borderRadius: BEST_DOT / 2,
  },
  you: {
    position: 'absolute',
    top: 26 - YOU_DOT / 2,
    width: YOU_DOT,
    height: YOU_DOT,
    borderRadius: YOU_DOT / 2,
    borderWidth: 3,
  },
});
