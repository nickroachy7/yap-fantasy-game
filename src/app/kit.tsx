/**
 * Dev-only gallery for the shared UI kit.
 *
 * Separate from `/preview` (card treatments) and `/gallery` (navigation shell)
 * because it is answering a different question: those two show how a finished
 * thing looks, and this shows every STATE of a primitive at once — all five
 * position badges including the split FLEX form, every status tone, a game that
 * is scheduled next to one that is final.
 *
 * That matters because every one of these components has states that are hard
 * to reach in the product. A live game exists for about three hours a week; an
 * empty leaders panel only in the hours after a schedule is published. Without
 * this page those states get reviewed for the first time in production.
 *
 * Outside the auth gate, and inert outside development — `expo export` emits
 * every route it finds, so the __DEV__ guard is what keeps it off the site.
 */
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionBar } from '@/components/shell/ActionBar';
import { TabIcon, type TabIconName } from '@/components/shell/TabIcon';
import { ContestCard } from '@/components/lineup/ContestCard';
import { BenchRow, StarterRow } from '@/components/lineup/LineupRow';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import type { LineupCard } from '@/components/lineup/model';
import { PlayerRow } from '@/components/cards/PlayerRow';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { SortBar } from '@/components/cards/SortBar';
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { summarise } from '@/components/collection/types';
import { OWNED_MANY } from '@/components/dev/fixtures';
import { GameRow } from '@/components/scores/GameRow';
import { ScoreStrip } from '@/components/scores/ScoreStrip';
import { LeadersPanel } from '@/components/scores/LeadersPanel';
import type { Leader, ScoreGame } from '@/components/scores/scoreboard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownChip } from '@/components/ui/DropdownChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PositionBadge, positionsForSlot } from '@/components/ui/PositionBadge';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { POSITION_ORDER, POSITIONS } from '@/constants/positions';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useIsWide } from '@/components/shell/useResponsive';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TAB_ICONS: TabIconName[] = ['lineup', 'leaderboard', 'players', 'collection', 'profile'];

const NO_STATS = {
  receptions: 0,
  targets: 0,
  receivingYards: 0,
  receivingTds: 0,
  rushingAttempts: 0,
  rushingYards: 0,
  rushingTds: 0,
  passingCompletions: 0,
  passingAttempts: 0,
  passingYards: 0,
  passingTds: 0,
  interceptions: 0,
  fieldGoalsMade: 0,
  fieldGoalAttempts: 0,
  extraPointsMade: 0,
};

/**
 * Fixed instants, not `Date.now()`. A gallery that moves is a gallery you
 * cannot compare against yesterday's screenshot — and calling the clock during
 * render is impure, which the hooks lint rightly objects to.
 */
const DEMO_NOW = Date.parse('2026-09-12T12:00:00Z');
const DEMO_LOCK_SOON = '2026-09-12T15:00:00Z';
const DEMO_LOCK_PAST = '2026-09-12T11:00:00Z';

const STARTERS: {
  slot: string;
  card: LineupCard | null;
  points: number | null;
}[] = [
  {
    slot: 'QB',
    points: 24.6,
    card: {
      id: 's1', playerId: 's1', name: 'Caleb Williams', position: 'QB', team: 'CHI',
      injuryStatus: null, tier: 'gold', careerFp: 812, season: 2026,
      form: { seasonFp: 288.1, gamesPlayed: 17, fpPerGame: 16.9, recent: [12.4, 22.1, 8.6, 26.9, 19.2] },
      game: { opponent: 'CAR', home: false, startsAt: '2026-09-13T17:00:00Z' },
    },
  },
  {
    slot: 'RB1',
    points: null,
    card: {
      id: 's2', playerId: 's2', name: 'Christian McCaffrey', position: 'RB', team: 'SF',
      injuryStatus: 'IR', tier: 'diamond', careerFp: 2610, season: 2026,
      form: { seasonFp: 198.2, gamesPlayed: 12, fpPerGame: 16.5, recent: [21.0, 4.2, 18.8] },
      // No game: the bye case, which is the one people lose weeks to.
      game: null,
    },
  },
  {
    slot: 'FLEX',
    points: null,
    card: {
      id: 's3', playerId: 's3', name: 'Bartholomew Vandersteen III', position: 'TE', team: 'NYJ',
      injuryStatus: 'Questionable', tier: 'bronze', careerFp: 14, season: 2026,
      form: null,
      game: { opponent: 'BUF', home: true, startsAt: '2026-09-13T17:00:00Z' },
    },
  },
  { slot: 'K', points: null, card: null },
];

