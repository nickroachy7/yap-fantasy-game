/**
 * The scoreboard.
 *
 * A fantasy app without one is a spreadsheet: the lineup screen tells you what
 * you decided, and this tells you what the decision was worth. It answers three
 * questions in one place — what is on this week, what happened in it, and did
 * any of it happen to a player you own.
 *
 * Everything on this screen has already happened. There are no projections and
 * no win probabilities, because the provider sells neither (see the infra
 * notes) and a made-up number beside a real one poisons both.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GameRow } from '@/components/scores/GameRow';
import { LeadersPanel } from '@/components/scores/LeadersPanel';
import {
  groupByKickoff,
  kickoffLabel,
  scoreText,
  seasonTypeLabel,
  weekLabel,
  type ScoreGame,
} from '@/components/scores/scoreboard';
import { slateKey, useSeasonSchedule, useWeekLeaders, type Slate } from '@/components/scores/use-scores';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { LINEUP_SEGMENTS } from '@/components/shell/sections';
import { useIsWide, useTabBarInset } from '@/components/shell/useResponsive';
import { DropdownChip, type DropdownOption } from '@/components/ui/DropdownChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { POSITION_ORDER, type PositionKey } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

/** Only used if `current_slate()` fails; the app's first season either way. */
const FALLBACK_SEASON = 2026;

/** Rows per position group. Ten is a screen; twenty is a directory. */
const LEADER_LIMIT = 10;

type PosFilter = PositionKey | 'ALL';

const POS_TABS: Tab<PosFilter>[] = [
  { value: 'ALL', label: 'All' },
  ...POSITION_ORDER.map((p) => ({ value: p as PosFilter, label: p })),
];

export default function ScoresScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const wide = useIsWide();
  const tabInset = useTabBarInset();

  /* The season and the opening week come from the database rather than the
     clock: `current_slate()` already encodes what "now" means for this game
     (which is not the same as today's date during a bye or the offseason), and
     the leaderboard reads the same function. Two screens disagreeing about
     what week it is would be worse than one extra round trip. */
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [slate, setSlate] = useState<Slate | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('current_slate');
      const row = (data as { season: number; season_type: number; week: number }[] | null)?.[0];
      if (!error && row) {
        setSeason(row.season);
        setSlate({ season: row.season, seasonType: row.season_type, week: row.week });
      }
      setSeeded(true);
    })();
  }, []);

  const { games, slates, teams, loading, error, reload } = useSeasonSchedule(season);

  /* If the RPC gave us nothing, open on the last slate that has actually
     kicked off — a scoreboard opening on week 1 in December is useless. */
  useEffect(() => {
    if (slate || slates.length === 0) return;
    const now = Date.now();
    const started = [...slates]
      .reverse()
      .find((s) =>
        games.some(
          (g) =>
            g.seasonType === s.seasonType &&
            g.week === s.week &&
            g.startsAt !== null &&
            new Date(g.startsAt).getTime() <= now,
        ),
      );
    setSlate(started ?? slates[0]);
  }, [slate, slates, games]);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const { leaders, loading: leadersLoading, error: leadersError } = useWeekLeaders(slate, teams);

  const weekGames = useMemo(
    () =>
      slate
        ? games.filter((g) => g.seasonType === slate.seasonType && g.week === slate.week)
        : [],
    [games, slate],
  );

  const windows = useMemo(() => groupByKickoff(weekGames), [weekGames]);

  const selectedGame = useMemo(
    () => weekGames.find((g) => g.id === selectedGameId) ?? null,
    [weekGames, selectedGameId],
  );

  const shown = useMemo(() => {
    const scoped = selectedGame ? leaders.filter((l) => l.gameId === selectedGame.id) : leaders;
    return posFilter === 'ALL' ? scoped : scoped.filter((l) => l.position === posFilter);
  }, [leaders, selectedGame, posFilter]);

  const order = useMemo<PositionKey[]>(
    () => (posFilter === 'ALL' ? POSITION_ORDER : [posFilter]),
    [posFilter],
  );

  const slateOptions = useMemo<DropdownOption<string>[]>(
    () =>
      slates.map((s) => ({
        value: slateKey(s),
        label: weekLabel(s.seasonType, s.week),
      })),
    [slates],
  );

  const pickSlate = useCallback(
    (key: string) => {
      const next = slates.find((s) => slateKey(s) === key);
      if (!next) return;
      setSlate(next);
      // A game id belongs to one week; carrying it across would select nothing
      // and leave the panel showing an empty "no leaders in this game".
      setSelectedGameId(null);
    },
    [slates],
  );

  const toggleGame = useCallback(
    (g: ScoreGame) => setSelectedGameId((cur) => (cur === g.id ? null : g.id)),
    [],
  );

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  const ownedCount = useMemo(
    () => new Set(shown.filter((l) => l.owned).map((l) => l.playerId)).size,
    [shown],
  );

  const context = slate
    ? `${slate.season} ${seasonTypeLabel(slate.seasonType).toLowerCase()} · ${weekGames.length} game${weekGames.length === 1 ? '' : 's'}`
    : 'Schedule';

  const schedule = (
    <Panel
      title="Schedule"
      hint={selectedGame ? 'Tap the selected game to clear it' : 'Tap a game for its leaders'}>
      {windows.length === 0 ? (
        <EmptyState title="No fixtures" body="This week has no games on the schedule." />
      ) : (
        windows.map((w) => (
          <View key={w.key}>
            <Text
              style={[
                Type.micro,
                styles.window,
                { color: c.textTertiary, backgroundColor: c.surfaceSunken },
              ]}>
              {w.label}
            </Text>
            {w.games.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                selected={g.id === selectedGameId}
                onPress={toggleGame}
              />
            ))}
          </View>
        ))
      )}
    </Panel>
  );

  const leaderBody = leadersLoading ? (
    <ActivityIndicator style={styles.pad} />
  ) : leadersError ? (
    <EmptyState title="Could not load this week" body={leadersError} />
  ) : (
    <LeadersPanel
      leaders={shown}
      order={order}
      limit={LEADER_LIMIT}
      onOpenPlayer={openPlayer}
      emptyTitle={selectedGame ? 'Nothing scored yet' : 'No scores yet'}
      emptyBody={
        selectedGame
          ? 'This game has not produced any scored stat lines.'
          : 'Once these games are played and swept, the week’s best performances appear here.'
      }
    />
  );

  const leadersPanel = (
    <Panel
      title={selectedGame ? matchupTitle(selectedGame) : 'Week leaders'}
      hint={
        ownedCount > 0
          ? `${ownedCount} of these ${ownedCount === 1 ? 'is' : 'are'} in your collection`
          : 'A green dot marks a player you hold a card for'
      }>
      {selectedGame ? <GameBanner game={selectedGame} /> : null}
      <View style={styles.filter}>
        <Tabs tabs={POS_TABS} value={posFilter} onChange={setPosFilter} />
      </View>
      {leaderBody}
    </Panel>
  );

  if (!seeded || loading) {
    return (
      <Screen title="Scores" measure="grid" context="Loading">
        <SubNav segments={LINEUP_SEGMENTS} inset={false} />
        <ActivityIndicator style={styles.pad} />
      </Screen>
    );
  }

  return (
    /* `Screen` owns the scroll container, the measure and the pull-to-refresh.
       An earlier draft nested its own ScrollView in here, which duplicated the
       padding and quietly cost the refresh gesture — Screen only wires it when
       it is the one scrolling. */
    <Screen
      title="Scores"
      measure="grid"
      context={context}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}>
      <SubNav segments={LINEUP_SEGMENTS} inset={false} />

      <View style={styles.controls}>
        {slateOptions.length > 0 && slate ? (
          <DropdownChip
            value={slateKey(slate)}
            options={slateOptions}
            onChange={pickSlate}
            columns={3}
            title="Jump to week"
            accessibilityLabel="Week"
          />
        ) : null}
        {slate && weekGames.some((g) => g.status === 'live') ? (
          <StatusChip label="Games in progress" tone="live" />
        ) : null}
      </View>

      {error ? <Text style={[Type.fine, { color: c.negative }]}>{error}</Text> : null}

        {/* Wide puts the schedule beside the leaders, because the whole point of
            a game centre is picking a game and reading it without losing the
            list. Narrow stacks them — a 300pt column and a leaderboard side by
            side on a phone gives neither enough room to be read. */}
      <View style={wide ? styles.wideSplit : styles.stack}>
        <View style={wide ? styles.scheduleCol : undefined}>{schedule}</View>
        <View style={wide ? styles.leadersCol : undefined}>{leadersPanel}</View>
      </View>

      <View style={{ height: tabInset }} />
    </Screen>
  );
}

