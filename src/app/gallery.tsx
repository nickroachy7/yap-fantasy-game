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
import { OWNED_MANY, SAMPLE_MATCHUPS, SETS_FIXTURE, SET_MEMBERS_FIXTURE } from '@/components/dev/fixtures';
import { SetChecklist } from '@/components/collection/SetChecklist';
import { SetsList } from '@/components/collection/SetsList';
import { autofillSelection, remainingOf } from '@/components/collection/sets';
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
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { Screen } from '@/components/shell/Screen';
import { SegmentedControl, type Segment } from '@/components/shell/SegmentedControl';
import { Sidebar } from '@/components/shell/Sidebar';
import { WIDE_BREAKPOINT, useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, Type, type Measure } from '@/constants/theme';
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
  inventory: '/collection/inventory',
  sets: '/collection/sets',
  checklist: '/collection/sets',
  leaderboard: '/leaderboard',
  lineup: '/lineup',
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

  return (
    <View style={styles.profile}>
      <SetsList
        sets={SETS_FIXTURE}
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
  const set = SETS_FIXTURE.find((s) => s.code === 'team-jax-2026') ?? null;

  return (
    <View style={styles.profile}>
      <SetChecklist
        set={set}
        members={SET_MEMBERS_FIXTURE}
        claiming={claiming}
        claimError={null}
        selected={selected}
        submitting={false}
        onClaim={() => setClaiming((v) => !v)}
        onToggle={(m) =>
          setSelected((held) =>
            held.includes(m.card_id)
              ? held.filter((id) => id !== m.card_id)
              : [...held, m.card_id],
          )
        }
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
              /* Handed in separately, exactly as the inventory screen does. */
              matchup={card.team ? SAMPLE_MATCHUPS[card.team] : undefined}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const BOARD = [
  { rank: 1, name: 'nickroachy', points: 312.4, weeks: 3 },
  { rank: 2, name: 'dmb', points: 298.1, weeks: 3 },
  { rank: 3, name: 'a_very_long_display_name', points: 271.8, weeks: 3 },
  { rank: 4, name: 'kp', points: 245.0, weeks: 2 },
  { rank: 5, name: 'sarah', points: 233.9, weeks: 3 },
];

function LeaderboardFixture() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.rows}>
      {BOARD.map((r) => (
        <View key={r.rank} style={[styles.row, { borderColor: c.backgroundElement }]}>
          <Text style={[styles.rank, { color: c.textSecondary }]}>{r.rank}</Text>
          <Text numberOfLines={1} style={[styles.rowName, { color: c.text }]}>
            {r.name}
          </Text>
          <Text style={[styles.rowMeta, { color: c.textSecondary }]}>{r.weeks} wks</Text>
          <Text style={[styles.rowPoints, { color: c.text }]}>{r.points.toFixed(1)}</Text>
        </View>
      ))}
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
        <Screen
          title={VIEW_TITLE[view]}
          measure={VIEW_MEASURE[view]}
          context="Preseason · Week 3"
          /* The score band, in the slot the lineup screen puts it in. This is
             the whole reason it is a slot on the frame: it renders flush under
             the header on a phone and across the top of the page on the web,
             and neither placement is reachable from inside the content box.
             Only on the lineup view, which is the only screen that has one. */
          banner={
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
  sheetButton: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
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