/**
 * Bench candidates for the swap sheet — one clearly better than the incumbent,
 * one clearly worse, one who has never played. The sheet's whole job is making
 * that comparison, so a demo of three identical players proves nothing.
 */
const SWAP_OPTIONS: LineupCard[] = [
  {
    id: 'o1', playerId: 'o1', name: 'Bijan Robinson', position: 'RB', team: 'ATL',
    injuryStatus: null, tier: 'gold', careerFp: 1420, season: 2026,
    form: { seasonFp: 262.4, gamesPlayed: 16, fpPerGame: 16.4, recent: [18.2, 24.6, 11.0, 27.4, 9.8] },
    game: { opponent: 'TB', home: true, startsAt: '2026-09-13T17:00:00Z' },
  },
  {
    id: 'o2', playerId: 'o2', name: 'Tyjae Spears', position: 'RB', team: 'TEN',
    injuryStatus: 'Questionable', tier: 'silver', careerFp: 402, season: 2026,
    form: { seasonFp: 96.2, gamesPlayed: 14, fpPerGame: 6.9, recent: [4.1, 9.8, 2.6, 11.4, 6.6] },
    game: { opponent: 'IND', home: false, startsAt: '2026-09-13T17:00:00Z' },
  },
  {
    id: 'o3', playerId: 'o3', name: 'Rookie Nobody', position: 'RB', team: 'LV',
    injuryStatus: null, tier: 'bronze', careerFp: 0, season: 2026,
    form: null,
    game: null,
  },
];

const SWAP_SLOT: SwapRequest = {
  kind: 'slot',
  slot: 'RB1',
  eligiblePositions: 'RB',
  current: STARTERS[1].card,
  options: SWAP_OPTIONS,
};

const SWAP_EMPTY_SLOT: SwapRequest = {
  kind: 'slot',
  slot: 'FLEX',
  eligiblePositions: 'RB/WR/TE',
  current: null,
  options: SWAP_OPTIONS,
};

const SWAP_BENCH: SwapRequest = {
  kind: 'bench',
  card: SWAP_OPTIONS[0],
  destinations: [
    { slot: 'RB1', occupant: STARTERS[1].card },
    { slot: 'RB2', occupant: null },
    { slot: 'FLEX', occupant: STARTERS[2].card },
  ],
};

/**
 * A full weekend — sixteen games, which is the case that matters: the band has
 * to scroll inside its own box rather than run off the side of the page, and
 * four fixtures never showed that. One finished in overtime, one being played,
 * the rest still to come with one TBD.
 */
