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
import {
  ContestCard,
  type CardLevel,
  type Lock,
} from '@/components/contests/ContestCard';
import type { ContestTerms, Duel, Settlement } from '@/components/contests/contest-model';
import { ContestAbout } from '@/components/contests/ContestAbout';
import { ContestActions } from '@/components/contests/ContestActions';
import { ContestFieldList } from '@/components/contests/ContestFieldPanel';
import type { FieldEntrant } from '@/components/contests/use-contest-field';
import type { FieldWeek } from '@/components/lineup/field';
import type { Run } from '@/components/runs/run';
import { BADGE_SIZE, BADGE_WIDTH, BenchRow, StarterRow } from '@/components/lineup/LineupRow';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import type { LineupCard } from '@/components/lineup/model';
import { PlayerRow } from '@/components/cards/PlayerRow';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { ContestHearts, Hearts } from '@/components/runs/Hearts';
import { SearchField, SortChips } from '@/components/ui/Controls';
import { summarise } from '@/components/collection/types';
import {
  KIT_COMMIT_PLAN,
  KIT_ENTRY_SLOTS,
  KIT_UNSEEN_SETS,
  KIT_SET_DAILY,
  KIT_SET_COMPLETE,
  KIT_SET_UNDER_FLOOR,
  KIT_SET_FILLED,
  KIT_SET_OPEN,
  OWNED_CARDS,
  OWNED_MANY,
  PULLED_FIXTURE,
  SHELF_FIXTURE,
  SHELF_OPENINGS,
  PULL_ACTIONS_FIXTURE,
} from '@/components/dev/fixtures';
import { BulkBar, type BulkStage } from '@/components/collection/BulkBar';
import { InventoryCard } from '@/components/collection/InventoryCard';
import { RosterBar } from '@/components/collection/RosterBar';
import { RosterCut } from '@/components/collection/RosterCut';
import { CardExits } from '@/components/cards/CardExits';
import { PullDeck } from '@/components/cards/PullDeck';
import { PullBar } from '@/components/cards/PullBar';
import { planSweep } from '@/components/cards/pull-plan';
import { useReveal } from '@/components/cards/use-reveal';
import { PackShelf } from '@/components/cards/PackShelf';
import type { CardActions } from '@/components/cards/card-actions';
import type { Disposition } from '@/components/cards/use-pull-actions';
import { GameRow } from '@/components/scores/GameRow';
import { ScoreStrip } from '@/components/scores/ScoreStrip';
import { LeadersPanel } from '@/components/scores/LeadersPanel';
import type { Leader, ScoreGame } from '@/components/scores/scoreboard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownChip } from '@/components/ui/DropdownChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { EntryLineup } from '@/components/contests/EntryLineup';
import { WelcomeBackBanner } from '@/components/contests/WelcomeBackBanner';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { SegmentedControl } from '@/components/shell/SegmentedControl';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { POSITION_ORDER, POSITIONS } from '@/constants/positions';
import { Colors, Spacing, Type, selectionAccent } from '@/constants/theme';
import { Icon } from '@/components/icons/Icon';
import { GLYPHS } from '@/components/icons/glyphs';
import { validateSet } from '@/components/icons/validate';
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
/**
 * A `top_n` field, and the numbers are the point of it.
 *
 * 27.1 is ABOVE this field's median (24.8) and BELOW the third-place cut
 * (38.4). Under the old card — which drew the median on every contest — that
 * was a green bar past the mark, i.e. a player being shown they were winning a
 * contest they were fourth in. Any fixture where the two lines agree cannot
 * demonstrate the bug this rewrite fixes.
 */
const DEMO_FIELD_CUT: FieldWeek = {
  week: 3, entrants: 6, low: 12.0, median: 24.8, average: 29.4, high: 58.9, final: false,
  myPoints: 27.1, myRank: 4, ahead: 2, result: null,
};

/**
 * The three shapes of terms the card is asked to draw.
 *
 * `KIT_TERMS_FREE` is the game's main contest: no fee, no pool, one heart. It
 * is the case that must draw NO terms rail at all — a "0 gems / 0 pool" strip
 * would make the contest everybody is in look like a lesser version of the
 * ones they chose.
 */
const KIT_TERMS_FREE: ContestTerms = {
  formatName: 'Full Roster', slotCount: 8, entryFeeGems: 0,
  heartsAtRisk: 1, heartsOnWin: 0,
  winCondition: 'median', winRank: null, prizePool: 0, entrants: 26, maxEntrants: null,
};
const KIT_TERMS_MEDIAN: ContestTerms = {
  formatName: 'Flex Three', slotCount: 3, entryFeeGems: 40,
  heartsAtRisk: 0, heartsOnWin: 0,
  winCondition: 'median', winRank: null, prizePool: 120, entrants: 12, maxEntrants: null,
};
/**
 * A field with one row per state the panel has to draw.
 *
 * FOUR ROWS BECAUSE THE SUB-LINE HAS FOUR ANSWERS, and they are ranked: a prize
 * ends the story, an unfinished lineup is the most actionable thing about a
 * rival, and after that it is whether what you would open is locked in or still
 * being edited. A real contest holds all four at once on a Sunday evening, and
 * arranging that against a live database means waiting for a kickoff.
 */
