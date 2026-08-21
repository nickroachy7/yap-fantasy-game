/**
 * Dev-only SHELL gallery: the navigation chrome at whatever width the window
 * is, with fixture content standing in for each screen.
 *
 * Why this exists. Every product screen is behind the auth gate and fetches
 * from Supabase directly, so the only way to look at the web layout was to sign
 * in and drive the real app — which makes a design iteration a manual round
 * trip and puts the layout out of reach entirely for anyone without a session.
 * This renders the REAL <Sidebar> and <Screen> in the same arrangement as
 * `(app)/_layout.tsx`, so what you see here is the actual chrome, not a mock of
 * it. Only the content inside the frame is fixture data.
 *
 * It renders at the live window width on purpose rather than drawing several
 * widths side by side: `useIsWide` reads `useWindowDimensions`, so a faked
 * width would exercise a different code path than the one that ships. Resize
 * the window to cross the 900px breakpoint.
 *
 * Like `/preview` this sits outside the auth gate and is inert outside
 * development — `expo export` emits every route it finds.
 */
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  CARD_PROFILE_NEVER_STARTED,
  CARD_PROFILE_SAMPLE,
  MARKET_SAMPLE,
  MARKET_UNPLAYED,
  MCCAFFREY_GAME_LOG,
  MCCAFFREY_PROFILE,
  USAGE_SAMPLE,
} from '@/components/dev/profile-fixture';
import { OWNED_MANY, SETS_FIXTURE, SET_MEMBERS_FIXTURE } from '@/components/dev/fixtures';
import { SetActions,
  SetChecklist, type SetFilter } from '@/components/collection/SetChecklist';
import { SetsFilters, SetsList, SetsStrip } from '@/components/collection/SetsList';
import {
  autofillSelection,
  filterSets,
  remainingOf,
  summariseSets,
  type SetListFilter,
} from '@/components/collection/sets';
import { PlayerHero } from '@/components/players/PlayerHero';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { CardStanding } from '@/components/players/CardStanding';
import { GameLogTab } from '@/components/players/GameLogTab';
import { startKey } from '@/components/players/GameLog';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { StartLog } from '@/components/players/StartLog';
import { parseCardProfile } from '@/components/players/card-profile';
import { parseMarket } from '@/components/players/market';
import { parseGameLog } from '@/components/players/game-log';
import { TeamContext } from '@/components/players/TeamContext';
import { UsagePanel } from '@/components/players/UsagePanel';
import { parseProfile } from '@/components/players/profile';
import { ScoreStrip } from '@/components/scores/ScoreStrip';
import type { ScoreGame, ScoreTeam } from '@/components/scores/scoreboard';
import { BoardRow } from '@/components/leaderboard/BoardRow';
import { Podium } from '@/components/leaderboard/Podium';
import { YourRow } from '@/components/leaderboard/YourRow';
import { standingRows } from '@/components/leaderboard/PointsBoard';
import type { Standing } from '@/components/leaderboard/board';
import {
  BOARD_META,
  buildBoard,
  withTopTier,
  type BoardId,
  type CommunityBoardId,
  type CommunityData,
} from '@/components/leaderboard/community';
import { Panel } from '@/components/ui/Panel';
import { BoardControls } from '@/components/leaderboard/BoardControls';
import { MenuButton, MenuHeading, MenuItem } from '@/components/ui/MenuButton';
import { Tabs } from '@/components/ui/Tabs';
import { Screen } from '@/components/shell/Screen';
import { SegmentedControl, type Segment } from '@/components/shell/SegmentedControl';
import { AppHeader } from '@/components/shell/AppHeader';
import { FantasyTopNav } from '@/components/shell/FantasyTopNav';
import { FrameProvider } from '@/components/shell/frame';
import { Sidebar } from '@/components/shell/Sidebar';
import { WIDE_BREAKPOINT, useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, Type, type CardTier, type Measure } from '@/constants/theme';
import { PlayerContext, type PlayerState } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const FIXTURE_PLAYER: PlayerState = {
  gems: 1240,
  displayName: 'nickroachy',
  cardCount: 14,
  loading: false,
  error: null,
  refresh: async () => {},
};