const STRIP_GAMES: ScoreGame[] = [
  ['NYJ', 'BUF', 20, 27, 'final', 'Final/OT', '2026-09-13T17:00:00Z'],
  ['SEA', 'SF', 13, 10, 'live', 'Q3 04:11', '2026-09-13T20:05:00Z'],
  ['CHI', 'CAR', null, null, 'scheduled', null, '2026-09-13T21:25:00Z'],
  ['NYG', 'DAL', null, null, 'scheduled', null, null],
  ['LV', 'HOU', null, null, 'scheduled', null, '2026-09-14T00:00:00Z'],
  ['GB', 'PIT', null, null, 'scheduled', null, '2026-09-14T02:00:00Z'],
  ['IND', 'NE', null, null, 'scheduled', null, '2026-09-14T23:00:00Z'],
  ['LAC', 'HOU', null, null, 'scheduled', null, '2026-09-14T23:00:00Z'],
  ['ARI', 'LV', null, null, 'scheduled', null, '2026-09-15T01:00:00Z'],
  ['TEN', 'SF', null, null, 'scheduled', null, '2026-09-15T01:00:00Z'],
  ['TB', 'NYJ', null, null, 'scheduled', null, '2026-09-15T17:00:00Z'],
  ['MIA', 'WSH', null, null, 'scheduled', null, '2026-09-15T17:00:00Z'],
  ['DEN', 'ATL', null, null, 'scheduled', null, '2026-09-15T20:00:00Z'],
  ['CLE', 'PHI', null, null, 'scheduled', null, '2026-09-15T20:00:00Z'],
  ['MIN', 'BAL', null, null, 'scheduled', null, '2026-09-15T23:00:00Z'],
  ['KC', 'NO', null, null, 'scheduled', null, '2026-09-16T00:20:00Z'],
].map(([away, home, awayScore, homeScore, status, statusText, startsAt], i) => ({
  id: `g${i}`,
  season: 2026,
  seasonType: 1,
  week: 3,
  home: { id: `h${i}`, abbreviation: home as string, name: null },
  away: { id: `a${i}`, abbreviation: away as string, name: null },
  homeScore: homeScore as number | null,
  awayScore: awayScore as number | null,
  startsAt: startsAt as string | null,
  status: status as ScoreGame['status'],
  statusText: statusText as string | null,
}));

/** Two starters in the opener, one in the live game. */
const STRIP_MINE = new Map([['NYJ', 1], ['BUF', 1], ['SF', 1]]);

/** One of each position, plus the two states that are easy to get wrong. */
const DIRECTORY_ROWS: { player: DirectoryPlayer; fixture?: string }[] = [
  {
    player: {
      cardId: 'd1', playerId: 'd1', season: 2026, name: 'Nico Collins',
      position: 'WR', team: 'HOU', injuryStatus: null, rarity: 'common',
      seasonFp: 236.4, gamesPlayed: 16, fpPerGame: 14.8, posRank: 8,
      age: 27, college: 'Michigan', experience: 5,
      stats: { ...NO_STATS, receptions: 76, targets: 118, receivingYards: 1144, receivingTds: 7 },
    },
    fixture: 'Sun 1:00p vs BUF',
  },
  {
    player: {
      cardId: 'd2', playerId: 'd2', season: 2026, name: 'Malik Nabers',
      position: 'WR', team: 'NYG', injuryStatus: 'Questionable', rarity: 'rare',
      seasonFp: 232.6, gamesPlayed: 15, fpPerGame: 15.5, posRank: 11,
      age: 23, college: 'LSU', experience: 2,
      stats: { ...NO_STATS, receptions: 82, targets: 140, receivingYards: 1050, receivingTds: 7 },
    },
    fixture: 'Sun 5:20p vs DAL',
  },
  {
    player: {
      cardId: 'd3', playerId: 'd3', season: 2026, name: 'Christian McCaffrey',
      position: 'RB', team: 'SF', injuryStatus: 'IR', rarity: 'legendary',
      seasonFp: 198.2, gamesPlayed: 12, fpPerGame: 16.5, posRank: 4,
      age: 29, college: 'Stanford', experience: 9,
      stats: { ...NO_STATS, rushingAttempts: 214, rushingYards: 1002, rushingTds: 9, receptions: 44, receivingTds: 2 },
    },
    fixture: 'BYE',
  },
  {
    player: {
      cardId: 'd4', playerId: 'd4', season: 2026, name: 'Caleb Williams',
      position: 'QB', team: 'CHI', injuryStatus: null, rarity: 'epic',
      seasonFp: 288.1, gamesPlayed: 17, fpPerGame: 16.9, posRank: 5,
      age: 24, college: 'USC', experience: 2,
      stats: { ...NO_STATS, passingYards: 3541, passingTds: 24, interceptions: 9, rushingYards: 412 },
    },
    fixture: 'Sun 1:00p @ CAR',
  },
  {
    player: {
      cardId: 'd5', playerId: 'd5', season: 2026, name: 'Ka’imi Fairbairn',
      position: 'PK', team: 'HOU', injuryStatus: null, rarity: 'common',
      seasonFp: 141.0, gamesPlayed: 16, fpPerGame: 8.8, posRank: 3,
      age: 31, college: 'UCLA', experience: 10,
      stats: { ...NO_STATS, fieldGoalsMade: 31, fieldGoalAttempts: 36, extraPointsMade: 42 },
    },
    fixture: 'Sun 1:00p vs BUF',
  },
  {
    // Never played. Every number must be a dash, not a zero.
    player: {
      cardId: 'd6', playerId: 'd6', season: 2026, name: 'Bartholomew Vandersteen III',
      position: 'TE', team: null, injuryStatus: null, rarity: 'common',
      seasonFp: 0, gamesPlayed: 0, fpPerGame: 0, posRank: null,
      age: 22, college: 'Rutgers', experience: 0,
      stats: NO_STATS,
    },
  },
];