const KIT_FIELD: FieldEntrant[] = [
  {
    userId: 'k1', displayName: 'seahawkcalvin', avatarKey: 'default',
    lineupId: 'kl1', filled: 3, points: 61.4, rank: 1,
    result: 'W', prize: 120, isMe: false, locked: true,
  },
  {
    userId: 'k2', displayName: 'Xx OG CHIEF Xx', avatarKey: 'default',
    lineupId: 'kl2', filled: 3, points: 48.2, rank: 2,
    result: 'W', prize: 72, isMe: false, locked: true,
  },
  /* You, mid-table, with a lineup that is always your own to read. */
  {
    userId: 'k3', displayName: 'nickroachy', avatarKey: 'default',
    lineupId: 'kl3', filled: 3, points: 27.1, rank: 3,
    result: 'L', prize: null, isMe: true, locked: true,
  },
  /* Still holding a card that has not kicked off, and one slot short. Both
     facts are the row's sub-line, in that order — an unfinished lineup is the
     more actionable of the two. */
  {
    userId: 'k4', displayName: 'bloomguy', avatarKey: 'default',
    lineupId: 'kl4', filled: 2, points: 0, rank: 4,
    result: null, prize: null, isMe: false, locked: false,
  },
];

/**
 * A run mid-way through: four pips, three still held, two of them staked.
 *
 * The rack fixture the contest rules panel needs, and it is deliberately NOT a
 * fresh run — a rack of three untouched hearts draws one state and hides the
 * two that carry the meaning (a blade for staked, a tear for lost).
 */
const KIT_RUN: Run = {
  id: 'kit-run',
  hearts: 3,
  maxHearts: 4,
  rack: 4,
  wagered: 2,
  wageredIn: 2,
  wins: 5,
  losses: 1,
  endedAt: null,
  awaitingCarry: false,
  carrySlots: 3,
  nextRung: { atWins: 8, cardSlots: 5 },
  heldCards: 24,
  lostCards: 0,
};

