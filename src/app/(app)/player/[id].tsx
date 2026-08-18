/**
 * Player detail: who this player is, what they have produced this season, and
 * the week-by-week game log behind that total.
 *
 * The route param is the PLAYER id (not the card id) — a player is one row in
 * the directory but potentially many owned card instances.
 *
 * No photo, no logo, no jersey: unlicensed. Club is text, position is a glyph.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { InjuryChip } from '@/components/cards/InjuryChip';
import { PositionGlyph } from '@/components/cards/PositionGlyph';
import {
  DIRECTORY_COLUMNS,
  normalise,
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import { Screen } from '@/components/shell/Screen';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

type GameLogEntry = {
  id: string;
  season: number;
  seasonType: number;
  week: number | null;
  /** Null when the active ruleset has not scored this line yet. */
  points: number | null;
  startsAt: string | null;
  statusState: string | null;
  /** 'vs SEA' / '@ SEA' — text only, never a club mark. */
  opponent: string | null;
  headline: { label: string; value: string }[];
};

/**
 * The stats worth printing under a fantasy score, in reading order. A row only
 * shows the ones it actually has: nulls are normal and expected — a running
 * back has no passing line.
 */
const HEADLINE_STATS: { key: string; label: string }[] = [
  { key: 'passing_yards', label: 'PASS YD' },
  { key: 'passing_touchdowns', label: 'PASS TD' },
  { key: 'passing_interceptions', label: 'INT' },
  { key: 'rushing_yards', label: 'RUSH YD' },
  { key: 'rushing_touchdowns', label: 'RUSH TD' },
  { key: 'receptions', label: 'REC' },
  { key: 'receiving_yards', label: 'REC YD' },
  { key: 'receiving_touchdowns', label: 'REC TD' },
  { key: 'field_goals_made', label: 'FG' },
  { key: 'extra_points_made', label: 'XP' },
  { key: 'fumbles_lost', label: 'FUM' },
];

const MAX_HEADLINE = 5;

/**
 * The FK relationships exist, so PostgREST embeds these in one round trip.
 * `fantasy_points` comes back as an ARRAY, not an object: its primary key is
 * (stat_line_id, rules_version), so one stat line can carry a score per
 * ruleset version.
 */
const GAME_LOG_SELECT =
  'id, season, season_type, week, team_id, raw, fantasy_points(points, rules_version), games(starts_at, status_state, home_team_id, visitor_team_id)';

function rawNumber(raw: Json, key: string): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as { [k: string]: Json | undefined })[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function headlineFor(raw: Json): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const stat of HEADLINE_STATS) {
    if (out.length === MAX_HEADLINE) break;
    const n = rawNumber(raw, stat.key);
    if (n === null || n === 0) continue;
    out.push({ label: stat.label, value: String(Math.round(n * 10) / 10) });
  }
  return out;
}

/** 1 = preseason, 2 = regular, 3 = post. */
function weekLabel(seasonType: number, week: number | null): string {
  const w = week === null ? '—' : String(week);
  if (seasonType === 1) return `PRE ${w}`;
  if (seasonType === 3) return `POST ${w}`;
  return `WK ${w}`;
}

/**
 * Opponent as TEXT — three letters, never a club mark.
 *
 * Home/away is only asserted when the stat line records which side the player
 * was on; otherwise the fixture is shown neutrally rather than guessed.
 */