/** Every lineup slot the config ships with, so the split badge is exercised. */
const SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX', 'K'];

const team = (id: string, abbreviation: string) => ({ id, abbreviation, name: abbreviation });

const GAMES: ScoreGame[] = [
  {
    id: 'g1',
    season: 2026,
    seasonType: 1,
    week: 2,
    home: team('h1', 'HOU'),
    away: team('a1', 'LV'),
    homeScore: 24,
    awayScore: 17,
    startsAt: '2026-08-20T20:00:00Z',
    status: 'final',
    statusText: 'Final',
  },
  {
    id: 'g2',
    season: 2026,
    seasonType: 1,
    week: 2,
    home: team('h2', 'KC'),
    away: team('a2', 'SF'),
    homeScore: 31,
    awayScore: 31,
    startsAt: '2026-08-20T20:00:00Z',
    status: 'final',
    statusText: 'Final/OT',
  },
  {
    id: 'g3',
    season: 2026,
    seasonType: 1,
    week: 2,
    home: team('h3', 'PHI'),
    away: team('a3', 'DAL'),
    homeScore: 14,
    awayScore: 10,
    startsAt: '2026-08-21T00:15:00Z',
    status: 'live',
    statusText: null,
  },
  {
    id: 'g4',
    season: 2026,
    seasonType: 1,
    week: 2,
    home: team('h4', 'BUF'),
    away: team('a4', 'NYJ'),
    homeScore: null,
    awayScore: null,
    startsAt: '2026-08-22T17:00:00Z',
    status: 'scheduled',
    statusText: 'TBD',
  },
  /* A fixture with an unresolved side. The provider does occasionally hand us
     a game whose team id we do not hold, and the row must not collapse. */
  {
    id: 'g5',
    season: 2026,
    seasonType: 1,
    week: 2,
    home: null,
    away: team('a5', 'GB'),
    homeScore: null,
    awayScore: null,
    startsAt: null,
    status: 'scheduled',
    statusText: null,
  },
];

const leader = (
  name: string,
  position: Leader['position'],
  positionLabel: string,
  points: number,
  owned: boolean,
): Leader => ({
  playerId: name,
  gameId: 'g1',
  name,
  position,
  positionLabel,
  teamAbbreviation: 'HOU',
  points,
  owned,
});

const LEADERS: Leader[] = [
  leader('C.J. Stroud', 'QB', 'QB', 27.4, true),
  leader('Jalen Milroe', 'QB', 'QB', 11.2, false),
  leader('Joe Mixon', 'RB', 'RB', 19.8, false),
  leader('Nico Collins', 'WR', 'WR', 24.1, true),
  leader('Tank Dell', 'WR', 'WR', 9.3, false),
  leader('Dalton Schultz', 'TE', 'TE', 8.6, false),
  leader('Ka’imi Fairbairn', 'PK', 'PK', 12.0, false),
];

type StatRow = { season: number; att: number; yds: number; td: number; rec: number; recYds: number };

const STAT_ROWS: StatRow[] = [
  { season: 2026, att: 214, yds: 1002, td: 9, rec: 44, recYds: 388 },
  { season: 2025, att: 198, yds: 874, td: 6, rec: 51, recYds: 402 },
  { season: 2024, att: 121, yds: 503, td: 3, rec: 22, recYds: 165 },
];

