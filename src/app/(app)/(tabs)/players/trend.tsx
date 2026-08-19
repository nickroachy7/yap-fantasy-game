/**
 * Who is heating up, and who has gone cold.
 *
 * The directory next door answers "who is good"; this answers "who changed",
 * which is the question that actually precedes spending gems. Both halves are
 * on screen at once rather than behind a toggle, because a faller is a reason
 * to act as much as a riser is, and hiding one behind a tab makes the screen
 * feel like a hype feed.
 *
 * See `trend/movers.ts` for why this measures production rather than the
 * add/drop volume the same screen shows on Sleeper.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { weekLabel } from '@/components/scores/scoreboard';
import { useSeasonSchedule, useWeekLeaders, type Slate } from '@/components/scores/use-scores';
import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';
import { useIsWide, useTabBarInset } from '@/components/shell/useResponsive';
import { computeMovers, deltaText, type Mover } from '@/components/trend/movers';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PositionBadge } from '@/components/ui/PositionBadge';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { POSITION_ORDER, type PositionKey } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

const FALLBACK_SEASON = 2026;

/** Rows per column. A mover list is a shortlist; twenty is a directory. */
const SHOWN = 12;

/**
 * A player has to have been worth starting in at least one of the two weeks to
 * appear. Six points is roughly a replacement-level game — below it the list
 * fills with third-stringers whose "+3.1" is arithmetically true and tells you
 * nothing.
 */
const MINIMUM_POINTS = 6;

type PosFilter = PositionKey | 'ALL';

/** Same control as the directory and the collection: chips, not underlines. */
const POS_FILTERS: PosFilter[] = ['ALL', ...POSITION_ORDER];

export default function TrendScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const wide = useIsWide();
  const tabInset = useTabBarInset();

  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [seeded, setSeeded] = useState(false);
  const [pos, setPos] = useState<PosFilter>('ALL');

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('current_slate');
      const row = (data as { season: number }[] | null)?.[0];
      if (!error && row) setSeason(row.season);
      setSeeded(true);
    })();
  }, []);

  const { games, slates, teams, loading, error } = useSeasonSchedule(season);

  /**
   * The two most recently COMPLETED slates.
   *
   * Completion is read from the fixtures rather than from the stat lines: a
   * slate whose games are all final is one we expect to have swept, so if its
   * stat lines are missing the screen should say "no data yet" rather than
   * silently comparing week 12 against week 3 and presenting the gap as form.
   */
  const [recentSlate, previousSlate] = useMemo(() => {
    const completed = slates.filter((s) =>
      games.some(
        (g) => g.seasonType === s.seasonType && g.week === s.week && g.status === 'final',
      ),
    );
    const tail = completed.slice(-2);
    return [tail[1] ?? tail[0] ?? null, tail.length > 1 ? tail[0] : null] as [
      Slate | null,
      Slate | null,
    ];
  }, [slates, games]);

  const recent = useWeekLeaders(recentSlate, teams);
  const previous = useWeekLeaders(previousSlate, teams);

  const movers = useMemo(
    () => computeMovers(recent.leaders, previous.leaders, MINIMUM_POINTS),
    [recent.leaders, previous.leaders],
  );

  const filtered = useMemo(
    () => (pos === 'ALL' ? movers : movers.filter((m) => m.position === pos)),
    [movers, pos],
  );

  const risers = useMemo(() => filtered.filter((m) => m.delta > 0).slice(0, SHOWN), [filtered]);
  const fallers = useMemo(
    () =>
      filtered
        .filter((m) => m.delta < 0)
        .slice(-SHOWN)
        // computeMovers sorts descending, so the tail is already the worst —
        // but it is in ascending-severity order and this column reads best
        // with the biggest drop at the top.
        .reverse(),
    [filtered],
  );

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  const busy = !seeded || loading || recent.loading || previous.loading;

  const comparison =
    recentSlate && previousSlate
      ? `${weekLabel(previousSlate.seasonType, previousSlate.week)} → ${weekLabel(recentSlate.seasonType, recentSlate.week)}`
      : null;

  const body = () => {
    if (busy) return <ActivityIndicator style={styles.pad} />;
    if (error || recent.error || previous.error) {
      return (
        <EmptyState
          title="Could not load the trend"
          body={error ?? recent.error ?? previous.error ?? ''}
        />
      );
    }
    if (!recentSlate || !previousSlate) {
      return (
        <EmptyState
          title="Not enough football yet"
          body="Movement needs two completed weeks to compare. Check back once a second week has been played and swept."
        />
      );
    }
    if (movers.length === 0) {
      return (
        <EmptyState
          title="Nothing to compare"
          body={`No player scored at least ${MINIMUM_POINTS} points in both weeks. That is normal early in the preseason, when few starters play twice.`}
        />
      );
    }

    return (
      <View style={wide ? styles.split : styles.stack}>
        <View style={styles.column}>
          <MoverColumn
            title="Trending up"
            hint="Biggest gain on the week"
            movers={risers}
            onOpen={openPlayer}
            empty="No player improved on the week at this position."
          />
        </View>
        <View style={styles.column}>
          <MoverColumn
            title="Trending down"
            hint="Biggest drop on the week"
            movers={fallers}
            onOpen={openPlayer}
            empty="No player fell back on the week at this position."
          />
        </View>
      </View>
    );
  };

  return (
    <Screen
      title="Trend"
      measure="grid"
      context={comparison ?? `${season} season`}>
      <SectionNav section="/players" />

      <ChipRow>
        {POS_FILTERS.map((p) => (
          <Chip
            key={p}
            selected={pos === p}
            label={p === 'ALL' ? 'ALL' : p}
            onPress={() => setPos(p)}
            accessibilityLabel={p === 'ALL' ? 'All positions' : p}
          />
        ))}
      </ChipRow>

      {comparison ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          {`Change in fantasy points, ${comparison}. Players who did not play both weeks are left out rather than scored as zero.`}
        </Text>
      ) : null}

      {body()}

      <View style={{ height: tabInset }} />
    </Screen>
  );
}

