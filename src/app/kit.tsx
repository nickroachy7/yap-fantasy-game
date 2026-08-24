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
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionBar } from '@/components/shell/ActionBar';
import { TabIcon, type TabIconName } from '@/components/shell/TabIcon';
import { ContestCard } from '@/components/lineup/ContestCard';
import type { FieldWeek } from '@/components/lineup/field';
import { BADGE_SIZE, BADGE_WIDTH, BenchRow, StarterRow } from '@/components/lineup/LineupRow';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import type { LineupCard } from '@/components/lineup/model';
import { PlayerRow } from '@/components/cards/PlayerRow';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { SearchField, SortChips } from '@/components/ui/Controls';
import { summarise } from '@/components/collection/types';
import {
  KIT_COMMIT_PLAN,
  KIT_SET_DAILY,
  KIT_SET_COMPLETE,
  KIT_SET_UNDER_FLOOR,
  KIT_SET_FILLED,
  KIT_SET_OPEN,
  OWNED_CARDS,
  OWNED_MANY,
  PULLED_FIXTURE,
  PULL_ACTIONS_FIXTURE,
} from '@/components/dev/fixtures';
import { BulkBar, type BulkStage } from '@/components/collection/BulkBar';
import { InventoryCard } from '@/components/collection/InventoryCard';
import { CardExits } from '@/components/cards/CardExits';
import { PackReveal } from '@/components/cards/PackReveal';
import type { Disposition } from '@/components/cards/use-pull-actions';
import { GameRow } from '@/components/scores/GameRow';
import { ScoreStrip } from '@/components/scores/ScoreStrip';
import { LeadersPanel } from '@/components/scores/LeadersPanel';
import type { Leader, ScoreGame } from '@/components/scores/scoreboard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownChip } from '@/components/ui/DropdownChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { SegmentedControl } from '@/components/shell/SegmentedControl';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { POSITION_ORDER, POSITIONS } from '@/constants/positions';
import { Colors, Spacing, TierColors, Type } from '@/constants/theme';
import { useIsWide } from '@/components/shell/useResponsive';
import { useColorScheme } from '@/hooks/use-color-scheme';

/* Bar order, then rail order: the four the bottom bar draws, then the ones the
   top nav and the rail draw under Yap. Every name in `TabIconName` appears —
   an icon missing from here is an icon nobody looks at until it ships, which is
   exactly what happened to `sets`: it was added for the rail and never listed
   here, so it went unreviewed at both states until `leagues` was added beside
   it and the gap showed. */
const TAB_ICONS: TabIconName[] = [
  'fantasy',
  'leagues',
  'scores',
  'profile',
  'lineup',
  'collection',
  'sets',
  'players',
  'leaderboard',
];

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
type KitDirection = 'up' | 'down';

const DEMO_NOW = Date.parse('2026-09-12T12:00:00Z');
const DEMO_LOCK_SOON = '2026-09-12T15:00:00Z';
const DEMO_LOCK_PAST = '2026-09-12T11:00:00Z';

/**
 * Four fields, one per state the contest card has to draw.
 *
 * The numbers are deliberately median-shaped rather than tidy: the median sits
 * well below the mean in every one of them, because that is what a real week
 * looks like and it is the whole reason the median is the opponent.
 */
const DEMO_FIELD_UNPLAYED: FieldWeek = {
  week: 3, entrants: 26, low: 0, median: 0, average: 0, high: 0, final: false,
  myPoints: null, myRank: null, ahead: null, result: null,
};
const DEMO_FIELD_AHEAD: FieldWeek = {
  week: 3, entrants: 26, low: 41.2, median: 97.6, average: 112.4, high: 208.3, final: false,
  myPoints: 118.4, myRank: 7, ahead: 19, result: null,
};
const DEMO_FIELD_BEHIND: FieldWeek = {
  week: 2, entrants: 24, low: 38.4, median: 88.2, average: 101.7, high: 176.5, final: true,
  myPoints: 71.9, myRank: 18, ahead: 6, result: 'L',
};
/**
 * One entrant is their own low, median AND high, so there is no range to place
 * anybody in. Deliberately given real points: with everything at zero this
 * would trip the earlier "no games played yet" branch and stop demonstrating
 * the case it exists for.
 */