const STAT_COLUMNS: Column<StatRow>[] = [
  { key: 'att', label: 'ATT', value: (r) => r.att },
  { key: 'yds', label: 'YD', value: (r) => r.yds },
  { key: 'td', label: 'TD', value: (r) => r.td },
  { key: 'rec', label: 'REC', value: (r) => r.rec },
  { key: 'recYds', label: 'YD', value: (r) => r.recYds },
];

export default function KitScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Kit />;
}

/**
 * Split from the guard so the hooks below never sit after a conditional
 * return — which is a rules-of-hooks violation even when the condition is a
 * build-time constant.
 */
function Kit() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [week, setWeek] = useState('2');
  const [confirm, setConfirm] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>('g3');
  const [swap, setSwap] = useState<SwapRequest | null>(null);
  const [action, setAction] = useState('search');
  // The sheet changes shape at the same breakpoint the product uses, so this
  // gallery shows whichever one the current window would get.
  const wide = useIsWide();

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[Type.page, { color: c.text }]}>UI kit</Text>

          <Section
            title="Tab icons"
            note="Inactive (hollow) above, active (solid) below — at bar size and at 3x.">
            <View style={[styles.row, { gap: Spacing.four }]}>
              {TAB_ICONS.map((n) => (
                <View key={n} style={styles.iconCell}>
                  <TabIcon name={n} color={c.textSecondary} focused={false} size={24} />
                  <TabIcon name={n} color={c.text} focused size={24} />
                  <Text style={[Type.micro, { color: c.textTertiary }]}>{n.toUpperCase()}</Text>
                </View>
              ))}
            </View>
            {/* Drawn large as well, because a glyph that survives 24pt can
                still be misproportioned — and the bug is invisible until you
                see it big. */}
            <View style={[styles.row, { gap: Spacing.four }]}>
              {TAB_ICONS.map((n) => (
                <TabIcon key={`big-${n}`} name={n} color={c.text} focused size={72} />
              ))}
            </View>
          </Section>

          <Section
            title="Contest card"
            note="Unscored shows the starters' average pace; a swept week shows the real total.">
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 3"
              lockAt={DEMO_LOCK_SOON}
              locked={false}
              now={DEMO_NOW}
              filled={7}
              slotCount={8}
              fpPerGame={104.2}
              totalPoints={null}
              scored={false}
              alerts={2}
            />
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 2"
              lockAt={DEMO_LOCK_PAST}
              locked
              now={DEMO_NOW}
              filled={8}
              slotCount={8}
              fpPerGame={104.2}
              totalPoints={118.4}
              scored
              alerts={0}
            />
          </Section>

          <Section
            title="Lineup rows"
            note="Starters then bench, one row component, no frame. Bye, injury, empty slot; the bench mark names the slot a tap would fill.">
            {STARTERS.map((s) => (
              <StarterRow
                key={s.slot}
                slot={s.slot}
                card={s.card}
                points={s.points}
                scored={s.points !== null}
                selected={false}
                disabled={false}
                eligibleCount={s.card ? 0 : 3}
                eligiblePositions="PK"
                onPress={() => {}}
              />
            ))}
            {SWAP_OPTIONS.map((card, i) => (
              <BenchRow
                key={card.id}
                card={card}
                // The third has nowhere free to go, which is the state that
                // used to render as a dead tap.
                destination={i === 0 ? 'RB2' : i === 1 ? 'FLEX' : null}
                onPress={() => {}}
              />
            ))}
          </Section>

          <Section
            title="Action bar"
            note="Every glyph, hollow then solid. The second bar overflows, which is how a seven-item Collection page behaves on a phone.">
            <ActionBar
              wide={false}
              actions={[
                { key: 'search', label: 'Search', icon: 'search', active: action === 'search', onPress: () => setAction('search') },
                { key: 'sort', label: 'Sort', icon: 'sort', active: action === 'sort', onPress: () => setAction('sort') },
                { key: 'tiers', label: 'Tiers', icon: 'tiers', active: action === 'tiers', onPress: () => setAction('tiers') },
                { key: 'available', label: 'Available', icon: 'available', active: action === 'available', onPress: () => setAction('available') },
                { key: 'trend', label: 'Trend', icon: 'trend', nav: true, active: action === 'trend', onPress: () => setAction('trend') },
              ]}
            />
            <ActionBar
              wide={false}
              actions={[
                { key: 'inventory', label: 'Inventory', icon: 'inventory', active: action === 'inventory', onPress: () => setAction('inventory') },
                { key: 'sets', label: 'Sets', icon: 'sets', badge: 'Soon', active: action === 'sets', onPress: () => setAction('sets') },
                { key: 'shop2', label: 'Shop', icon: 'shop', active: action === 'shop2', onPress: () => setAction('shop2') },
                { key: 'directory', label: 'Directory', icon: 'directory', active: action === 'directory', onPress: () => setAction('directory') },
                { key: 'standings', label: 'Standings', icon: 'standings', active: action === 'standings', onPress: () => setAction('standings') },
                { key: 'scoring', label: 'Scoring', icon: 'scoring', active: action === 'scoring', onPress: () => setAction('scoring') },
              ]}
            />
          </Section>

          <Section
            title="Score band"
            note="This week across the top of the lineup. Final, live, timed and TBD; a caret marks the winner and a dot the games your starters are in.">
            <ScoreStrip
              games={STRIP_GAMES}
              week="Pre Wk 3"
              startersByTeam={STRIP_MINE}
              loading={false}
            />
          </Section>

          <Section
            title="Swap sheet"
            note="Bottom sheet under 900px, centred dialog above it — resize the window. Escape and the backdrop both close it.">
            <View style={styles.row}>
              {[
                { label: 'Filled slot', request: SWAP_SLOT },
                { label: 'Empty slot', request: SWAP_EMPTY_SLOT },
                { label: 'From the bench', request: SWAP_BENCH },
              ].map((demo) => (
                <Pressable
                  key={demo.label}
                  onPress={() => setSwap(demo.request)}
                  style={({ pressed }) => [
                    styles.demoButton,
                    { backgroundColor: c.backgroundElement },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Text style={[Type.strong, { color: c.text }]}>{demo.label}</Text>
                </Pressable>
              ))}
            </View>
            <SwapSheet
              request={swap}
              wide={wide}
              sort="fp"
              onSort={() => {}}
              onPick={() => setSwap(null)}
              onClear={() => setSwap(null)}
              onClose={() => setSwap(null)}
            />
          </Section>

          <Section
            title="Directory row"
            note="Identity over a tinted stat tray, fixed 90pt. Last row has never played — dashes, not zeroes.">
            <SortBar sort={{ key: 'fp', dir: 'desc' }} onSort={() => {}} />
            <Panel>
              {DIRECTORY_ROWS.map((r) => (
                <PlayerRow
                  key={r.player.cardId}
                  player={r.player}
                  onPress={() => {}}
                  fixture={r.fixture}
                />
              ))}
            </Panel>
          </Section>

          <Section title="Position badges" note="Every position, then every lineup slot.">
            <View style={styles.row}>
              {POSITIONS.map((p) => (
                <PositionBadge key={p} label={p} size={28} />
              ))}
            </View>
            <View style={styles.row}>
              {SLOTS.map((slot) => (
                <PositionBadge
                  key={slot}
                  label={slot}
                  positions={positionsForSlot(slot)}
                  size={28}
                />
              ))}
            </View>
            <View style={styles.row}>
              {SLOTS.map((slot) => (
                <PositionBadge
                  key={`sm-${slot}`}
                  label={slot}
                  positions={positionsForSlot(slot)}
                  size={20}
                />
              ))}
            </View>
          </Section>

          <Section title="Status chips" note="Only `live` is filled and saturated.">
            <View style={styles.row}>
              <StatusChip label="Live" tone="live" />
              <StatusChip label="Final" />
              <StatusChip label="Version 1" />
              <StatusChip label="Saved" tone="positive" />
              <StatusChip label="Locked" tone="negative" />
              <StatusChip label="Soon" tone="warning" />
            </View>
          </Section>

          <Section title="Week picker" note="Chip plus a three-column grid popover.">
            <DropdownChip
              value={week}
              options={Array.from({ length: 18 }, (_, i) => ({
                value: String(i + 1),
                label: `Week ${i + 1}`,
              }))}
              onChange={setWeek}
              columns={3}
              title="Jump to week"
              accessibilityLabel="Week"
            />
          </Section>

          <Section title="Game rows" note="Final, final after overtime, live, scheduled, unresolved.">
            <Panel>
              {GAMES.map((g) => (
                <GameRow
                  key={g.id}
                  game={g}
                  selected={g.id === selected}
                  onPress={(next) => setSelected((cur) => (cur === next.id ? null : next.id))}
                />
              ))}
            </Panel>
          </Section>

          <Section title="Leaders" note="A green dot marks a player the viewer owns.">
            <Panel>
              <LeadersPanel
                leaders={LEADERS}
                order={POSITION_ORDER}
                limit={5}
                onOpenPlayer={() => {}}
                emptyTitle="No scores yet"
                emptyBody="Unused here."
              />
            </Panel>
          </Section>

          <Section title="Grouped table bands" note="Bands are laid over the columns positionally.">
            <Panel>
              <DataTable
                rows={STAT_ROWS}
                columns={STAT_COLUMNS}
                groups={[
                  { label: 'RUSHING', span: 3 },
                  { label: 'RECEIVING', span: 2 },
                ]}
                keyOf={(r) => String(r.season)}
                leadingLabel="SEASON"
                leadingWidth={64}
                leading={(r) => (
                  <Text style={[Type.body, { color: c.text }]}>{r.season}</Text>
                )}
              />
            </Panel>
          </Section>

          <Section
            title="Collection summary"
            note="The gem figure is how selling is discovered from the inventory.">
            <Panel>
              <View style={styles.summaryPad}>
                <CollectionSummary stats={summarise(OWNED_MANY)} />
              </View>
            </Panel>
          </Section>

          <Section
            title="Confirm dialog"
            note="Destructive action is rightmost and the only coloured button. Backdrop cancels.">
            <View style={styles.row}>
              <Pressable
                onPress={() => {
                  setConfirmErr(null);
                  setConfirm(true);
                }}
                style={({ pressed }) => [
                  styles.demoButton,
                  { backgroundColor: c.backgroundElement },
                  pressed && { opacity: 0.6 },
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Open</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmErr(
                    'This card is in a lineup that has not been scored yet. You can sell it once the week is settled.',
                  );
                  setConfirm(true);
                }}
                style={({ pressed }) => [
                  styles.demoButton,
                  { backgroundColor: c.backgroundElement },
                  pressed && { opacity: 0.6 },
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Open with refusal</Text>
              </Pressable>
            </View>
            <ConfirmDialog
              visible={confirm}
              title="Sell this gold card?"
              body="Christian McCaffrey · 2026 card. You will receive 150 gems. The copy and everything it has earned — 1,285 FP over 41 starts — are gone for good, and buying the player again starts a new card at bronze."
              confirmLabel="Sell for 150"
              destructive
              error={confirmErr}
              onConfirm={() => setConfirm(false)}
              onCancel={() => setConfirm(false)}
            />
          </Section>

          <Section title="Empty state" note="Bold line, quiet line, at most one action.">
            <Panel>
              <EmptyState
                title="Not enough football yet"
                body="Movement needs two completed weeks to compare. Check back once a second week has been played and swept."
                actionLabel="Open the shop"
                onAction={() => {}}
              />
            </Panel>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.section}>
      <Text style={[Type.section, { color: c.text }]}>{title}</Text>
      <Text style={[Type.fine, { color: c.textTertiary }]}>{note}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, maxWidth: 760, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  iconCell: { alignItems: 'center', gap: Spacing.two },
  summaryPad: { padding: Spacing.two + 2 },
  demoButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
});