function MoverColumn({
  title,
  hint,
  movers,
  onOpen,
  empty,
}: {
  title: string;
  hint: string;
  movers: Mover[];
  onOpen: (playerId: string) => void;
  empty: string;
}) {
  return (
    <Panel title={title} hint={hint}>
      {movers.length === 0 ? (
        <EmptyState title="Nothing here" body={empty} />
      ) : (
        movers.map((m, i) => <MoverRow key={m.playerId} mover={m} rank={i + 1} onPress={onOpen} />)
      )}
    </Panel>
  );
}

function MoverRow({
  mover,
  rank,
  onPress,
}: {
  mover: Mover;
  rank: number;
  onPress: (playerId: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const up = mover.delta > 0;

  return (
    <Pressable
      onPress={() => onPress(mover.playerId)}
      accessibilityRole="button"
      accessibilityLabel={`${mover.name}, ${mover.positionLabel ?? 'unknown position'}, ${mover.before.toFixed(1)} to ${mover.after.toFixed(1)} points, ${up ? 'up' : 'down'} ${Math.abs(mover.delta).toFixed(1)}${mover.owned ? ', in your collection' : ''}`}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.border },
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.fine, NUMERIC, styles.rank, { color: c.textTertiary }]}>{rank}</Text>
      <PositionBadge label={mover.positionLabel} size={20} />
      <View style={styles.name}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {mover.name}
        </Text>
        {/* The two numbers behind the delta. A movement figure with no
            before-and-after is unfalsifiable, and the pair costs one quiet
            line — which is a good trade for making the claim checkable. */}
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {`${mover.teamAbbreviation ?? '—'} · ${mover.before.toFixed(1)} → ${mover.after.toFixed(1)}`}
        </Text>
      </View>
      {mover.owned ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.owned, { backgroundColor: c.positive }]}
        />
      ) : (
        <View style={styles.owned} />
      )}
      <Text
        style={[Type.strong, NUMERIC, styles.delta, { color: up ? c.positive : c.negative }]}>
        {deltaText(mover.delta)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  stack: { gap: 14 },
  split: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 18, textAlign: 'right' },
  name: { flex: 1, minWidth: 0 },
  owned: { width: 6, height: 6, borderRadius: 3 },
  delta: { width: 54, textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
