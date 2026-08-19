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
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
import { OWNED_MANY } from '@/components/dev/fixtures';
import { BioStrip } from '@/components/players/BioStrip';
import { CardStanding } from '@/components/players/CardStanding';
import { CareerTable } from '@/components/players/CareerTable';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { StartLog } from '@/components/players/StartLog';
import { parseCardProfile } from '@/components/players/card-profile';
import { parseMarket } from '@/components/players/market';
import { GameLog } from '@/components/players/GameLog';
import { parseGameLog } from '@/components/players/game-log';
import { TeamContext } from '@/components/players/TeamContext';
import { UsagePanel } from '@/components/players/UsagePanel';
import { parseProfile } from '@/components/players/profile';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { Screen } from '@/components/shell/Screen';
import { SegmentedControl, type Segment } from '@/components/shell/SegmentedControl';
import { Sidebar } from '@/components/shell/Sidebar';
import { WIDE_BREAKPOINT, useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, type Measure } from '@/constants/theme';
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

type View_ = 'inventory' | 'leaderboard' | 'lineup' | 'profile';
const VIEWS: Segment<View_>[] = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'leaderboard', label: 'Board' },
  { value: 'lineup', label: 'Lineup' },
  { value: 'profile', label: 'Profile' },
];

/** Each view previews the measure its real screen asks for, not a single one. */
const VIEW_MEASURE: Record<View_, Measure> = {
  inventory: 'grid',
  leaderboard: 'table',
  lineup: 'form',
  profile: 'table',
};
const VIEW_TITLE: Record<View_, string> = {
  inventory: 'Inventory',
  leaderboard: 'Leaderboard',
  lineup: 'Lineup',
  profile: 'Christian McCaffrey',
};

/** Drives the rail's active/nested state, which is otherwise unreachable here. */
const VIEW_PATH: Record<View_, string> = {
  inventory: '/collection/inventory',
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
            <InventoryCard key={card.id} card={card} width={itemWidth} />
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
  const [pt, setPt] = useState<'overview' | 'career' | 'log'>('overview');
  const profile = parseProfile(MCCAFFREY_PROFILE);
  if (!profile) return null;

  const withUsage = parseProfile({
    ...(MCCAFFREY_PROFILE as object),
    usage: USAGE_SAMPLE,
  } as typeof MCCAFFREY_PROFILE);

  return (
    <View style={styles.profile}>
      <BioStrip bio={profile.player} />

      {/* Mirrors the real screen's tab split so the primitive is seen in the
          arrangement it actually ships in, not in isolation. */}
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'career', label: 'Career' },
          { value: 'log', label: 'Game log', hint: '3' },
        ]}
        value={pt}
        onChange={setPt}
      />

      <Panel title="All sections" hint="gallery shows every tab at once">
        <View style={{ height: 0 }} />
      </Panel>

      <CareerTable career={profile.career} position={profile.player.positionAbbreviation} />
      <UsagePanel
        usage={withUsage?.usage ?? null}
        position={profile.player.positionAbbreviation}
        teamAbbreviation={profile.player.teamAbbreviation}
      />
      <UsagePanel
        usage={profile.usage}
        position={profile.player.positionAbbreviation}
        teamAbbreviation={profile.player.teamAbbreviation}
      />
      <TeamContext bio={profile.player} standings={profile.standings} />
      <GameLog
        sections={parseGameLog(MCCAFFREY_GAME_LOG)}
        position={profile.player.positionAbbreviation}
      />

      {/* ---- the two profiles' distinguishing panels --------------------- *
       * Both states of each, because the interesting one is the empty one.
       * A market where nobody has started a copy, and a card that has never
       * been started, are what the whole beta will look like for a month —
       * and they are the two the panels have to be honest about rather than
       * dressing up. */}
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
        <Screen title={VIEW_TITLE[view]} measure={VIEW_MEASURE[view]} context="Preseason · Week 3">
          {/* A live read-out of what the layout thinks it is. The single most
              useful thing to see while resizing: which branch is rendering. */}
          <Text style={[styles.banner, { color: c.textSecondary }]}>{banner}</Text>

          <SegmentedControl segments={VIEWS} value={view} onChange={setView} />

          {view === 'inventory' ? <InventoryFixture /> : null}
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
