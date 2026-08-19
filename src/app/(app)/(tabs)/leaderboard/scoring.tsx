/**
 * How points are earned.
 *
 * This is the one screen in the app that was simply missing. Every other
 * surface — the lineup, the leaderboard, a card's tier — is denominated in
 * fantasy points, and until now there was nowhere to find out what a fantasy
 * point IS. A scoring system nobody can read is indistinguishable from an
 * arbitrary one, which is a bad property for the number the entire game ranks
 * people by.
 *
 * It lives under Leaderboard rather than Profile because scoring is a rule of
 * the competition, not a preference of the account.
 *
 * The page reads the ACTIVE row from `scoring_rules` and renders whatever is in
 * it. It does not restate the constants the edge function ships with — see
 * `components/scoring/rules.ts` for why that distinction matters.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';
import {
  parseScoringSheet,
  pointsText,
  type ScoringGroup,
  type ScoringSheet,
} from '@/components/scoring/rules';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { useTabBarInset } from '@/components/shell/useResponsive';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export default function ScoringScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tabInset = useTabBarInset();

  const [sheet, setSheet] = useState<ScoringSheet | null>(null);

  const load = useCallback<Load>(async (live) => {
    const { data, error: err } = await supabase
      .from('scoring_rules')
      .select('version, name, rules')
      .eq('is_active', true)
      // Exactly one row should be active, but ordering and taking the newest
      // means a bad migration that activates two shows the later ruleset rather
      // than whichever one the planner happened to return first.
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!live()) return;
    setSheet(data ? parseScoringSheet(data.rules, data.version, data.name) : null);
    return err ? err.message : null;
  }, []);

  const { loading, refreshing, error, reload, refresh } = useLoader(load);

  const body = () => {
    if (loading) return <ActivityIndicator style={styles.pad} />;
    if (error) {
      return (
        <EmptyState
          title="Could not load the scoring rules"
          body={error}
          actionLabel="Try again"
          onAction={reload}
        />
      );
    }
    if (!sheet) {
      return (
        <EmptyState
          title="No active ruleset"
          body="No scoring ruleset is marked active. Scoring is paused until one is."
        />
      );
    }

    return (
      <>
        <View style={styles.meta}>
          <StatusChip label={`Version ${sheet.version}`} />
          <Text style={[Type.fine, { color: c.textSecondary }]}>{sheet.name}</Text>
        </View>

        <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
          Every fantasy point in this app — on your lineup, on the leaderboard, and in the career
          total that promotes a card&rsquo;s tier — is produced by the rules below, applied to each
          player&rsquo;s stat line for a game.
        </Text>

        {sheet.groups.map((group) => (
          <ScoringPanel key={group.title} group={group} />
        ))}

        {sheet.bonuses.length > 0 ? (
          <Panel
            title="Bonuses"
            hint="Awarded once when the threshold is reached, on top of the per-yard rate">
            {sheet.bonuses.map((b) => (
              <Row
                key={`${b.stat}-${b.atLeast}`}
                label={`${b.label}, ${b.atLeast}+`}
                points={b.points}
              />
            ))}
          </Panel>
        ) : null}

        {/* Honest about the edge case rather than silently correct. */}
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          Defensive and special-teams touchdowns score for the player who scored them. There are no
          team defence or individual defensive-player positions in this game, so tackles, sacks and
          coverage stats are not scored.
        </Text>
      </>
    );
  };

  return (
    <Screen
      title="Scoring"
      measure="form"
      context="How a fantasy point is earned"
      refreshing={refreshing}
      onRefresh={() => void refresh()}>
      <SectionNav section="/leaderboard" />
      {body()}
      <View style={{ height: tabInset }} />
    </Screen>
  );
}

function ScoringPanel({ group }: { group: ScoringGroup }) {
  return (
    <Panel title={group.title}>
      {group.items.map((item) => (
        <Row key={item.stat} label={item.label} points={item.points} note={item.note} />
      ))}
    </Panel>
  );
}

/**
 * Label left, value right — the plain label/value row the spec uses for every
 * settings block.
 *
 * Positive and negative are coloured because the sign is the single most
 * important character in the row, but the sign itself is ALSO printed. A
 * scoring sheet read in greyscale, or by someone who cannot separate the two
 * hues, still says which way each rule cuts.
 */
function Row({ label, points, note }: { label: string; points: number; note?: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const negative = points < 0;

  return (
    <View style={[styles.row, { borderColor: c.border }]}>
      <View style={styles.rowText}>
        <Text style={[Type.body, { color: c.text }]}>{label}</Text>
        {note ? <Text style={[Type.fine, { color: c.textTertiary }]}>{note}</Text> : null}
      </View>
      <Text style={[Type.strong, NUMERIC, { color: negative ? c.negative : c.positive }]}>
        {pointsText(points)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flexShrink: 1, gap: 1 },
});