const KIT_TERMS_TOP_N: ContestTerms = {
  formatName: 'WR Room', slotCount: 3, entryFeeGems: 40,
  heartsAtRisk: 1, heartsOnWin: 1,
  winCondition: 'top_n', winRank: 3, prizePool: 240, entrants: 6, maxEntrants: null,
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
/**
 * The `flex3` contest format's slots, which is the vocabulary that caught the
 * ordinal bug: `SLOT_POSITIONS` lists `FLEX`, the format emits `FLEX1..3`, and
 * the exact-match lookup returned nothing — so a three-flex lineup drew three
 * grey chips reading FLEX instead of three split badges. Kept here so the split
 * form is exercised against an ORDINAL slot and not only against a bare one.
 */
const FLEX3_SLOTS = ['QB', 'FLEX1', 'FLEX2', 'FLEX3', 'WR3', 'K'];

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
/**
 * The lint, run once at module load rather than per render.
 *
 * The glyph set is a module constant, so its findings are too — recomputing
 * them on every re-render of a gallery would be work that can never produce a
 * different answer.
 */
const ICON_FINDINGS = validateSet(GLYPHS);

function Kit() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);
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
  /** Which pack the shelf fixture is pretending to open, so `busy` is reachable. */
  const [shelfOpening, setShelfOpening] = useState<string | null>(null);
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
            title="Badge glyphs"
            note="Every glyph in the construction system, hollow then solid, at 24 and 64 — plus what the lint says.">
            {/* THE WHOLE SET IN ONE ROW IS THE POINT. A glyph is never wrong on
                its own; it is wrong beside its neighbours, and the keyline
                exists so a circle, a shield and a diamond can sit in one row
                without any of them looking the wrong size. That is only
                checkable here, all at once. */}
            <View style={[styles.row, { gap: Spacing.four, flexWrap: 'wrap' }]}>
              {GLYPHS.map((g) => (
                <View key={g.name} style={styles.iconCell}>
                  <Icon glyph={g} color={c.textSecondary} background={c.background} size={24} />
                  <Icon glyph={g} color={c.text} background={c.background} focused size={24} />
                  <Text style={[Type.micro, { color: c.textTertiary }]}>{g.name}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.row, { gap: Spacing.four, flexWrap: 'wrap' }]}>
              {GLYPHS.map((g) => (
                <Icon
                  key={`big-${g.name}`}
                  glyph={g}
                  color={c.text}
                  accent={accent}
                  background={c.background}
                  focused
                  size={64}
                />
              ))}
            </View>
            {/* The lint's own report, rendered where the set is reviewed rather
                than only in a terminal. A clean line here is the claim that
                every glyph above agrees with `system.ts`; it is deliberately
                loud when it is not. */}
            {ICON_FINDINGS.length === 0 ? (
              <Text style={[Type.fine, { color: c.textTertiary }]}>
                Lint clean — {GLYPHS.length} glyphs agree with the system.
              </Text>
            ) : (
              ICON_FINDINGS.map((f, i) => (
                <Text
                  key={i}
                  style={[
                    Type.fine,
                    { color: f.severity === 'error' ? c.negative : c.warning },
                  ]}>
                  {f.severity} · {f.glyph} · {f.rule} — {f.detail}
                </Text>
              ))
            )}
          </Section>

          <Section
            title="Contest card"
            note="ONE CARD, ONE SIZE. Head, scoring and trade — always all three, always at the same three heights, on every surface and in every phase of the week. That is the point of the 2026-08-27 rework: these are the pages of a horizontal carousel over a lineup board, so a card eleven points taller than its neighbour makes the whole screen jump on a swipe, and a card that grows when the first score lands moves the board out from under a reader mid-tap. Every text is one line and the trade columns pad to two rows rather than collapsing — a contest that risks no hearts is a shorter LIST, not a shorter card. THE HEAD is two rows: the name with the countdown at the far right, then how the contest is WON directly under it with the fill count under the countdown. The win condition led the trade band before, one rank down — it is not a term of the trade, it is what the contest IS. The countdown doubles as the phase (NEXT LOCK, then LIVE, then FINAL) and the entry count keeps it company because both are the contest's clock: how long you have, and whether enough people have turned up for the week to be scoreable. The win condition is LABELLED (`TO WIN`) rather than emphasised — it was 13pt semibold and in an argument with the contest's own name eleven points above; a reader who does not know what “Top 3 of 6 win” is a statement ABOUT cannot be told by making it bolder, only by naming it. And every string in the entry slot is counted rather than eyeballed: there is room for about eighteen characters beside it, and two drafts have already been lost to that — see `fillLine`. The season record used to sit here and is gone — it is one contest's property drawn on every card, and nothing on this screen is about the season. THE SCORING BAND IS A SCOREBOARD, which is the 2026-08-27 evening rework. Every format this game can have is one sentence with a different noun in it — you against the community's middle, you against the score at the cut, you against another manager — so the band draws two named sides and two totals, and the right-hand NAME is the only thing a format changes. `opponentOf` answers “who am I playing” where `markOf` answered “where do I draw a line”, which is why the head-to-head cards below are the same card and not a second one. Under the totals is a SLOT, not a rail: a field draws the distribution (where you sit between its worst and best, with the line to beat marked — the one thing a 26-manager contest has that a duel does not), a duel draws a tug-of-war from level, and a week with nothing to plot draws the empty rail so the first score arrives ON the scale. Only one state needs words — a week played in a contest with nobody else in it names its opponent NO FIELD YET, because a real total against a dash is otherwise unexplained. Before kickoff it reads 0–0 like any scoreboard before a game — which reverses an earlier call that 0.0 pregame was a bug. It WAS one, when a stored nought arrived under a FINAL chip on a week that had not started; a nought as one side of a scoreboard is a different claim made with the same character. The noughts are drawn tertiary so an empty scoreboard is not the loudest thing on the card. THE WHOLE CARD IS 166pt — 51 + 57 + 56 — down from 189, with nothing removed: five points of band padding a side instead of seven, the slot back to the rail's own 8, the hero back to 18/21, and the trade's values set at `fine` rather than `body`, which corrects a rank inversion as well as saving two points. A lineup row underneath is 62, so the card is under three of them. THE TRADE has its labels and its divider back — an arrow between the columns says which way a trade runs only to somebody who already knows they are looking at one. Both columns read from the LEFT: mirroring them about the divider gave the card two reading edges, so the reward lines began in a place that lined up with nothing above them. The first two here are lobby cards; the rest are entered. The ones that matter: a top-three contest where the median decides nothing and the mark is the CUT (27.1 is above that field's median and outside the places that pay, exactly the state the old card drew as winning); a field of ONE, which is its own low, mark and high; and the same card at both levels so the two fills can be compared. THE TRADE CHANGES TENSE WHEN THE WEEK DOES, which is the card's FINISHED STATE and the last four cards here. `RISK` and `REWARD` describe an offer — what you will put up, what you could take — and that stops being true at the final whistle; a settled card was drawing “♥ 1 heart” for a heart it had already kept and quoting a per-point rate as an inducement to enter a contest nobody could enter. So the same two columns become `STAKED` and `EARNED`, same geometry, same reserved rows, same height. It turns over on the WEEK being final rather than on the slate rolling, because the gap between those is Monday and Tuesday and that is when a player reads this. Three payments can land in EARNED and there is room for two, so the order is a ranking: the prize (specific to this contest, and what entering was for), then a healed heart (the scarcest thing in the game), then what the cards earned — which drops last because it is restated in full, one figure per row, on the lineup directly underneath. On the free contest there is no prize and the card gems ARE the receipt. AND NEITHER NULL IS ROUNDED DOWN: the last card is final-and-unpaid, where award_score_gems and settle_run_hearts have not run — EARNED says “Still settling” rather than nothing, and the heart carries no verdict rather than being claimed as kept. This is what retired the bordered four-line “This week is finished” note that used to stand between the card and the lineup; a band that has stopped asking for a decision IS the finished state. WHAT IS NO LONGER HERE: the lineup count. `1 SLOT TO FILL` and `7/8` are what the board's own `Starting lineup · 3/3 FILLED` heading says directly underneath, next to the rows you would fix it from."
          >
            <ContestCard
              name="WR Room"
              terms={KIT_TERMS_TOP_N}
              status={<StatusChip label="Enter" tone="warning" />}
              onPress={() => {}}
            />
            {/* No entries yet, so no pool yet — the state a four-tester week
                spends most of its time in, and the one a placeholder would have
                papered over. The reward line is the only string on this card
                long enough to wrap, which is why the columns allow two lines. */}
            <ContestCard
              name="Flex Three"
              terms={{ ...KIT_TERMS_MEDIAN, prizePool: 0, entrants: 0 }}
              status={<StatusChip label="Not enough gems" />}
              onPress={() => {}}
            />

            {/* Entered, open, one slot short — the state a week spends five of
                its seven days in, and the one the old card handed to a 22pt
                duplicate of the heading below it. */}
            <KitEntered
              name="Preseason Week 3"
              terms={KIT_TERMS_FREE}
              myPoints={null}
              field={DEMO_FIELD_UNPLAYED}
              lock={{ at: DEMO_LOCK_SOON, locked: false, now: DEMO_NOW }}
            />
            {/* Live, ahead of the median. */}
            <KitEntered
              name="Preseason Week 3"
              terms={KIT_TERMS_FREE}
              myPoints={118.4}
              field={DEMO_FIELD_AHEAD}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* Final, behind it. */}
            <KitEntered
              name="Preseason Week 2"
              terms={{ ...KIT_TERMS_FREE, entrants: DEMO_FIELD_BEHIND.entrants }}
              myPoints={71.9}
              field={DEMO_FIELD_BEHIND}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* A field of ONE: its own low, mark and high, so there is no range
                to place anybody in and the rail stays empty even though there
                IS a score. The rank is exempt from the tie rule — "#1 OF 1" is
                never in doubt and says exactly what it is worth. */}
            <KitEntered
              name="Preseason Week 1"
              terms={{ ...KIT_TERMS_FREE, entrants: DEMO_FIELD_ALONE.entrants }}
              myPoints={88.2}
              field={DEMO_FIELD_ALONE}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* The cut, and a settled prize in place of the pool.

                SETTLED ON THE FIELD, not on a prop beside it. `final` used to
                be handed to the card separately from the field it describes,
                which let a fixture claim a paid-out prize on a live week. It is
                `field.final` now and there is only one of it. */}
            <KitEntered
              name="WR Room"
              terms={KIT_TERMS_TOP_N}
              myPoints={27.1}
              field={{ ...DEMO_FIELD_CUT, final: true }}
              cut={38.4}
              prize={120}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* HEAD TO HEAD — the format that does not exist yet, drawn by the
                same card with nothing changed but the noun on the right.

                THE POINT OF THE WHOLE SCOREBOARD IS THIS CARD. `opponentOf`
                returns a handle instead of a derived line, the band swaps the
                distribution for a tug-of-war because two people are not a
                field, and every other row is byte-identical to the contest
                above it. Nothing in the app constructs one of these; it is here
                so that a switch with one case is not mistaken for a design. */}
            <KitEntered
              name="Sunday Duel"
              terms={{ ...KIT_TERMS_MEDIAN, entrants: 2 }}
              myPoints={118.4}
              field={{ ...DEMO_FIELD_AHEAD, entrants: 2, low: 97.6, high: 118.4, myRank: 1 }}
              opponent={{ handle: '@calvin', points: 97.6 }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* THE SAME DUEL, LOSING. The tug runs the other way and takes the
                negative colour; the centre line stays put, because level is the
                reference and has to be visible at any margin. */}
            <KitEntered
              name="Sunday Duel"
              terms={{ ...KIT_TERMS_MEDIAN, entrants: 2 }}
              myPoints={71.9}
              field={{ ...DEMO_FIELD_BEHIND, entrants: 2, low: 71.9, high: 133.0, myRank: 2 }}
              opponent={{ handle: '@calvin', points: 133.0 }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />

            {/* LOCKED AND UNPLAYED — the narrow third state of the figure slot:
                no score yet, and no deadline left to count toward. The count
                takes the slot back, and has earned the size here, because a
                lineup short at lock is short for good. */}
            <KitEntered
              name="Preseason Week 4"
              terms={KIT_TERMS_FREE}
              myPoints={null}
              field={DEMO_FIELD_UNPLAYED}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* THE FINISHED STATE, WHICH IS THE THIRD BAND IN THE PAST TENSE.

                `STAKED` and `EARNED` where `RISK` and `REWARD` were, and it
                turns over the moment the WEEK is final rather than when the
                slate rolls — otherwise a card would spend Monday and Tuesday
                offering a heart it had already resolved, which is exactly when
                a player is reading it. This is what retired the bordered
                "This week is finished" note that used to stand between the card
                and the lineup; see `RecapBoard`.

                THE FREE CONTEST WON. No pool, so no prize, and the whole of
                what it paid is what its cards earned — 148 gems, which is the
                sum of the per-row figures on the settled lineup above. */}
            <KitEntered
              name="Preseason Week 4"
              terms={{ ...KIT_TERMS_FREE, entrants: DEMO_FIELD_AHEAD.entrants }}
              myPoints={118.4}
              field={{ ...DEMO_FIELD_AHEAD, final: true, result: 'W' }}
              settled={{ result: 'W', gems: 148 }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* LOST, WHICH IS THE HALF THE OFFER COULD NOT SAY. The heart is
                drawn torn and in the negative colour — `Hearts` already owns
                that shape for the rail directly under the carousel, so the
                glyph and the word beside it agree — and the cards were still
                paid, because the faucet is not a prize and does not care who
                won. */}
            <KitEntered
              name="Preseason Week 2"
              terms={{ ...KIT_TERMS_FREE, entrants: DEMO_FIELD_BEHIND.entrants }}
              myPoints={71.9}
              field={{ ...DEMO_FIELD_BEHIND, final: true, result: 'L' }}
              settled={{ result: 'L', gems: 96 }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* A PAID CONTEST, WON, WITH A HEAL. Three things were paid and the
                band reserves two rows, so this is the card that proves the
                ranking in `takeLines`: the prize leads because it is what
                entering was for, the heart follows because hearts are the
                scarcest thing in the game, and the card gems drop — they are
                the one line restated in full one figure per row directly
                underneath. */}
            <KitEntered
              name="WR Room"
              terms={{ ...KIT_TERMS_TOP_N, heartsOnWin: 1 }}
              myPoints={54.8}
              /* Second of six and inside the places, which is what a W in a
                 top-three contest has to look like. The base fixture is the
                 LOSING side of the same cut — 27.1 in fourth — and inheriting
                 its rank here would have drawn a prize and a kept heart over
                 "#4 OF 6", the card contradicting itself in two bands. */
              field={{ ...DEMO_FIELD_CUT, final: true, result: 'W', myRank: 2, ahead: 4 }}
              cut={38.4}
              prize={120}
              settled={{ result: 'W', gems: 61 }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* FINAL AND NOT YET PAID, which is the state a week spends its
                first minutes in and the one a fixture is the only way to see.
                `award_score_gems` has not run, so there is no figure to report
                and the column says so; `settle_run_hearts` has not run either,
                so the heart carries NO VERDICT rather than being claimed as
                kept. Both of those are nulls that mean "not yet", and the one
                thing this card must never do is round them down to nothing. */}
            <KitEntered
              name="Preseason Week 4"
              terms={{ ...KIT_TERMS_FREE, entrants: DEMO_FIELD_AHEAD.entrants }}
              myPoints={118.4}
              field={{ ...DEMO_FIELD_AHEAD, final: true }}
              settled={{ result: null, gems: null }}
              lock={{ at: DEMO_LOCK_PAST, locked: true, now: DEMO_NOW }}
            />
            {/* AT `page` LEVEL, which is the fill the board uses: the same grey
                as the tab bar. The run used to be a fourth band under this one;
                it is a row beneath the whole carousel now — see `RunRail`, and
                the rack states below. */}
            <KitEntered
              name="Preseason Week 4"
              terms={KIT_TERMS_FREE}
              myPoints={null}
              field={DEMO_FIELD_UNPLAYED}
              level="page"
              lock={{ at: DEMO_LOCK_SOON, locked: false, now: DEMO_NOW }}
            />
          </Section>

          <Section
            title="The run rack"
            note="A receipt is a fourth object and a separate axis: a settled contest's outcome, drawn on the heart it borrowed — green W, red L, grey T — and the letter is what carries it so the pair survives greyscale and a red-green deficiency. Receipts sit LEFT of the rack, separated by a breath rather than a rule, and they leave with the recap window. THREE STATES AND THREE DIFFERENT OBJECTS. A heart you hold is solid whether or not it is staked, because it is equally yours either way; what marks a stake is a blade driven through it, and what marks a loss is the heart torn in two. The old set was one shape at three intensities — solid, outlined, outlined-and-cracked — which inverted the one convention every player knows (filled means you have it) and, worse, drew “at risk” as a cracked heart, i.e. as the picture of a heart that has already broken. WHICH HEART THE PAGE IS ABOUT is drawn ONE way, whatever the heart is: it stays at full strength while the rest recede, and gold corner ticks confirm it. That was two different marks once — a gold blade on a staked heart, a dashed box on a free one — which made the reader learn the same answer twice. The blade is identity and stays steel; the ticks are focus and are always gold; brightness is the primary signal and survives being small. Rows below: a fresh run, a run with two of three staked and one already lost, the last-heart state, and the tile’s view of the same rack.">
            <View style={{ gap: Spacing.three }}>
              <Hearts hearts={3} rack={3} size={26} />
              <Hearts hearts={3} wagered={2} rack={4} focus={{ start: 0, count: 1 }} size={26} />
              <Hearts hearts={1} wagered={1} rack={4} focus={{ start: 0, count: 1 }} size={26} />
            </View>
          </Section>

          <Section
            title="The board's contest row"
            note="A DIFFERENT OBJECT FROM THE RACK ABOVE, and the difference is what it is counting. The rack is a RUN — held, staked, lost. This is one heart per CONTEST on the board, in the carousel's own order, so pip N is card N and tapping one is the same gesture as swiping to it. Four states: a hollow heart is a contest you have not entered (the one place this file uses an outline, and the one place “filled means you have it” points the right way round), a solid one is a heart riding right now, and a green W / red L / grey T is a settled week's receipt. Second row: the same set with the third card in view.">
            <View style={{ gap: Spacing.three }}>
              <ContestHearts
                entries={[
                  { result: null, entered: false },
                  { result: null, entered: true },
                  { result: 'W', entered: true },
                  { result: 'L', entered: true },
                  { result: 'T', entered: true },
                ]}
                size={26}
              />
              <ContestHearts
                entries={[
                  { result: null, entered: false },
                  { result: null, entered: true },
                  { result: 'W', entered: true },
                  { result: 'L', entered: true },
                  { result: 'T', entered: true },
                ]}
                focus={{ start: 2, count: 1 }}
                size={26}
              />
              {/* THE RECEIPTS LAPSED. Same five contests, a day later — or one
                  press of the banner's ✕. This is the row that cannot be
                  reached by waiting, and the one most worth looking at: the
                  badges are gone and NOTHING has reverted to a lie. */}
              <ContestHearts
                entries={[
                  { result: null, entered: false, showResult: false },
                  { result: null, entered: true, showResult: false },
                  { result: 'W', entered: true, showResult: false },
                  { result: 'L', entered: true, showResult: false },
                  { result: 'T', entered: true, showResult: false },
                ]}
                size={26}
              />
            </View>
          </Section>

          <Section
            title="Welcome back"
            note="The one thing a settled week owes a player who was not watching, at the top of the board rather than as a modal over it: the board is already two sheets deep on its busiest path, and a dismissal handed to somebody who opened the app to set a lineup is a tax paid every Tuesday for news that needs no answer. It has NO TIMER, deliberately, and that is what makes the 24-hour clock on the rail's receipts safe — recap_slate() exists because results that expire on a clock mean a player who does not open the app for two days never learns how they did, so this carries that guarantee instead and waits as long as it has to. Pressing the row opens the archive; only the ✕ marks anything seen, because a banner that cleared itself on the way to the detail would be gone when you came back. Four states: one contest won, one lost, a mixed week, and the returning player whose marks are capped at four with a count — a fortnight away is a dozen results, and twelve pips in a banner is a texture rather than a summary. The last is the case with NO result at all, which a field too small to be a contest produces and which must never be worded as a loss.">
            <View style={{ gap: Spacing.three }}>
              {KIT_UNSEEN_SETS.map((set, i) => (
                <WelcomeBackBanner
                  key={i}
                  entries={set}
                  onOpen={() => {}}
                  onDismiss={() => {}}
                />
              ))}
            </View>
          </Section>

          <Section
            title="Contest field"
            note="Who else is in a contest, on the contest’s own page. The card draws the community as a distribution because there is no opponent to draw; this is the other half — the same field, named. Every row is a door into that manager’s lineup, which is readable from the moment they file it: the reveal rule that used to seal a lineup until its last card kicked off is gone, and what is left of it is the sub-line, which says whether what you would open is locked in or still being edited. Your own row is tinted rather than badged — a “You” chip would compete with the result chip in the same corner."
            >
            <ContestFieldList entrants={KIT_FIELD} slotCount={3} onOpen={() => {}} />
          </Section>

          <Section
            title="Contest rules"
            note="The contest’s page in sentences, under the card that prices it in eight characters. Every number is derived from the same `ContestTerms` the card reads, so the panel cannot come to disagree with the row that was tapped to reach it — the pool share, the top prize and the minimum field are `contest-model`’s own arithmetic. The scoring row is the one that leads somewhere: the ruleset is the same for every contest and only `scoring.tsx` states it truly.">
            <ContestAbout
              terms={KIT_TERMS_TOP_N}
              name="WR Room"
              prizePoolBps={2500}
              leavable
              /* A rack of four with two staked and one already lost, so the
                 row shows all three heart states rather than the one a live
                 account happens to be in. */
              run={KIT_RUN}
            />
          </Section>

          <Section
            title="Contest actions"
            note="Pinned to the bottom of the contest sheet, because that page is now four screens long and the control it used to hide at the end was the way OUT. Leaving is outlined rather than filled: the gems come back in full and you can enter again while the games are still ahead, so a solid red button would be shouting about something completely reversible. Once a card has kicked off there is nothing to leave, and the bar says so rather than offering a button the server would refuse.">
            <View style={{ gap: Spacing.three }}>
              <ContestActions
                entryFeeGems={40}
                locked={false}
                canLeave
                onLineup={() => {}}
                onLeave={() => {}}
              />
              <ContestActions
                entryFeeGems={40}
                locked
                canLeave
                onLineup={() => {}}
                onLeave={() => {}}
              />
            </View>
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
            note="Every position; then every lineup slot AS THE LINEUP DRAWS IT — filled with the position's own accent, one fixed width, no ordinals. The bench keeps the grey outline, which is what tells a starting slot from a benched card now. Then the same slots at their natural widths, and last the `flex3` format's ordinal slots — FLEX1/2/3 and WR3 — which resolve by stripping the ordinal. That last row is a regression guard: those codes are not keys in `SLOT_POSITIONS`, and when the lookup did not strip they all fell through to a solid grey chip.">
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
                />
              ))}
              <PositionBadge label="BN" size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />
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
            <View style={styles.row}>
              {FLEX3_SLOTS.map((slot) => (
                <PositionBadge
                  key={`f3-${slot}`}
                  label={slotBadgeLabel(slot)}
                  positions={positionsForSlot(slot)}
                  size={BADGE_SIZE}
                  width={BADGE_WIDTH}
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
            title="Pack shelf"
            note="The three rows a shelf can hold: a free once-per-player pack (spent, so the button is dead), a free daily (claimable), and a paid repeatable one — which is the only kind that carries the ×1/×5/×10 row, because it is the only kind you could buy twice anyway. The ×10 here costs more than the fixture's 1,240 gems, so it is dimmed; pressing it is still allowed and the money line answers with the shortfall.">
            <Panel>
              <View style={styles.summaryPad}>
                <PackShelf
                  packs={SHELF_FIXTURE}
                  dailyAvailable
                  gems={1240}
                  openings={SHELF_OPENINGS}
                  openingCode={shelfOpening}
                  progress={shelfOpening === 'standard' ? { done: 3, total: 10 } : null}
                  /* Inert: there is no session behind this page. The press is
                     here to prove the busy state is reachable and that the
                     count reaches the button, not to mint anything. */
                  onOpen={(code) =>
                    setShelfOpening((held) => (held === code ? null : code))
                  }
                />
              </View>
            </Panel>
          </Section>

          <Section
            title="Pack pull"
            note="The pull page: a deck of cards face down, turned over as they reach the middle, each carrying its own sell / add-to-set pair underneath it — and one fixed bar at the bottom holding whatever the next thing to do is. Shown as a full-screen takeover, because that is what the route is. The five cards are the five states that pair can be in: card 1 ordinary, card 2 commits a spare copy so the card stays yours, card 3 is in two sets so it opens the picker, card 4's slot is already filled, card 5 is in no set at all. Press Reveal all to reach the bar's second state, which is the two whole-pack sweeps.">
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
            {/* Same scaffold, and the same caveat, as the player sheet above: a
                plain Modal stands in for the route's own full-screen container,
                and its animation is off because react-native-web drives
                pointer-events from it. */}
            <Modal
              visible={pullOpen}
              animationType="none"
              onRequestClose={() => setPullOpen(false)}>
              <KitPull
                actions={pullActions}
                disposed={pullDisposed}
                onClose={() => setPullOpen(false)}
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
              />
            </Modal>
          </Section>

          <Section
            title="Settled entry"
            note="A finished lineup, read rather than built — the same component on your own settled contest and on somebody else's, opened off a row of the field. IT IS THE BOARD'S ROW. It was its own component, on the argument that `contest_lineup` returns none of the fields a `LineupCard` carries and should not — which was right about the INPUT and wrong to conclude anything about the output. The two are the same card in the same slot in the same eight, and a player who files a lineup on Saturday and reads it back on Tuesday is comparing them directly; drawn separately they came apart exactly where you would expect, at two lines against the board's three, with the tier mark up beside the position instead of down on the line about the card. The fix was to narrow the input rather than fork the output: `RowCard` is the nine fields a row actually reads, `LineupCard` satisfies it structurally so the board is untouched, and 20260831050000 sends the fixture that was the one thing genuinely missing. THREE DIFFERENCES AND NO MORE, all of them on the two lines that report a week rather than a card. The fixture line says WHO WON — `FINAL` is the least informative word available on a screen about a week that is over, since every row says it and the reader already knows, so that token is spent on `W 27–13 vs BUF` instead. The W and the L are their own coloured token rather than tinting the line, because `W 27–13 vs BUF` all in green would claim the opponent was good news too; a tie takes the quiet colour, being a result nobody is pleased or sorry about. The RIGHT COLUMN is a GAIN rather than a total, over what that gain PAID — one subject, the week, in the two currencies a week is worth anything in, filling the slot the board reserves for a projection it does not have. The gain is signed from the number and not prefixed, because fantasy points went signed in 20260828150000 and a hard-coded plus eventually renders `+-2.4`. It is TOP-ALIGNED and one size down (14, not the board's 15), which reverses this file's own rule about not aligning the two columns: that rule defends a figure over a dash, and it stops holding for two FILLED lines over a third that runs the full width underneath — centred, the pair floats in the middle of the row with nothing to be centred on. THE TIER LINE CARRIES THE MOVEMENT. `9.8 TFP` is where the card stands and says nothing about how it got there; `0.0 → 9.8 TFP` says this contest is where all of it came from, which is the point of reading a recap at all. The arrow is drawn only where the card actually moved — `48.5 → 48.5` on a bye invites a reader to look for a difference that is not there. An earlier draft put that `before` figure in the right-hand column beside the gain, and it was the wrong column twice over: half a movement parked next to the other half, and 20pt of width taken from the name, which truncated `Ty Simpson` to `Ty Simps…` on a 375pt phone. Moving it onto the line about the card's standing fixed both, and the column went back to the board's own 64. A column that has to grow is usually a column holding something that lives somewhere else. The CLOSING PHRASE is then a distance (`142 to Silver`) where the board prints a span (`142/200 to Silver Tier`), since the span would put a 142 beside the 142.4 two words to its left; where the movement crossed a floor it prints the promotion instead and turns green. THE ROWS ARE THE STATES: a win, a loss, a tie, a bye (the only line in the app drawn as a warning), a promotion and the exact-boundary version of it, a card already inside its tier, the top tier with nothing above it, a diamond card carrying a position bonus folded into the 106 it actually made, a week SETTLED BUT NOT YET PAID where award_score_gems has not run and a nought would tell a player their week earned nothing at the moment they came to find out what it earned, and last THE UNMIGRATED CLIENT — a database without 20260831020000, 040000 and 050000, which keeps its name, its badge and its figure and goes quiet on every line that needs a column the server is not sending. THE HEADING IS BARE on the recap board — no hint, no control. It briefly carried both, which was already smaller than the bordered four-line note it replaced, and still wrong: the carousel's promise is that swiping changes the CONTEST and not the page, so a heading that grows a subtitle and a link on one page and loses them on the next moves the rows under it by a line every time you cross that boundary. Two words of guidance are not worth a board that jumps. The entry page still passes a hint (“Locked in”), because it is a page of its own with nothing to swipe between."
          >
            <View style={styles.section}>
              {/* THE HEADING IS THE BOARD'S, BARE. The recap board passes no
                  hint and no control: the carousel's promise is that swiping
                  changes the contest and not the page, and a heading that
                  grows a subtitle on one page moves the rows under it by a
                  line every time you cross that boundary. The entry page does
                  pass a hint — "Locked in" — because it is a page of its own
                  with nothing to be swiped between. */}
              <EntryLineup
                slots={KIT_ENTRY_SLOTS}
                /* THE GALLERY PADS BY 24, THE APP BY 16. Every real caller
                   sits in a `Spacing.three` container and lets the rows bleed
                   out to the screen edge, exactly as the lineup board does;
                   bleeding 16 out of 24 here would leave them poking 8 points
                   into this page's trough and looking like a bug. */
                bleed={false}
              />
              {/* THE FRAME BEFORE THE ROWS ARRIVE, which is the state that
                  cannot be waited for and the one that was wrong. A settled
                  lineup is a separate read from everything else on the compete
                  screen, so there is always a moment with nothing to draw —
                  and drawing nothing took the board to zero height and sprang
                  it back to eight rows, which on the carousel is the page
                  bouncing every time you swipe onto a finished contest. The
                  reservation is the contest's own slot count, so it is exact:
                  the block below is the same height as the block above it, and
                  the real rows land without moving anything. Silent rather
                  than shimmering — a pulse is an animation the eye tracks, and
                  a worse thing to put in front of somebody for 150ms than a
                  quiet gap. */}
              <EntryLineup
                slots={[]}
                loading
                placeholder={KIT_ENTRY_SLOTS.length}
                bleed={false}
              />
            </View>
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
            note="The grid cell in every state multi-select can put it in. The first is AT REST and carries no marks at all — the same card, out of the mode. IN SET means a copy of that PLAYER is already committed; this copy is still yours and still sellable, which is why it is the positive tone rather than a grey-out. STARTING is the one refusal: the copy is in a lineup you have not played, so it can be neither sold nor burnt into a set — it takes the tick's place rather than sitting beside it, because a circle you cannot press is a cell contradicting itself. All of them appear only while you are choosing, because that is the only time any of it is news.">
            <View style={styles.row}>
              {[
                { label: 'at rest', card: OWNED_CARDS[1], selecting: false, selected: false, blocked: false },
                { label: 'pickable', card: OWNED_CARDS[0], selecting: true, selected: false, blocked: false },
                { label: 'pickable, in a set', card: OWNED_CARDS[1], selecting: true, selected: false, blocked: false },
                { label: 'picked', card: OWNED_CARDS[0], selecting: true, selected: true, blocked: false },
                { label: 'picked, in a set', card: OWNED_CARDS[1], selecting: true, selected: true, blocked: false },
                { label: 'starting', card: OWNED_CARDS[0], selecting: true, selected: false, blocked: true },
              ].map((s2, i) => (
                <View key={i} style={styles.iconCell}>
                  <InventoryCard
                    card={s2.card}
                    width={106}
                    selecting={s2.selecting}
                    selected={s2.selected}
                    blocked={s2.blocked}
                  />
                  <Text style={[Type.micro, { color: c.textTertiary }]}>
                    {s2.label.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          <Section
            title="Roster bar and the cut"
            note="Three volumes and a line. Under the warning mark the bar just prints the count; near the cap it counts the slots left; over it, it says outright what to do — the one state where a remedy beats a fact. The dashed line is the same news drawn across the GRID: it sits after the thirtieth row in whatever order the cards are in, so everything below it is over the limit. It appears only over the cap, and never under a filter, where the thirtieth card on screen is not the thirtieth card you hold.">
            <Panel>
              <View style={styles.summaryPad}>
                <RosterBar roster={{ held: 14, cap: 30, warnAt: 24, overBy: 0, isOver: false, isNear: false, remaining: 16 }} />
                <RosterBar roster={{ held: 28, cap: 30, warnAt: 24, overBy: 0, isOver: false, isNear: true, remaining: 2 }} />
                <RosterBar roster={{ held: 36, cap: 30, warnAt: 24, overBy: 6, isOver: true, isNear: false, remaining: 0 }} />
                <RosterCut cap={30} />
              </View>
            </Panel>
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
              /* The refused tap, shown so the amber line is reachable here
                 without a lineup behind the page. See `BulkBar.notice`. */
              notice="Drew Allar cannot be selected — that copy is in a lineup you have not played yet. Bench it first to sell it or add it to a set."
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

/**
 * The pull page, in the gallery.
 *
 * A COMPONENT rather than markup inside `Kit`, because the page's reveal state
 * is a hook and the sweep plan is derived from it — the two things the bar
 * exists to draw. Faking them with a `useState` in the gallery would prove the
 * bar renders and nothing about whether it renders the right thing.
 *
 * The writes are the caller's, and they are the same lies the shelf fixture
 * tells: a fixed price, and a card marked unheld afterwards.
 *
 * KEEPING IS HELD HERE, not threaded down from `Kit`, because unlike the two
 * exits it is not a write and there is nothing for the caller to fake — it is
 * exactly the client-side flag the real page holds, so the gallery exercises
 * the real thing.
 */
function KitPull({
  actions,
  disposed,
  onClose,
  onSell,
  onCommit,
}: {
  actions: Map<string, CardActions>;
  disposed: Map<string, Disposition>;
  onClose: () => void;
  onSell: (id: string) => void;
  onCommit: (id: string, code: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const reveal = useReveal(PULLED_FIXTURE);
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const toggleKeep = (id: string) =>
    setKept((held) => {
      const next = new Set(held);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const plan = planSweep(PULLED_FIXTURE, actions, disposed, kept);
  let earned = 0;
  for (const d of disposed.values()) earned += d.gems;

  return (
    <View style={[styles.kitPullFill, { backgroundColor: c.background }]}>
      <View style={styles.kitPullRail}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the pull"
          style={({ pressed }) => [
            styles.kitPullClose,
            { backgroundColor: c.backgroundElement },
            pressed && { opacity: 0.6 },
          ]}>
          <Text style={[Type.section, { color: c.textSecondary }]}>×</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.kitPullFill}
        contentContainerStyle={styles.kitPullStage}
        showsVerticalScrollIndicator={false}>
        <PullDeck
          pulled={PULLED_FIXTURE}
          silverAt={200}
          reveal={reveal}
          actions={actions}
          loadingActions={false}
          disposed={disposed}
          kept={kept}
          busy={null}
          frozen={false}
          error={null}
          onDismissError={() => {}}
          onSell={onSell}
          onCommit={onCommit}
          onToggleKeep={toggleKeep}
          cardHeightCap={320}
        />
      </ScrollView>
      <PullBar
        total={PULLED_FIXTURE.length}
        hidden={reveal.hidden}
        cascading={reveal.cascading}
        plan={plan}
        planning={false}
        sweep={null}
        busy={false}
        earned={earned}
        onRevealNext={reveal.revealNext}
        onRevealAll={reveal.revealAll}
        /* Inert: the sweeps are two RPC volleys and there is no session behind
           this page. The buttons and their confirms are the thing on show. */
        onCommitAll={() => {}}
        onSellAll={() => {}}
        onAgain={onClose}
        onInventory={onClose}
      />
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

/**
 * An entered card, assembled the way the board assembles one.
 *
 * IT EXISTS SO THE GALLERY CANNOT DRIFT FROM THE BOARD. Every card in this
 * section used to spell out its own `state` and `middle` by hand, which meant
 * eight chances to demonstrate a card the app does not actually draw — and the
 * gallery is the surface these states are reviewed on, so a wrong one here is
 * worse than no example. It maps a fixture to an `Entry` exactly as `Card` in
 * `ContestCarousel` maps a `MyContest` to one — which is now the whole of what
 * either caller does, since the card owns all three of its bands.
 */
function KitEntered({
  name,
  terms,
  myPoints,
  field,
  cut = null,
  opponent = null,
  lock,
  prize = null,
  settled = null,
  level = 'sheet',
}: {
  name: string;
  terms: ContestTerms;
  myPoints: number | null;
  field: FieldWeek;
  cut?: number | null;
  /** A head-to-head opponent. Only the kit builds one — see `opponentOf`. */
  opponent?: Duel | null;
  lock: Lock;
  prize?: number | null;
  settled?: Settlement | null;
  level?: CardLevel;
}) {
  return (
    <ContestCard
      name={name}
      terms={terms}
      prize={prize}
      settled={settled}
      level={level}
      lock={lock}
      entry={{ myPoints, projected: null, field, cut, opponent }}
    />
  );
}

const styles = StyleSheet.create({
  kitPullFill: { flex: 1 },
  kitPullRail: { paddingHorizontal: Spacing.three, paddingTop: Spacing.five, paddingBottom: Spacing.two },
  kitPullClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kitPullStage: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.two },
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