function opponentLabel(
  teamId: string | null,
  homeId: string | null,
  visitorId: string | null,
  abbrevOf: Map<string, string>,
): string | null {
  if (!homeId || !visitorId) return null;
  const home = abbrevOf.get(homeId);
  const visitor = abbrevOf.get(visitorId);
  if (!home || !visitor) return null;
  if (teamId === homeId) return `vs ${visitor}`;
  if (teamId === visitorId) return `@ ${home}`;
  return `${visitor} @ ${home}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formatted by hand rather than via `Intl`: Hermes ships without the full ICU
 * data on some builds, and a game log is not worth a locale gamble.
 */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [player, setPlayer] = useState<DirectoryPlayer | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!id) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [directoryRes, rulesRes, teamsRes, linesRes] = await Promise.all([
        supabase
          .from('player_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('player_id', id)
          .order('season', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('scoring_rules').select('version').eq('is_active', true).limit(1).maybeSingle(),
        supabase.from('teams').select('id, abbreviation'),
        supabase
          .from('stat_lines')
          // One string literal, not a concatenation: supabase-js infers the row
          // type from the literal, and a `+` join collapses it to `any`.
          .select(GAME_LOG_SELECT)
          .eq('player_id', id)
          .order('season', { ascending: false })
          .order('season_type', { ascending: false })
          .order('week', { ascending: false, nullsFirst: false }),
      ]);

      const failure = directoryRes.error ?? teamsRes.error ?? linesRes.error;
      if (failure) {
        setError(failure.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setPlayer(directoryRes.data ? normalise(directoryRes.data) : null);

      // Only the ACTIVE ruleset is shown. Older versions stay in the table for
      // audit, and mixing them would silently double-count a rescored week.
      const activeVersion = rulesRes.data?.version ?? null;
      const abbrevOf = new Map((teamsRes.data ?? []).map((t) => [t.id, t.abbreviation]));

      setLog(
        (linesRes.data ?? []).map((line): GameLogEntry => {
          const scored = (line.fantasy_points ?? []).find(
            (fp) => activeVersion !== null && fp.rules_version === activeVersion,
          );
          const game = line.games;
          const home = game?.home_team_id ?? null;
          const visitor = game?.visitor_team_id ?? null;

          return {
            id: line.id,
            season: line.season,
            seasonType: line.season_type,
            week: line.week,
            points: scored ? Number(scored.points) : null,
            startsAt: game?.starts_at ?? null,
            statusState: game?.status_state ?? null,
            opponent: opponentLabel(line.team_id, home, visitor, abbrevOf),
            headline: headlineFor(line.raw),
          };
        }),
      );

      setLoading(false);
      setRefreshing(false);
    },
    [id],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/cards');
  }, [router]);

  const body = () => {
    if (loading) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Could not load this player</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{error}</Text>
        </View>
      );
    }
    if (!player) {
      return (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Player not found</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            This player is not in the current card set.
          </Text>
        </View>
      );
    }

    return (
      <>
        <View style={[styles.identity, { backgroundColor: c.backgroundElement }]}>
          <PositionGlyph
            position={player.position}
            size={48}
            color={c.text}
            background={c.background}
            borderColor={c.backgroundSelected}
          />
          <View style={styles.identityText}>
            <Text numberOfLines={2} style={[styles.name, { color: c.text }]}>
              {player.name}
            </Text>
            <Text numberOfLines={1} style={[styles.subline, { color: c.textSecondary }]}>
              {[player.team?.toUpperCase(), player.position, player.rarity?.toUpperCase()]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <InjuryChip status={player.injuryStatus} size="detail" />
          </View>
        </View>

        <View style={styles.statRow}>
          <StatTile label="SEASON FP" value={oneDp(player.seasonFp)} emphasis />
          <StatTile label="GAMES" value={String(player.gamesPlayed)} />
          <StatTile label="FP / GAME" value={oneDp(player.fpPerGame)} />
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Game log</Text>

        {log.length === 0 ? (
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            No games recorded for this player yet.
          </Text>
        ) : (
          log.map((entry) => <GameLogRow key={entry.id} entry={entry} />)
        )}

        <View style={styles.tailSpace} />
      </>
    );
  };

  return (
    <Screen
      context={player ? `${player.season ?? ''} game log`.trim() : 'Player'}
      refreshing={refreshing}
      onRefresh={() => void load('refresh')}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back to cards"
        hitSlop={8}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={[styles.backText, { color: c.textSecondary }]}>‹ Cards</Text>
      </Pressable>
      {body()}
    </Screen>
  );
}

function StatTile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.tile, { backgroundColor: c.backgroundElement }]}>
      <Text numberOfLines={1} style={[styles.tileLabel, { color: c.textSecondary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.tileValue, NUMERIC, { color: c.text, fontSize: emphasis ? 24 : 20 }]}>
        {value}
      </Text>
    </View>
  );
}

function GameLogRow({ entry }: { entry: GameLogEntry }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const final = entry.statusState === 'final' || entry.statusState === 'post';
  const date = shortDate(entry.startsAt);

  return (
    <View style={[styles.logRow, { borderBottomColor: c.backgroundElement }]}>
      <View style={styles.logWeek}>
        <Text numberOfLines={1} style={[styles.logWeekText, { color: c.text }]}>
          {weekLabel(entry.seasonType, entry.week)}
        </Text>
        <Text numberOfLines={1} style={[styles.logOpponent, { color: c.textSecondary }]}>
          {entry.opponent ?? '—'}
        </Text>
        {date ? (
          <Text numberOfLines={1} style={[styles.logDate, { color: c.textSecondary }]}>
            {date}
          </Text>
        ) : null}
      </View>

      <View style={styles.logStats}>
        {entry.headline.length === 0 ? (
          <Text numberOfLines={1} style={[styles.logStatText, { color: c.textSecondary }]}>
            No recorded stats
          </Text>
        ) : (
          <Text numberOfLines={2} style={[styles.logStatText, { color: c.textSecondary }]}>
            {entry.headline.map((s) => `${s.value} ${s.label}`).join(' · ')}
          </Text>
        )}
        {!final && entry.statusState ? (
          <Text numberOfLines={1} style={[styles.logStatus, { color: c.textSecondary }]}>
            {entry.statusState.toUpperCase()}
          </Text>
        ) : null}
      </View>

      <Text numberOfLines={1} style={[styles.logPoints, NUMERIC, { color: c.text }]}>
        {entry.points === null ? '—' : oneDp(entry.points)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 4, minHeight: 32, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  centre: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
  },
  identityText: { flex: 1, minWidth: 0, gap: Spacing.one },
  name: { fontSize: 24, fontWeight: '800', lineHeight: 29 },
  subline: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, minWidth: 0, borderRadius: 12, padding: Spacing.three, gap: 2 },
  tileLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tileValue: { fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: Spacing.two },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logWeek: { width: 74, flexShrink: 0, gap: 1 },
  logWeekText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  logOpponent: { fontSize: 12, fontWeight: '600' },
  logDate: { fontSize: 10, opacity: 0.8 },
  logStats: { flex: 1, minWidth: 0, gap: 2 },
  logStatText: { fontSize: 12, lineHeight: 16 },
  logStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  logPoints: { fontSize: 18, fontWeight: '800', width: 56, textAlign: 'right', flexShrink: 0 },
  tailSpace: { height: BottomTabInset },
});
