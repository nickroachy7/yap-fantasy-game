/**
 * Every week this copy was started, and what it earned.
 *
 * WHY THIS IS NOT THE PLAYER'S GAME LOG
 *
 * The game log on the player profile lists what the PLAYER did — every week of
 * every season, whoever owned him. This lists what YOUR COPY did, which is a
 * strictly smaller set: the weeks you actually put him in the lineup. The gap
 * between the two is the most useful thing on the card profile. A player can
 * have a 30-point week that your card earned nothing from, because your card
 * was on the bench that week, and no other screen in the app will ever tell you
 * that.
 *
 * So the totals here reconcile with `career_fp` exactly, by construction — this
 * list IS what career_fp is the sum of. If they ever disagree, the scoring path
 * is wrong and this screen is the place it shows up first.
 *
 * PENDING IS NOT ZERO. A start in a week that has not been swept yet has no
 * points at all, which is not the same as a start worth nothing. Both are drawn
 * differently and the pending ones are excluded from the average, exactly as
 * the season summaries in GameLog exclude unplayed fixtures.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Row } from './Section';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { seasonTypeLabel, weekLabel } from './game-log';
import type { CardStart } from './card-profile';

const DASH = '—';

type StartSection = { key: string; label: string; starts: CardStart[]; total: number; scored: number };

/** Newest season first; within a season the most recent week first. */
function group(starts: CardStart[]): StartSection[] {
  const byKey = new Map<string, CardStart[]>();
  for (const s of starts) {
    const key = `${s.season}-${s.seasonType}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(s);
    else byKey.set(key, [s]);
  }

  const out: StartSection[] = [];
  for (const [key, bucket] of byKey) {
    const scored = bucket.filter((s) => s.scored && s.points !== null);
    out.push({
      key,
      label: `${bucket[0].season} ${seasonTypeLabel(bucket[0].seasonType)}`,
      starts: [...bucket].sort((a, b) => (b.week ?? 0) - (a.week ?? 0)),
      total: scored.reduce((sum, s) => sum + (s.points ?? 0), 0),
      scored: scored.length,
    });
  }
  return out.sort((a, b) => b.label.localeCompare(a.label));
}

export function StartLog({ starts, playerName }: { starts: CardStart[]; playerName: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /**
   * A TABLE ONLY WHEN THERE IS SOMETHING IN IT.
   *
   * A copy started once in a week that has not swept produced a section
   * heading, a season band, four column heads and one row of two dashes — most
   * of a screen of furniture around a single fact, on the card where a new
   * player spends their first minutes. Three states now, and only the last one
   * is a table:
   *
   *   never started   one row, and the reason it matters
   *   started, none scored yet   one row saying how many and that they have not
   *   something scored   the table, which is now a receipt for real numbers
   */
  if (starts.length === 0) {
    return (
      <Row
        label="Started"
        value={`Never — it earns nothing until you play ${playerName}`}
        muted
      />
    );
  }

  const scored = starts.filter((s) => s.scored).length;

  if (scored === 0) {
    return (
      <Row
        label="Started"
        value={`${starts.length} week${starts.length === 1 ? '' : 's'} · not scored yet`}
        muted
      />
    );
  }

  const sections = group(starts);
  const pending = starts.length - scored;

  return (
    <View>
      {sections.map((section) => (
        <View key={section.key}>
          <View style={styles.sectionHead}>
            <Text style={[Type.strong, { color: c.text }]}>{section.label}</Text>
            <Text style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
              {section.scored > 0
                ? `${section.total.toFixed(1)} FP · ${(section.total / section.scored).toFixed(1)} avg`
                : 'not scored yet'}
            </Text>
          </View>

          <View style={[styles.row, styles.headRow, { borderColor: c.border }]}>
            <Text style={[Type.micro, styles.wk, { color: c.textTertiary }]}>WK</Text>
            <Text style={[Type.micro, styles.slot, { color: c.textTertiary }]}>SLOT</Text>
            <Text style={[Type.micro, styles.share, { color: c.textTertiary }]}>OF LINEUP</Text>
            <Text style={[Type.micro, styles.fp, { color: c.textTertiary }]}>FP</Text>
          </View>

          {section.starts.map((s) => (
            <StartRow key={`${s.season}-${s.seasonType}-${s.week}-${s.slot}`} start={s} />
          ))}
        </View>
      ))}

      {/* The sweep's own caveat, and only on the card it is actually true of.
          It used to print under every start log. */}
      {pending > 0 ? (
        <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
          {`${pending} start${pending === 1 ? '' : 's'} not yet scored — those weeks show no figure rather than a nought.`}
        </Text>
      ) : null}
    </View>
  );
}

function StartRow({ start }: { start: CardStart }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The card's share of what the whole lineup scored that week. Only drawn
     when both numbers are real: a share of an unscored lineup is meaningless,
     and a share of zero is a division nobody wants to see. */
  const share =
    start.scored && start.points !== null && start.lineupTotal !== null && start.lineupTotal > 0
      ? start.points / start.lineupTotal
      : null;

  return (
    <View style={[styles.row, { borderColor: c.border }, !start.scored && styles.pending]}>
      <Text style={[Type.body, styles.wk, NUMERIC, { color: c.textSecondary }]}>
        {weekLabel(start.seasonType, start.week)}
      </Text>
      <Text style={[Type.body, styles.slot, { color: c.text }]} numberOfLines={1}>
        {start.slot}
      </Text>
      <Text style={[Type.body, styles.share, NUMERIC, { color: c.textTertiary }]}>
        {share === null ? DASH : `${Math.round(share * 100)}%`}
      </Text>
      <Text
        style={[
          start.scored ? Type.strong : Type.body,
          styles.fp,
          NUMERIC,
          { color: start.points === null ? c.textTertiary : c.text },
        ]}>
        {start.points === null ? DASH : start.points.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* No fill and no full-bleed band any more: the zone above supplies the
     heading, so this only has to separate one season from the next. */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingBottom: Spacing.one + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  headRow: { height: 22 },
  /** Dimmed so the eye skims past what has not been scored yet. */
  pending: { opacity: 0.55 },
  wk: { width: 34 },
  slot: { width: 52 },
  share: { flex: 1, textAlign: 'right' },
  fp: { width: 56, textAlign: 'right' },
  note: { paddingTop: Spacing.two },
});