/**
 * A week of fixtures for the score band, in every state it draws: one final,
 * one live, one still to kick off. Enough of them that the band scrolls and the
 * web build's paging arrows have something to page.
 */
const GALLERY_TEAMS: Record<string, ScoreTeam> = Object.fromEntries(
  ['BUF', 'MIA', 'KC', 'LV', 'SF', 'SEA', 'DAL', 'PHI', 'GB', 'CHI', 'CIN', 'BAL'].map((a) => [
    a,
    { id: a, abbreviation: a, name: a },
  ]),
);

const GALLERY_GAMES: ScoreGame[] = [
  ['MIA', 'BUF', 17, 24, 'final'],
  ['LV', 'KC', 10, 31, 'final'],
  ['SEA', 'SF', 14, 13, 'live'],
  ['PHI', 'DAL', null, null, 'scheduled'],
  ['CHI', 'GB', null, null, 'scheduled'],
  ['BAL', 'CIN', null, null, 'scheduled'],
].map(([away, home, awayScore, homeScore, status], i) => ({
  id: `g${i}`,
  season: 2026,
  seasonType: 1,
  week: 3,
  home: GALLERY_TEAMS[home as string],
  away: GALLERY_TEAMS[away as string],
  homeScore: homeScore as number | null,
  awayScore: awayScore as number | null,
  startsAt: `2026-08-2${1 + Math.floor(i / 3)}T17:0${i}:00Z`,
  status: status as ScoreGame['status'],
  statusText: status === 'final' ? 'Final' : null,
}));

/** Two of yours in the opener, one in the live game — the band's own mark. */
const GALLERY_STARTERS_BY_TEAM = new Map([
  ['BUF', 2],
  ['SF', 1],
]);

type View_ = 'inventory' | 'sets' | 'checklist' | 'leaderboard' | 'lineup' | 'profile';
const VIEWS: Segment<View_>[] = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'sets', label: 'Sets' },
  { value: 'checklist', label: 'Set' },
  { value: 'leaderboard', label: 'Board' },
  { value: 'lineup', label: 'Lineup' },
  { value: 'profile', label: 'Profile' },
];

/** Each view previews the measure its real screen asks for, not a single one. */
const VIEW_MEASURE: Record<View_, Measure> = {
  inventory: 'grid',
  sets: 'table',
  checklist: 'form',
  leaderboard: 'table',
  lineup: 'form',
  profile: 'table',
};
const VIEW_TITLE: Record<View_, string> = {
  inventory: 'Inventory',
  sets: 'Sets',
  checklist: 'Jacksonville Jaguars',
  leaderboard: 'Leaderboard',
  lineup: 'Lineup',
  profile: 'Christian McCaffrey',
};

/** Drives the rail's active/nested state, which is otherwise unreachable here. */
const VIEW_PATH: Record<View_, string> = {
  inventory: '/fantasy/collection',
  sets: '/fantasy/sets',
  checklist: '/fantasy/sets',
  leaderboard: '/fantasy/leaderboard',
  lineup: '/fantasy/lineup',
  profile: '/players',
};

/* ---- fixture content ---------------------------------------------------- */

const GAP = Spacing.two + 4;
const MIN_CARD_WIDTH = 100;

/**
 * Measures its own box, exactly as inventory.tsx does.
 *
 * An earlier version restated the frame's arithmetic here instead — and within
 * one change of the frame it was already reporting a different column count
 * than the product renders. A gallery that lies about the layout is worse than
 * no gallery, so it measures.
 */
/**
 * Every state a set row can be in, at once — see `SETS_FIXTURE`. The claim
 * button is live but inert: this gallery has no session and no wallet, so the
 * press is here to prove the control is reachable and correctly sized, not to
 * pay anything.
 */
function SetsFixture() {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [filter, setFilter] = useState<SetListFilter>('ALL');
  const shown = filterSets(SETS_FIXTURE, filter);

  return (
    <View style={styles.profile}>
      {/* The strip and the chips are `SetsPanel`'s rather than the list's —
          both are pinned above the scroll on the real screen, at the same
          height the inventory pins its own pair. Drawn here so the gallery
          shows the whole page and not just the rows under it, and so the
          filters' own states are reachable without a session. */}
      <SetsStrip stats={summariseSets(SETS_FIXTURE)} />
      <SetsFilters sets={SETS_FIXTURE} filter={filter} onFilter={setFilter} />
      <SetsList
        sets={shown}
        claimingCode={claiming}
        onOpenSet={() => undefined}
        onClaim={(set) => setClaiming((held) => (held === set.code ? null : set.code))}
      />
    </View>
  );
}