const DEMO_FIELD_ALONE: FieldWeek = {
  week: 1, entrants: 1, low: 88.2, median: 88.2, average: 88.2, high: 88.2, final: true,
  myPoints: 88.2, myRank: 1, ahead: 0, result: null,
};

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
      nextTierAt: 2500, nextTierLabel: 'diamond',
      form: { seasonFp: 288.1, gamesPlayed: 17, fpPerGame: 16.9, recent: [12.4, 22.1, 8.6, 26.9, 19.2], weekFp: 24.6 },
      // LIVE, with the provider's own clock. The 24.6 beside it is a number
      // that is still moving, and the row has to say so.
      game: {
        opponent: 'CAR', home: false, startsAt: '2026-09-13T17:00:00Z',
        status: 'live', statusText: 'Q3 04:22',
      },
    },
  },
  {
    slot: 'RB1',
    points: null,
    card: {
      id: 's2', playerId: 's2', name: 'Christian McCaffrey', position: 'RB', team: 'SF',
      injuryStatus: 'IR', tier: 'diamond', careerFp: 2610, season: 2026,
      // Top tier: no threshold above it, so the row says so instead of a ratio.
      nextTierAt: null, nextTierLabel: null,
      form: { seasonFp: 198.2, gamesPlayed: 12, fpPerGame: 16.5, recent: [21.0, 4.2, 18.8], weekFp: null },
      // No game: the bye case, which is the one people lose weeks to.
      game: null,
    },
  },
  {
    slot: 'FLEX',
    // 0, not null. A STARTER's figure is what the slot was credited, and this
    // is the case that only exists once the row can say FINAL: a player who
    // took the field and scored nothing. Left null it renders as a dash and is
    // indistinguishable from a player who has not kicked off — which is the
    // confusion the state line was added to end.
    points: 0,
    card: {
      id: 's3', playerId: 's3', name: 'Bartholomew Vandersteen III', position: 'TE', team: 'NYJ',
      injuryStatus: 'Questionable', tier: 'bronze', careerFp: 14, season: 2026,
      nextTierAt: 200, nextTierLabel: 'silver',
      // Played and scored nothing, which a bare dash could never tell apart
      // from "has not kicked off". FINAL beside a 0.0 is the distinction.
      form: { seasonFp: 14, gamesPlayed: 3, fpPerGame: 4.7, recent: [6.2, 7.8, 0], weekFp: 0 },
      game: {
        opponent: 'BUF', home: true, startsAt: '2026-09-13T17:00:00Z',
        status: 'final', statusText: 'Final/OT',
      },
    },
  },
  {
    slot: 'K',
    // 0, and the row must NOT print it. score_week stamps every slot with
    // coalesce(sum, 0) on each pass, so a lineup set on Tuesday has eight
    // stored noughts against games that kick off on Sunday. The figure is
    // gated on the FIXTURE, not on whether a sweep has run.
    points: 0,
    card: {
      id: 's4', playerId: 's4', name: 'Cameron Dicker', position: 'PK', team: 'LAC',
      injuryStatus: null, tier: 'silver', careerFp: 402, season: 2026,
      nextTierAt: 750, nextTierLabel: 'gold',
      form: { seasonFp: 148.0, gamesPlayed: 17, fpPerGame: 8.7, recent: [9, 11, 6, 8, 12], weekFp: null },
      game: {
        opponent: 'DEN', home: true, startsAt: '2026-09-13T20:05:00Z',
        status: 'scheduled', statusText: '9/13 - 4:05 PM EDT',
      },
    },
  },
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
    nextTierAt: 2500, nextTierLabel: 'diamond',
    form: { seasonFp: 262.4, gamesPlayed: 16, fpPerGame: 16.4, recent: [18.2, 24.6, 11.0, 27.4, 9.8], weekFp: 18.4 },
    game: {
      opponent: 'TB', home: true, startsAt: '2026-09-13T17:00:00Z',
      status: 'live', statusText: 'Q2 11:40',
    },
  },
  {
    id: 'o2', playerId: 'o2', name: 'Tyjae Spears', position: 'RB', team: 'TEN',
    injuryStatus: 'Questionable', tier: 'silver', careerFp: 402, season: 2026,
    nextTierAt: 750, nextTierLabel: 'gold',
    // Not yet swept, which is every row before kickoff.
    form: { seasonFp: 96.2, gamesPlayed: 14, fpPerGame: 6.9, recent: [4.1, 9.8, 2.6, 11.4, 6.6], weekFp: null },
    game: {
      opponent: 'IND', home: false, startsAt: '2026-09-13T17:00:00Z',
      status: 'scheduled', statusText: '9/13 - 1:00 PM EDT',
    },
  },
  {
    id: 'o3', playerId: 'o3', name: 'Josiah Nobody', position: 'RB', team: 'LV',
    injuryStatus: null, tier: 'bronze', careerFp: 0, season: 2026,
    nextTierAt: 200, nextTierLabel: 'silver',
    /* THE DEGUARA CASE. His game is over and he has no stat line at all,
       because the provider only emits a box-score row for a player who recorded
       something. A dash here beside a fixture line reading FINAL is the row
       refusing to answer a question it knows the answer to: nothing. */
    form: null,
    game: {
      opponent: 'HOU', home: false, startsAt: '2026-09-13T17:00:00Z',
      status: 'final', statusText: 'Final',
    },
  },
];