/** "LV at HOU" — the away side first, as every schedule in the sport writes it. */
function matchupTitle(game: ScoreGame): string {
  return `${game.away?.abbreviation ?? '—'} at ${game.home?.abbreviation ?? '—'}`;
}

/**
 * The selected game, restated above its leaders.
 *
 * Without this the panel title changes and nothing else does, so it is easy to
 * read the filtered list as though it were still the whole week.
 */
function GameBanner({ game }: { game: ScoreGame }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const scheduled = game.status === 'scheduled';

  return (
    <View style={[styles.banner, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <View style={styles.bannerSide}>
        <Text style={[Type.section, { color: c.text }]}>{game.away?.abbreviation ?? '—'}</Text>
        <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
          {scoreText(game.awayScore, game.status)}
        </Text>
      </View>
      <View style={styles.bannerMid}>
        <Text style={[Type.micro, { color: c.textTertiary }]}>
          {scheduled ? kickoffLabel(game.startsAt) : (game.statusText ?? 'FINAL').toUpperCase()}
        </Text>
        <Text style={[Type.fine, { color: c.textTertiary }]}>at</Text>
      </View>
      <View style={[styles.bannerSide, styles.bannerRight]}>
        <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
          {scoreText(game.homeScore, game.status)}
        </Text>
        <Text style={[Type.section, { color: c.text }]}>{game.home?.abbreviation ?? '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  window: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 1,
    letterSpacing: 1,
  },
  stack: { gap: 14 },
  wideSplit: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  scheduleCol: { width: 300, flexShrink: 0 },
  leadersCol: { flex: 1, minWidth: 0 },
  filter: { paddingBottom: Spacing.two },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.two,
  },
  bannerSide: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flex: 1 },
  bannerRight: { justifyContent: 'flex-end' },
  bannerMid: { alignItems: 'center' },
});