/**
 * The checklist sheet's CONTENT, drawn on the page rather than in the sheet.
 * The frame itself is already exercised by the profile view above; what needs
 * looking at here is the hero, the ladder, and the three states a member row
 * can be in — in the set, tickable, missing.
 *
 * The SELECTION IS REAL here, which is the point: autofill seeds it from the
 * same rules the product uses and every row toggles, so the editing flow can be
 * driven without a session. Only the submission is inert.
 */
function ChecklistFixture() {
  const [claiming, setClaiming] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  /* The route holds this so the sheet's bar and the row in the list can be the
     same control; on the page there is no bar, and it is simply state. */
  const [filter, setFilter] = useState<SetFilter>('ALL');
  const set = SETS_FIXTURE.find((s) => s.code === 'team-jax-2026') ?? null;

    /* CLIPPED, which the sheet does for free and a page does not. The tone
       band reaches well above its own top so a bounce at the top of the sheet
       reveals more band rather than the fill behind it; the sheet's scroll view
       clips that away at rest, and on a page it would paint straight up over
       the strip above. The negative margins put the clip box on the page edges,
       so the band still bleeds sideways the way it does in the product. */
  return (
    <View style={styles.checklist}>
      <SetChecklist
        set={set}
        members={SET_MEMBERS_FIXTURE}
        claiming={claiming}
        claimError={null}
        selected={selected}
        submitting={false}
        filter={filter}
        onFilter={setFilter}
        onClaim={() => setClaiming((v) => !v)}
        /* Inert, like the submission: the quick add's whole point is the
           confirmation behind it, and the gallery has no session to commit
           against. Ticking a card is the part worth being able to look at. */
        onQuickAdd={() => {}}
        onToggle={(m) =>
          setSelected((held) =>
            held.includes(m.card_id)
              ? held.filter((id) => id !== m.card_id)
              : [...held, m.card_id],
          )
        }
      />

      {/* THE SHEET'S PINNED BAR, drawn here in flow. On the route this is the
          frame's `footer` — below the scroll and above the home indicator — and
          the gallery has no sheet to pin it to, so it sits at the foot of the
          fixture instead. What is being reviewed here is the bar's two states,
          which is the part the frame does not decide. */}
      <SetActions
        set={set}
        members={SET_MEMBERS_FIXTURE}
        selected={selected}
        submitting={false}
        onAutofill={() =>
          setSelected(autofillSelection(SET_MEMBERS_FIXTURE, set ? remainingOf(set) : 0))
        }
        onClear={() => setSelected([])}
        // Inert: there is no session behind this page, and the confirmation it
        // would raise belongs to the route.
        onSubmit={() => undefined}
      />
    </View>
  );
}