const SWAP_SLOT: SwapRequest = {
  kind: 'slot',
  // Both halves, honestly: o1's game is live and o3's is final, so both are
  // locked; only o2 has yet to kick off. Locking just one of them would have
  // shown a FINAL fixture sitting in the choosable list, which is the exact
  // contradiction this sheet exists to stop drawing.
  lockedIds: new Set(['o1', 'o3']),
  slot: 'RB1',
  eligiblePositions: 'RB',
  current: STARTERS[1].card,
  options: SWAP_OPTIONS,
};

const SWAP_EMPTY_SLOT: SwapRequest = {
  kind: 'slot',
  // Nothing locked here, so the empty-slot case reads as the simple one it is.
  lockedIds: new Set<string>(),
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
      seasonFp: 236.4, gamesPlayed: 16, fpPerGame: 14.8, posRank: 8, overallRank: 12,
      market: { copies: 34, bronze: 21, silver: 9, gold: 3, diamond: 1, bestFp: 812.4 },
      age: 27, college: 'Michigan', experience: 5,
      stats: { ...NO_STATS, receptions: 76, targets: 118, receivingYards: 1144, receivingTds: 7 },
    },
    fixture: 'Sun 1:00p vs BUF',
  },
  {
    player: {
      cardId: 'd2', playerId: 'd2', season: 2026, name: 'Malik Nabers',
      position: 'WR', team: 'NYG', injuryStatus: 'Questionable', rarity: 'rare',
      seasonFp: 232.6, gamesPlayed: 15, fpPerGame: 15.5, posRank: 11, overallRank: 15,
      // Owned, but nobody has ever started one: the best copy has earned nothing.
      market: { copies: 6, bronze: 6, silver: 0, gold: 0, diamond: 0, bestFp: 0 },
      age: 23, college: 'LSU', experience: 2,
      stats: { ...NO_STATS, receptions: 82, targets: 140, receivingYards: 1050, receivingTds: 7 },
    },
    fixture: 'Sun 5:20p vs DAL',
  },
  {
    player: {
      cardId: 'd3', playerId: 'd3', season: 2026, name: 'Christian McCaffrey',
      position: 'RB', team: 'SF', injuryStatus: 'IR', rarity: 'legendary',
      seasonFp: 198.2, gamesPlayed: 12, fpPerGame: 16.5, posRank: 4, overallRank: 31,
      market: { copies: 112, bronze: 60, silver: 34, gold: 15, diamond: 3, bestFp: 2741.0 },
      age: 29, college: 'Stanford', experience: 9,
      stats: { ...NO_STATS, rushingAttempts: 214, rushingYards: 1002, rushingTds: 9, receptions: 44, receivingTds: 2 },
    },
    fixture: 'BYE',
  },
  {
    player: {
      cardId: 'd4', playerId: 'd4', season: 2026, name: 'Caleb Williams',
      position: 'QB', team: 'CHI', injuryStatus: null, rarity: 'epic',
      seasonFp: 288.1, gamesPlayed: 17, fpPerGame: 16.9, posRank: 5, overallRank: 2,
      market: { copies: 88, bronze: 41, silver: 30, gold: 14, diamond: 3, bestFp: 1960.5 },
      age: 24, college: 'USC', experience: 2,
      stats: { ...NO_STATS, passingYards: 3541, passingTds: 24, interceptions: 9, rushingYards: 412 },
    },
    fixture: 'Sun 1:00p @ CAR',
  },
  {
    player: {
      cardId: 'd5', playerId: 'd5', season: 2026, name: 'Ka’imi Fairbairn',
      position: 'PK', team: 'HOU', injuryStatus: null, rarity: 'common',
      seasonFp: 141.0, gamesPlayed: 16, fpPerGame: 8.8, posRank: 3, overallRank: 96,
      market: { copies: 4, bronze: 4, silver: 0, gold: 0, diamond: 0, bestFp: 118.0 },
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
      seasonFp: 0, gamesPlayed: 0, fpPerGame: 0, posRank: null, overallRank: null,
      // Nobody owns one. Not zero of every tier — dashes, not noughts.
      market: null,
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [action, setAction] = useState('search');
  const [kitPos, setKitPos] = useState<PosFilter>('ALL');
  const [kitDirection, setKitDirection] = useState<KitDirection>('up');
  /* The reveal's two writes, faked — including the part of them that is easy to
     forget in a gallery: a card that has been sold, or burnt into a set, is NOT
     held any more, and the panel draws a different thing for a card that has
     left the collection. Committing a player you hold a spare of leaves the
     card exactly where it was, which is the case card 2 exists to show. */
  const [pullDisposed, setPullDisposed] = useState<Map<string, Disposition>>(() => new Map());
  const [pullActions, setPullActions] = useState(PULL_ACTIONS_FIXTURE);
  const [pullOpen, setPullOpen] = useState(false);
  /* The card profile's two exits, which cannot be reached in this gallery any
     other way — that screen is behind a sign-in. */
  const [exitPicked, setExitPicked] = useState<string | null>(null);
  /* The inventory's multi-select bar, which cannot be reached in this gallery
     any other way — that screen is behind a sign-in too. */
  const [bulkStage, setBulkStage] = useState<BulkStage>('idle');
  const [bulkCount, setBulkCount] = useState(12);
  const spendPullCard = (id: string) =>
    setPullActions((held) => {
      const was = held.get(id);
      if (!was) return held;
      return new Map(held).set(id, { ...was, held: false, sellable: false });
    });
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
            note="Your score placed inside the whole field, low to high, with the median marked. Deliberately NOT a head-to-head — there is no opponent in this game. Two scopes, kept apart by the bar so neither borrows the other: the SEASON record under the name, THIS WEEK’s rank under the bar it summarises. The rank is withheld only while the whole field is tied on nought — before kickoff rank() hands every manager first place — which is why card one says “26 in the field” while card four, a field of one whose rank is never in doubt, says “Ranked #1 of 1”. Four states: nobody has played yet; live and past the median; final and short of it; and a field of one, which is its own median and has no range.">
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 3"
              lockAt={DEMO_LOCK_SOON}
              locked={false}
              now={DEMO_NOW}
              myPoints={null}
              field={DEMO_FIELD_UNPLAYED}
              record={{ wins: 1, losses: 1, ties: 0 }}
            />
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 3"
              lockAt={DEMO_LOCK_PAST}
              locked
              now={DEMO_NOW}
              myPoints={118.4}
              field={DEMO_FIELD_AHEAD}
              record={{ wins: 2, losses: 1, ties: 0 }}
            />
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 2"
              lockAt={DEMO_LOCK_PAST}
              locked
              now={DEMO_NOW}
              myPoints={71.9}
              field={DEMO_FIELD_BEHIND}
              record={{ wins: 2, losses: 2, ties: 1 }}
            />
            <ContestCard
              displayName="nickroachy"
              weekLabel="Preseason · Week 1"
              lockAt={DEMO_LOCK_SOON}
              locked={false}
              now={DEMO_NOW}
              myPoints={88.2}
              field={DEMO_FIELD_ALONE}
              record={{ wins: 0, losses: 0, ties: 0 }}
            />
          </Section>

          <Section
            title="Lineup rows"
            note="Starters then bench, one row component, no frame. The BADGE opens the swap — BN marks a bench card — and the rest of the row opens the player. Bye, injury and empty slot are all here.">
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
                onSwap={() => {}}
                onOpenProfile={() => {}}
              />
            ))}
            {SWAP_OPTIONS.map((card, i) => (
              <BenchRow
                key={card.id}
                card={card}
                // The third has nowhere free to go, which is the state that
                // used to render as a dead tap.
                destination={i === 0 ? 'RB2' : i === 1 ? 'FLEX' : null}
                onSwap={() => {}}
                onOpenProfile={() => {}}
              />
            ))}
          </Section>

          <Section
            title="Page controls"
            note="One search field and one sort strip, shared by both browsing screens. The active sort key carries its own direction.">
            <SearchField
              value=""
              onChange={() => {}}
              placeholder="Search name, team or college"
              hint="968 PLAYERS"
              accessibilityLabel="Search players"
            />
            <SortChips
              options={[
                { key: 'fp', label: 'Career FP' },
                { key: 'tier', label: 'Tier' },
                { key: 'name', label: 'Name' },
              ]}
              value="tier"
              dir="asc"
              onPress={() => {}}
            />
          </Section>

          <Section
            title="Filter row"
            note="The Players boards' one row of filters: shared position chips on the left, the page's own switch on the right. The compact segmented control is sized to Chip — same height, same corner, same 10pt uppercase — so the row reads as one set of controls rather than a chip strip with a widget bolted to it.">
            <View style={styles.filterRow}>
              <View style={styles.filterChips}>
                <PositionFilter value={kitPos} onChange={setKitPos} />
              </View>
              <SegmentedControl
                compact
                segments={[
                  { value: 'up', label: 'Up' },
                  { value: 'down', label: 'Down' },
                ]}
                value={kitDirection}
                onChange={setKitDirection}
              />
            </View>
          </Section>

          <Section
            title="Action bar"
            note="A section's pages, and nothing else — same strip on every page of the section, only the highlight moves. Every glyph, hollow then solid.">
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
                { key: 'sets', label: 'Sets', icon: 'sets', active: action === 'sets', onPress: () => setAction('sets') },
                { key: 'shop2', label: 'Shop', icon: 'shop', active: action === 'shop2', onPress: () => setAction('shop2') },
                { key: 'directory', label: 'Directory', icon: 'directory', active: action === 'directory', onPress: () => setAction('directory') },
                { key: 'standings', label: 'Standings', icon: 'standings', active: action === 'standings', onPress: () => setAction('standings') },
                { key: 'scoring', label: 'Scoring', icon: 'scoring', active: action === 'scoring', onPress: () => setAction('scoring') },
              ]}
            />
            {/* The Compete section. Both glyphs are new as of 2026-08-25 and
                belong here for the reason the note above gives — every glyph,
                hollow then solid, in the one place they can be compared. */}
            <ActionBar
              wide={false}
              actions={[
                { key: 'lineup', label: 'Lineup', icon: 'lineup', active: action === 'lineup', onPress: () => setAction('lineup') },
                { key: 'contests', label: 'Contests', icon: 'contests', active: action === 'contests', onPress: () => setAction('contests') },
              ]}
            />
            {/* Two items — the Players section. The cap on item width is what
                stops this reading as the segmented control it replaced. */}
            <ActionBar
              wide={false}
              actions={[
                { key: 'dir2', label: 'Directory', icon: 'directory', active: action === 'dir2', onPress: () => setAction('dir2') },
                { key: 'trend2', label: 'Trend', icon: 'trend', active: action === 'trend2', onPress: () => setAction('trend2') },
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
            title="Player sheet"
            note="The frame both profiles and the set checklist are presented in. On iOS and Android the route is a native page sheet; the OS draws the corner and the drag, we draw the raised surface, the 1pt outline and — on iOS, in place of the ✕ — the grabber. On web it is drawn here: a bottom sheet under 900px, a centred dialog above it — resize the window. Escape, the backdrop and the ✕ all close it.">
            <View style={styles.row}>
              <Pressable
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => [
                  styles.demoButton,
                  { backgroundColor: c.backgroundElement },
                  pressed && { opacity: 0.6 },
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Open player sheet</Text>
              </Pressable>
            </View>
            {/* The real route gets its full-screen container from
                `presentation: 'transparentModal'`. Nothing supplies one here,
                so a plain Modal stands in for it — without it the frame would
                lay itself out inline and the dialog would not be centred on
                anything. */}
            {/* `animationType="none"` on purpose. react-native-web's Modal
                drives `pointer-events` from its fade animation, and while that
                animation is in flight the whole subtree is untouchable — which
                in a gallery, where the sheet is opened and closed repeatedly,
                leaves it stuck. The real route gets its container from
                expo-router's `transparentModal` and has no RN Modal at all, so
                this is scaffold, not behaviour. */}
            <Modal
              visible={sheetOpen}
              transparent
              animationType="none"
              onRequestClose={() => setSheetOpen(false)}>
              <PlayerSheetFrame
                title="Christian McCaffrey"
                subtitle="SF · RB"
                onClose={() => setSheetOpen(false)}>
                {Array.from({ length: 8 }, (_, i) => (
                  <Panel key={i} title={i === 0 ? 'This season' : `Section ${i + 1}`}>
                    <Text style={[Type.body, { color: c.textSecondary }]}>
                      Filler, so the sheet is tall enough to scroll and to prove the dialog
                      stops growing at the viewport instead of pushing its own header off.
                    </Text>
                  </Panel>
                ))}
              </PlayerSheetFrame>
            </Modal>
          </Section>

          <Section
            title="Directory row"
            note="Identity over the community’s card counts, fixed 88pt. Last row has never played and nobody owns one — dashes, not zeroes.">
            <SortChips
              options={[
                { key: 'fp', label: 'FP' },
                { key: 'fpg', label: 'FP/G' },
                { key: 'games', label: 'GP' },
                { key: 'name', label: 'Name' },
              ]}
              value="fp"
              dir="desc"
              onPress={() => {}}
            />
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

          <Section
            title="Position badges"
            note="Every position; then every lineup slot as the lineup draws it — one fixed width, no ordinals — and the same slots at their natural widths.">
            <View style={styles.row}>
              {POSITIONS.map((p) => (
                <PositionBadge key={p} label={p} size={28} />
              ))}
            </View>
            <View style={styles.row}>
              {SLOTS.map((slot) => (
                <PositionBadge
                  key={slot}
                  label={slotBadgeLabel(slot)}
                  positions={positionsForSlot(slot)}
                  size={BADGE_SIZE}
                  width={BADGE_WIDTH}
                  tone="neutral"
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

          <Section
            title="Pack reveal"
            note="Cards face down, turned over as they reach the middle, each carrying its own sell / add-to-set pair underneath it. Shown INSIDE the sheet, because that is the only place it appears and the deck runs to the sheet's edges by climbing back over its gutter — laid out inline it would prove nothing about that. The five cards are the five states that pair can be in: card 1 ordinary, card 2 commits a spare copy so the card stays yours, card 3 is in two sets so it opens the picker, card 4's slot is already filled, card 5 is in no set at all.">
            <View style={styles.row}>
              <Pressable
                onPress={() => setPullOpen(true)}
                style={({ pressed }) => [
                  styles.demoButton,
                  { backgroundColor: c.backgroundElement },
                  pressed && { opacity: 0.6 },
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Open a pack</Text>
              </Pressable>
            </View>
            {/* Same scaffold, and the same two caveats, as the player sheet
                above: a plain Modal stands in for the route's own full-screen
                container, and its animation is off because react-native-web
                drives pointer-events from it. */}
            <Modal
              visible={pullOpen}
              transparent
              animationType="none"
              onRequestClose={() => setPullOpen(false)}>
              <PlayerSheetFrame
                title="You pulled 5 cards"
                tone={TierColors[scheme].gold.accent}
                onClose={() => setPullOpen(false)}
                closeLabel="Close packs">
                {/* The hero the real screen puts above the deck, in miniature.
                    Not decoration in a gallery: on a phone and on narrow web the
                    frame FLOATS its chrome over the content, so whatever is
                    first in the sheet sits under the ✕. Drop this and the
                    deck's own counter row lands beneath the close button, which
                    is a bug the gallery would be inventing rather than
                    reporting. */}
                <SheetToneBand tone={TierColors[scheme].gold.accent}>
                  <View style={styles.pullHero}>
                    <Text style={[Type.micro, { color: TierColors[scheme].gold.accent }]}>
                      PULLED
                    </Text>
                    <Text style={[Type.page, { color: c.text }]}>You pulled 5 cards</Text>
                  </View>
                </SheetToneBand>
                <PackReveal
                  pulled={PULLED_FIXTURE}
                  silverAt={200}
                  actions={pullActions}
                  loadingActions={false}
                  disposed={pullDisposed}
                  busy={null}
                  error={null}
                  onDismissError={() => {}}
                  onSell={(id) => {
                    setPullDisposed((held) => new Map(held).set(id, { kind: 'sold', gems: 8 }));
                    spendPullCard(id);
                  }}
                  onCommit={(id, code) => {
                    const was = pullActions.get(id);
                    const burnedThisCopy = was?.burnsThisCopy ?? true;
                    setPullDisposed((held) =>
                      new Map(held).set(id, {
                        kind: 'committed',
                        setName: was?.sets.find((x) => x.code === code)?.name ?? code,
                        gems: 4,
                        burnedThisCopy,
                      }),
                    );
                    if (burnedThisCopy) spendPullCard(id);
                  }}
                  onAgain={() => {
                    setPullDisposed(new Map());
                    setPullActions(PULL_ACTIONS_FIXTURE);
                  }}
                  onSeeInventory={() => setPullOpen(false)}
                />
              </PlayerSheetFrame>
            </Modal>
          </Section>

          <Section
            title="Card exits"
            note="The two ways a card leaves your collection, as the card profile offers them. Five states: one set open, several (the button opens a picker), a spare copy held so the burn takes a different card, a player already IN his set, and a set that is full. The last two keep the button in place and grey it rather than dropping it — a card with one exit reads as a card sets never applied to, when the truth is usually that you already placed him. Pressing either hands the decision to a ConfirmDialog on the real screen; here it just reports what was pressed.">
            <View style={styles.section}>
              <CardExits
                playerName="Drew Allar"
                tier="bronze"
                sellValue={8}
                sets={[KIT_SET_OPEN]}
                burnsThisCopy
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name} for ${x.pays}`)}
                onSell={() => setExitPicked('sell for 8')}
              />
              <CardExits
                playerName="Ja'Marr Chase-Williams"
                tier="gold"
                sellValue={150}
                sets={[KIT_SET_DAILY, KIT_SET_OPEN]}
                burnsThisCopy
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name} for ${x.pays}`)}
                onSell={() => setExitPicked('sell for 150')}
              />
              <CardExits
                playerName="Amar Johnson"
                tier="silver"
                sellValue={40}
                sets={[KIT_SET_OPEN]}
                burnsThisCopy={false}
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name} for ${x.pays}`)}
                onSell={() => setExitPicked('sell for 40')}
              />
              <CardExits
                playerName="Evan Engram"
                tier="bronze"
                sellValue={8}
                sets={[KIT_SET_FILLED]}
                burnsThisCopy
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name}`)}
                onSell={() => setExitPicked('sell for 8')}
              />
              {/* The other closed reason, which must not read the same: the
                  player is NOT in this set, it simply cannot take another. */}
              <CardExits
                playerName="Cam Little"
                tier="bronze"
                sellValue={8}
                sets={[KIT_SET_COMPLETE]}
                burnsThisCopy
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name}`)}
                onSell={() => setExitPicked('sell for 8')}
              />
              {/* The THIRD closed reason, and the only one about the copy
                  rather than the set: a weekly takes silver and better, and
                  this is a bronze. It has to read differently from both of the
                  above, because it is the only one with a way out — start the
                  card and the copy climbs. */}
              <CardExits
                playerName="Tank Dell"
                tier="bronze"
                sellValue={8}
                sets={[KIT_SET_UNDER_FLOOR]}
                burnsThisCopy
                busy={false}
                onCommit={(x) => setExitPicked(`add to ${x.name}`)}
                onSell={() => setExitPicked('sell for 8')}
              />
              <Text style={[Type.fine, { color: c.textTertiary }]}>
                {exitPicked ? `Pressed: ${exitPicked}` : 'Nothing pressed yet.'}
              </Text>
            </View>
          </Section>

          <Section
            title="Inventory cell"
            note="The grid cell in every state multi-select can put it in. The first is AT REST and carries no marks at all — the same card, out of the mode. IN SET means a copy of that PLAYER is already committed; this copy is still yours and still sellable, which is why it is the positive tone rather than a grey-out. It appears only while you are choosing, because that is the only time it is news.">
            <View style={styles.row}>
              {[
                { label: 'at rest', card: OWNED_CARDS[1], selecting: false, selected: false },
                { label: 'pickable', card: OWNED_CARDS[0], selecting: true, selected: false },
                { label: 'pickable, in a set', card: OWNED_CARDS[1], selecting: true, selected: false },
                { label: 'picked', card: OWNED_CARDS[0], selecting: true, selected: true },
                { label: 'picked, in a set', card: OWNED_CARDS[1], selecting: true, selected: true },
              ].map((s2, i) => (
                <View key={i} style={styles.iconCell}>
                  <InventoryCard
                    card={s2.card}
                    width={106}
                    selecting={s2.selecting}
                    selected={s2.selected}
                  />
                  <Text style={[Type.micro, { color: c.textTertiary }]}>
                    {s2.label.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          <Section
            title="Bulk bar"
            note="The inventory's multi-select bar. Both dialogs name the whole shape of the act before it happens — including what it will NOT do, which for a real selection is most of it: second copies of a player already going in, and cards no set has a slot for. Press either button to see its confirmation."
          >
            <View style={styles.row}>
              {[0, 1, 12, 64].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setBulkCount(n)}
                  style={({ pressed }) => [
                    styles.demoButton,
                    { backgroundColor: n === bulkCount ? c.backgroundSelected : c.backgroundElement },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Text style={[Type.strong, { color: c.text }]}>{`${n} selected`}</Text>
                </Pressable>
              ))}
            </View>
            <BulkBar
              count={bulkCount}
              max={64}
              sellGems={bulkCount * 8}
              plan={KIT_COMMIT_PLAN}
              planning={false}
              stage={bulkStage}
              busy={false}
              error={null}
              result={
                bulkCount === 0
                  ? {
                      kind: 'sold',
                      done: 11,
                      skipped: 1,
                      gems: 88,
                      firstReason: 'card is in a lineup that has not been scored yet',
                    }
                  : null
              }
              onSell={() => setBulkStage('selling')}
              onAdd={() => setBulkStage('adding')}
              onConfirmSell={() => setBulkStage('idle')}
              onConfirmAdd={() => setBulkStage('leftovers')}
              onConfirmSellLeftovers={() => setBulkStage('idle')}
              onCancelStage={() => setBulkStage('idle')}
              onClear={() => setBulkCount(0)}
              onDismissResult={() => setBulkCount(12)}
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  filterChips: { flex: 1, minWidth: 0 },
  fill: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, maxWidth: 760, width: '100%', alignSelf: 'center' },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  iconCell: { alignItems: 'center', gap: Spacing.two },
  summaryPad: { padding: Spacing.two + 2 },
  pullHero: { gap: Spacing.two, paddingBottom: Spacing.three },
  demoButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
});