function InventoryFixture() {
  const [w, setW] = useState(0);
  /* No gutter subtraction here, unlike inventory.tsx. This sits inside
   * Screen's SCROLLING container, which already applies the gutter as padding,
   * so the measured box is the usable width. inventory.tsx measures inside
   * `scroll={false}`, whose box is unpadded because the FlatList applies the
   * gutter itself — so there it must subtract. Subtracting in both places
   * double-counted here and drew 95pt cards where the product draws 106. */
  const contentWidth = w;
  const columns = Math.max(3, Math.min(7, Math.floor((contentWidth + GAP) / (MIN_CARD_WIDTH + GAP))));
  const itemWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w === 0 ? null : (
        <View style={styles.grid}>
          {OWNED_MANY.map((card) => (
            <InventoryCard
              key={card.id}
              card={card}
              width={itemWidth}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The five community boards, drawn by the REAL table.
 *
 * This fixture used to be a hand-rolled row list — a rank, a name and a number
 * in styles that existed only here. That contradicted the gallery's whole
 * premise: the point is to look at the components that ship, and a mock of a
 * table tells you nothing about the table. It also could not answer the
 * questions these boards actually raise — whether the tier column survives at
 * 52pt, whether a two-line card row stays legible next to a one-line manager
 * row, whether the widest display name in the fixture pushes the numbers off a
 * phone.
 *
 * `MEID` is nickroachy's row on every board, so the "you" tint and the YOU word
 * are visible here rather than only for whoever is signed in.
 */
const MEID = 'fixture-me';

/* The mark each manager's row wears — their best held card. Real boards read it
   from `board_top_tiers`; here it is fixed so all four tiers are on screen. */
const SCOPE_FIXTURE = [
  { value: 'season', label: 'Season' },
  { value: '3', label: 'Pre 3' },
  { value: '2', label: 'Pre 2' },
  { value: '1', label: 'Pre 1' },
];

const FIXTURE_TIERS = new Map<string, CardTier>([
  ['u2', 'diamond'],
  [MEID, 'gold'],
  ['u3', 'silver'],
  ['u4', 'bronze'],
  ['u5', 'bronze'],
]);

const BOARD_FIXTURES: Record<CommunityBoardId, CommunityData> = {
  week: {
    id: 'week',
    rows: [
      { rank: 1, user_id: 'u2', display_name: 'dmb', week: 2, points: 148.2, weeks_played: 3 },
      { rank: 2, user_id: MEID, display_name: 'nickroachy', week: 3, points: 141.7, weeks_played: 3 },
      { rank: 3, user_id: 'u3', display_name: 'a_very_long_display_name', week: 1, points: 139.0, weeks_played: 3 },
      { rank: 4, user_id: 'u4', display_name: 'kp', week: 3, points: 122.4, weeks_played: 2 },
      { rank: 5, user_id: 'u5', display_name: 'sarah', week: 2, points: 96.5, weeks_played: 3 },
    ],
  },
  record: {
    id: 'record',
    rows: [
      { rank: 1, user_id: 'u2', display_name: 'dmb', wins: 3, losses: 0, ties: 0, weeks: 3, win_pct: 1, points: 298.1 },
      { rank: 2, user_id: MEID, display_name: 'nickroachy', wins: 2, losses: 0, ties: 1, weeks: 3, win_pct: 0.833, points: 312.4 },
      { rank: 3, user_id: 'u5', display_name: 'sarah', wins: 1, losses: 1, ties: 1, weeks: 3, win_pct: 0.5, points: 233.9 },
      { rank: 4, user_id: 'u3', display_name: 'a_very_long_display_name', wins: 1, losses: 2, ties: 0, weeks: 3, win_pct: 0.333, points: 271.8 },
      { rank: 5, user_id: 'u4', display_name: 'kp', wins: 0, losses: 2, ties: 0, weeks: 2, win_pct: 0, points: 245 },
    ],
  },
  collection: {
    id: 'collection',
    rows: [
      { rank: 1, user_id: 'u2', display_name: 'dmb', value_gems: 1864, held: 61, players: 54, gold_plus: 9, diamond: 1, career_fp: 1240.5 },
      { rank: 2, user_id: MEID, display_name: 'nickroachy', value_gems: 1208, held: 74, players: 66, gold_plus: 5, diamond: 0, career_fp: 980.2 },
      { rank: 3, user_id: 'u3', display_name: 'a_very_long_display_name', value_gems: 742, held: 38, players: 35, gold_plus: 3, diamond: 0, career_fp: 610 },
      { rank: 4, user_id: 'u5', display_name: 'sarah', value_gems: 416, held: 29, players: 27, gold_plus: 1, diamond: 0, career_fp: 305.4 },
      // A shelf that has never been started: FP is an em dash, not a zero.
      { rank: 5, user_id: 'u4', display_name: 'kp', value_gems: 96, held: 12, players: 12, gold_plus: 0, diamond: 0, career_fp: 0 },
    ],
  },
  cards: {
    id: 'cards',
    rows: [
      { rank: 1, card_instance_id: 'c1', user_id: 'u2', display_name: 'dmb', player_id: 'p1', player_name: 'Josh Allen', position_abbreviation: 'QB', team_abbreviation: 'BUF', tier: 'diamond', career_fp: 2612.4, lineup_starts: 31, fp_per_start: 84.3 },
      { rank: 2, card_instance_id: 'c2', user_id: MEID, display_name: 'nickroachy', player_id: 'p2', player_name: 'Christian McCaffrey', position_abbreviation: 'RB', team_abbreviation: 'SF', tier: 'gold', career_fp: 1188, lineup_starts: 14, fp_per_start: 84.9 },
      { rank: 3, card_instance_id: 'c3', user_id: 'u5', display_name: 'sarah', player_id: 'p3', player_name: "Ja'Marr Chase", position_abbreviation: 'WR', team_abbreviation: 'CIN', tier: 'gold', career_fp: 902.5, lineup_starts: 12, fp_per_start: 75.2 },
      { rank: 4, card_instance_id: 'c4', user_id: MEID, display_name: 'nickroachy', player_id: 'p4', player_name: 'Travis Kelce', position_abbreviation: 'TE', team_abbreviation: 'KC', tier: 'silver', career_fp: 411.8, lineup_starts: 9, fp_per_start: 45.8 },
      { rank: 5, card_instance_id: 'c5', user_id: 'u4', display_name: 'kp', player_id: 'p5', player_name: 'Harrison Butker', position_abbreviation: 'PK', team_abbreviation: 'KC', tier: 'bronze', career_fp: 96, lineup_starts: 8, fp_per_start: 12 },
    ],
  },
  sets: {
    id: 'sets',
    rows: [
      { rank: 1, user_id: MEID, display_name: 'nickroachy', rungs: 13, sets: 4, completed: 3, dailies: 11, burned: 42, gems: 790 },
      { rank: 2, user_id: 'u2', display_name: 'dmb', rungs: 9, sets: 3, completed: 1, dailies: 24, burned: 31, gems: 1240 },
      { rank: 3, user_id: 'u5', display_name: 'sarah', rungs: 4, sets: 2, completed: 0, dailies: 6, burned: 14, gems: 300 },
      { rank: 4, user_id: 'u3', display_name: 'a_very_long_display_name', rungs: 2, sets: 1, completed: 0, dailies: 3, burned: 8, gems: 150 },
      // Cards burnt, no rung reached yet — the row the union in board_sets exists for.
      { rank: 5, user_id: 'u4', display_name: 'kp', rungs: 0, sets: 0, completed: 0, dailies: 1, burned: 3, gems: 40 },
    ],
  },
};

/**
 * The points board's own rows, which no other fixture exercises.
 *
 * It is the board the screen opens on and the only one carrying a MOVEMENT
 * mark, so a fixture set that stopped at the five community boards left the
 * default view unchecked. All four movement states are here — up, down, held
 * and new — because they are four different glyphs and the one that is easy to
 * get wrong is `NEW`, which must not read as a rise of zero.
 */
const POINTS_FIXTURE: Standing[] = [
  { userId: 'u2', name: 'dmb', rank: 1, points: 312.4, weeksPlayed: 3, seasonRank: 1, avg: 104.1, best: { week: 2, points: 148.2, rank: 1 }, movement: 2, weekly: [] },
  { userId: MEID, name: 'nickroachy', rank: 2, points: 298.1, weeksPlayed: 3, seasonRank: 2, avg: 99.4, best: { week: 3, points: 141.7, rank: 2 }, movement: -1, weekly: [] },
  { userId: 'u3', name: 'a_very_long_display_name', rank: 3, points: 271.8, weeksPlayed: 3, seasonRank: 3, avg: 90.6, best: { week: 1, points: 139, rank: 3 }, movement: 0, weekly: [] },
  { userId: 'u4', name: 'kp', rank: 4, points: 245, weeksPlayed: 2, seasonRank: 4, avg: 122.5, best: { week: 3, points: 122.4, rank: 4 }, movement: null, weekly: [] },
  // Nothing scored yet: the derived columns are dashes, not zeroes.
  { userId: 'u5', name: 'sarah', rank: 5, points: 0, weeksPlayed: 0, seasonRank: 5, avg: null, best: null, movement: null, weekly: [] },
];

function LeaderboardFixture() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [id, setId] = useState<BoardId>('cards');

  const points = id === 'points';
  const [scope, setScope] = useState('season');
  // One metadata table for all six boards now — no fixture copy to drift.
  const meta = BOARD_META[id];
  // Preseason, so the week board reads "Pre 3" rather than "Wk 3".
  const built = points
    ? withTopTier(standingRows(POINTS_FIXTURE, 'season', 1, true), FIXTURE_TIERS)
    : buildBoard(BOARD_FIXTURES[id], 1, { scheme, topTiers: FIXTURE_TIERS });

  return (
    <View style={styles.board}>
      {/* The product's own control row, not a harness one — the fixture is here
          to show what the screen looks like, and the pickers are part of that.
          Points gets a second chip, exactly as `PointsBoard` gives it one. */}
      <View style={styles.boardControls}>
        <BoardControls board={id} onBoardChange={setId}>
          {points ? (
            <MenuButton
              text={scope === 'season' ? 'SZN' : `P${scope}`}
              label="Week"
              active={scope !== 'season'}>
              {(close) => (
                <>
                  <MenuHeading>Week</MenuHeading>
                  {SCOPE_FIXTURE.map((o) => (
                    <MenuItem
                      key={o.value}
                      label={o.label}
                      selected={o.value === scope}
                      onPress={() => {
                        setScope(o.value);
                        close();
                      }}
                    />
                  ))}
                </>
              )}
            </MenuButton>
          ) : null}
        </BoardControls>
      </View>
      <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>{meta.blurb}</Text>
      <Podium rows={built} meId={MEID} />

      {/* Pinned above the list on every real board. Drawn here so the fixture
          shows the whole board, not only its list. */}
      <YourRow
        row={built.find((r) => r.userId === MEID) ?? null}
        field={built.length}
        absent="You are not on this board yet."
        unit={meta.unit}
        title={id === 'cards' ? 'Your best card' : 'Where you stand'}
      />

      <Panel title="Standings" hint={`${built.length} ranked`} />

      {/* Bled past the gallery Screen's own 16pt padding, because the real
          boards bleed past the list's — otherwise this fixture would show a
          narrower row than the product draws. */}
      <View style={styles.boardRows}>
        {built.map((row) => (
          <BoardRow key={row.key} row={row} isMe={row.userId === MEID} unit={meta.unit} />
        ))}
      </View>
    </View>
  );
}

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'PK'];

function LineupFixture() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.rows}>
      {SLOTS.map((slot, i) => (
        <View key={`${slot}-${i}`} style={[styles.row, { borderColor: c.backgroundElement }]}>
          <Text style={[styles.slot, { color: c.textSecondary }]}>{slot}</Text>
          <Text numberOfLines={1} style={[styles.rowName, { color: c.text }]}>
            {OWNED_MANY[i]?.playerName ?? 'Empty'}
          </Text>
          <Text style={[styles.rowMeta, { color: c.textSecondary }]}>
            {OWNED_MANY[i]?.team ?? '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The profile sections against a REAL captured payload, including its awkward
 * parts: a season the provider never reported, and no usage data at all. Both
 * populated and empty usage are shown, because the empty one is what every
 * starter looks like until the regular season begins.
 */
function ProfileFixture() {
  const [pt, setPt] = useState<'overview' | 'card' | 'log'>('overview');
  const [sheet, setSheet] = useState(false);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const profile = parseProfile(MCCAFFREY_PROFILE);
  if (!profile) return null;

  const withUsage = parseProfile({
    ...(MCCAFFREY_PROFILE as object),
    usage: USAGE_SAMPLE,
  } as typeof MCCAFFREY_PROFILE);

  return (
    <View style={styles.profile}>
      {/* The real sheet, with the real frame. Both profiles are presented in it
          and nothing else in the app is, so its scroll-reveal title — absent
          while the hero is on screen, faded in once the hero has gone under the
          header — had no other surface it could be looked at on. */}
      <Pressable
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel="Open the profile sheet"
        style={({ pressed }: { pressed: boolean }) => [
          styles.sheetButton,
          pressed && styles.pressed,
        ]}>
        <Text style={[Type.strong, { color: c.text }]}>Open the profile sheet →</Text>
      </Pressable>

      {sheet ? (
        <PlayerSheetFrame
          title={profile.player.name}
          subtitle="SF · RB · LEGENDARY"
          onClose={() => setSheet(false)}>
          <PlayerHero
            name={profile.player.name}
            bio={profile.player}
            team={profile.player.teamAbbreviation}
            position={profile.player.positionAbbreviation}
            injuryStatus={profile.player.injuryStatus}
          />
          <GameLogTab profile={profile} sections={parseGameLog(MCCAFFREY_GAME_LOG)} />
        </PlayerSheetFrame>
      ) : null}

      {/* The shared hero, exactly as BOTH profiles draw it. */}
      <PlayerHero
        name={profile.player.name}
        bio={profile.player}
        team={profile.player.teamAbbreviation}
        position={profile.player.positionAbbreviation}
        injuryStatus={profile.player.injuryStatus}
      />

      {/* Mirrors the real screens' tab split — same three, same order on both —
          so the primitive is seen in the arrangement it actually ships in. */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'card', label: 'Card', hint: '2' },
          { value: 'log', label: 'Game log', hint: '3' },
        ]}
        value={pt}
        onChange={setPt}
      />

      <Panel title="All sections" hint="gallery shows every tab at once">
        <View style={{ height: 0 }} />
      </Panel>

      {/* ---- Overview ---------------------------------------------------- */}
      <UsagePanel
        usage={withUsage?.usage ?? null}
        position={profile.player.positionAbbreviation}
        teamAbbreviation={profile.player.teamAbbreviation}
      />
      {/* Empty usage too: it is what every starter looks like until the
          regular season begins. */}
      <UsagePanel
        usage={profile.usage}
        position={profile.player.positionAbbreviation}
        teamAbbreviation={profile.player.teamAbbreviation}
      />
      <TeamContext bio={profile.player} standings={profile.standings} />

      {/* ---- Game log: career folded in, season summary above per-game ---- */}
      <GameLogTab profile={profile} sections={parseGameLog(MCCAFFREY_GAME_LOG)} />

      {/* The CARD profile's variant of the same tab: every week marked with
          whether this copy was started. The player profile passes nothing and
          the column disappears, so both states need looking at. */}
      <GameLogTab
        profile={profile}
        sections={parseGameLog(MCCAFFREY_GAME_LOG)}
        startedWeeks={
          new Set(
            (parseCardProfile(CARD_PROFILE_SAMPLE)?.starts ?? []).map((st) =>
              startKey(st.season, st.seasonType, st.week),
            ),
          )
        }
      />

      {/* ---- Card: both states of each, because the interesting one is the
           empty one. A market nobody has played and a card never started are
           what the whole beta looks like for a month. ---------------------- */}
      <CommunityPanel market={parseMarket(MARKET_SAMPLE)} />
      <CommunityPanel market={parseMarket(MARKET_UNPLAYED)} />

      <CardFixture payload={CARD_PROFILE_SAMPLE} />
      <CardFixture payload={CARD_PROFILE_NEVER_STARTED} />
    </View>
  );
}

/** The card profile's own panels, which the player profile never draws. */
function CardFixture({ payload }: { payload: typeof CARD_PROFILE_SAMPLE }) {
  const card = parseCardProfile(payload);
  if (!card) return null;
  return (
    <>
      <CardStanding card={card.card} rank={card.rank} />
      <StartLog starts={card.starts} playerName={card.card.playerName} />
    </>
  );
}

/* ---- the gallery -------------------------------------------------------- */

export default function GalleryScreen() {
  // Inert outside development: this route is emitted into the static export.
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <PlayerContext.Provider value={FIXTURE_PLAYER}>
      <GalleryBody />
    </PlayerContext.Provider>
  );
}

function GalleryBody() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { width } = useWindowDimensions();
  const isWide = useIsWide();
  const [view, setView] = useState<View_>('inventory');

  const banner = useMemo(
    () =>
      `${Math.round(width)}px · ${isWide ? 'wide' : 'narrow'} (breakpoint ${WIDE_BREAKPOINT}) · rail ${
        isWide ? 'on' : 'off'
      } · measure ${VIEW_MEASURE[view]}`,
    [width, isWide, view],
  );

  return (
    <View style={[styles.shell, isWide && styles.shellWide, { backgroundColor: c.background }]}>
      {isWide ? <Sidebar pathnameOverride={VIEW_PATH[view]} /> : null}
      <View style={styles.content}>
        {/* The wide chrome, in the arrangement `(tabs)/_layout` builds it: the
            score band across the top of the content column, meeting the rail at
            the top-left corner. Reproduced here rather than by rendering
            `WebHeader` itself, which reads the network for the live week — the
            joint worth looking at is where the two fills meet, and a fixture
            week shows it without a session. */}
        {isWide ? (
          <ScoreStrip
            games={GALLERY_GAMES}
            week="Pre Wk 3"
            startersByTeam={GALLERY_STARTERS_BY_TEAM}
            loading={false}
            chrome
            alwaysShow
          />
        ) : null}
        {/* The narrow chrome, in the arrangement `FantasyFrame` builds it: the
            masthead, then the strip, then the page. Reproduced here rather than
            by rendering the frame itself because the frame reads the router and
            a gallery route matches no nav href — the override is how both this
            and the rail are made inspectable. `FrameProvider` is what stops
            `Screen` drawing a second masthead underneath this one.

            It is here because the gap between these two rows is a JOINT, owned
            by neither component, and a joint nobody can look at is a joint that
            drifts. */}
        {isWide ? null : (
          <>
            <AppHeader attached />
            <FantasyTopNav pathnameOverride={VIEW_PATH[view]} />
          </>
        )}
        <FrameProvider value={{ header: !isWide }}>
        <Screen
          title={VIEW_TITLE[view]}
          measure={VIEW_MEASURE[view]}
          context="Preseason · Week 3"
          /* What makes the FOLDED heading inspectable: on a real route the
             collection views draw as tabs under the word "Collection", and a
             gallery route matches no nav href. Same escape hatch the rail and
             the top nav already take. */
          pathnameOverride={VIEW_PATH[view]}
          /* The score band, in the slot the lineup screen puts it in. This is
             the whole reason it is a slot on the frame: it renders flush under
             the header on a phone and across the top of the page on the web,
             and neither placement is reachable from inside the content box.
             Only on the lineup view, which is the only screen that has one. */
          banner={
            /* The slot is narrow-only now — `Screen` simply does not render it
               on wide, since the window grew a permanent score band of its own
               (see above). No `isWide` guard here: this gallery exists to
               exercise the real component, and a caller working around a rule
               the component already enforces hides whether it still does. */
            view === 'lineup' ? (
              <ScoreStrip
                games={GALLERY_GAMES}
                week="Pre Wk 3"
                startersByTeam={GALLERY_STARTERS_BY_TEAM}
                loading={false}
              />
            ) : null
          }>
          {/* A live read-out of what the layout thinks it is. The single most
              useful thing to see while resizing: which branch is rendering. */}
          <Text style={[styles.banner, { color: c.textSecondary }]}>{banner}</Text>

          <SegmentedControl segments={VIEWS} value={view} onChange={setView} />

          {view === 'inventory' ? <InventoryFixture /> : null}
          {view === 'sets' ? <SetsFixture /> : null}
          {view === 'checklist' ? <ChecklistFixture /> : null}
          {view === 'leaderboard' ? <LeaderboardFixture /> : null}
          {view === 'lineup' ? <LineupFixture /> : null}
          {view === 'profile' ? <ProfileFixture /> : null}
        </Screen>
        </FrameProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  shellWide: { flexDirection: 'row' },
  content: { flex: 1 },
  banner: { fontSize: 11, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' },
  profile: { gap: Spacing.three },
  /** See the note where it is used. */
  checklist: {
    gap: Spacing.three,
    overflow: 'hidden',
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  sheetButton: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
  board: { gap: 14 },
  boardIntro: { gap: 2 },
  boardRows: { marginHorizontal: -Spacing.three },
  /* The control row draws its own gutter, as it does in the product. */
  boardControls: { marginHorizontal: -Spacing.three },
  rows: { gap: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 22, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  slot: { width: 34, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  rowPoints: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], width: 60, textAlign: 'right' },
});
