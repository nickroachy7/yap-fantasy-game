/**
 * One row of the player directory table.
 *
 * Fixed height on purpose: it lets the FlatList supply `getItemLayout`, which
 * is what keeps scrolling ~1,000 rows smooth on a phone. 34pt puts roughly
 * fifteen players on screen at once, which is the number that lets you compare
 * a position group without scrolling — the whole reason to open this screen.
 *
 * No photo, no logo, no jersey — we hold no licence for any of them. The club
 * is its three-letter abbreviation as text and the position is a glyph.
 *
 * Column geometry is exported rather than private because the header row in
 * PlayersPanel has to line up with it to the pixel, and the only way that stays
 * true through an edit is for both to read the same numbers.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { DASH } from '@/components/ui/DataTable';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { injuryAbbr, injuryWeight } from '@/lib/injury';
import { PositionGlyph } from './PositionGlyph';
import type { DirectoryPlayer } from './player-directory';

/** Row box. Must match what `getItemLayout` is told. */
export const PLAYER_ROW_HEIGHT = 34;

/** Shared by the row and the header row above it. */
export const ROW_GUTTER = Spacing.two + 2;
export const CELL_GAP = 6;

export const COL = {
  rank: 22,
  pos: 24,
  team: 30,
  exp: 24,
  age: 26,
  games: 24,
  fp: 46,
  fpg: 42,
} as const;

/**
 * The two text columns share whatever the fixed columns leave, rather than the
 * name taking all of it: at the 940pt table measure a single flexible column
 * gives the name ~600pt of empty space and pushes the points to the far edge,
 * which is the exact travel ContentMeasure exists to prevent.
 */
export const NAME_FLEX = 1;
export const COLLEGE_FLEX = 0.62;

/**
 * How much of the table fits.
 *
 *  compact  — a phone. Everything here is what you cannot identify a player
 *             without, plus the two numbers you came for.
 *  standard — room for the bio and volume columns that separate a rookie on
 *             two games from a starter on two.
 *  full     — a desktop window. College fills space that would otherwise be
 *             name padding, and it is the field people actually scout by.
 */
export type RowLayout = 'compact' | 'standard' | 'full';

export const STANDARD_WIDTH = 640;
export const FULL_WIDTH = 900;

export function layoutFor(width: number): RowLayout {
  if (width >= FULL_WIDTH) return 'full';
  if (width >= STANDARD_WIDTH) return 'standard';
  return 'compact';
}

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * A player with no games has no season total — not a total of zero. The
 * distinction matters most in preseason, where 354 of 968 players are in that
 * state and printing 0.0 for all of them implies they were measured and found
 * to be worth nothing.
 */
const stat = (value: number, games: number) => (games > 0 ? oneDp(value) : DASH);

/** 0 is a rookie, and 'R' is how every fantasy table in the world writes it. */
const years = (experience: number | null) =>
  experience === null ? DASH : experience === 0 ? 'R' : String(experience);

function PlayerRowInner({
  player,
  index,
  layout,
  onPress,
}: {
  player: DirectoryPlayer;
  /** Drives the zebra banding, so it has to come from the list. */
  index: number;
  layout: RowLayout;
  onPress: (player: DirectoryPlayer) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const team = player.team?.toUpperCase() ?? DASH;
  const played = player.gamesPlayed > 0;
  const detailed = layout !== 'compact';

  const rank = player.posRank ? `${player.position ?? ''}${player.posRank}` : 'unranked';
  const label =
    `${player.name}, ${player.position ?? 'unknown position'}, ${team}, ${rank}. ` +
    (played
      ? `${oneDp(player.seasonFp)} fantasy points, ${oneDp(player.fpPerGame)} per game over ${player.gamesPlayed} games. `
      : 'Has not played this season. ') +
    (player.age ? `Age ${player.age}. ` : '') +
    (player.injuryStatus ? `Injury designation ${player.injuryStatus}.` : '');

  return (
    <Pressable
      onPress={() => onPress(player)}
      // Explicit, so VoiceOver reads the row as one player rather than stopping
      // on the position glyph and then each numeric cell in turn. Nine stops
      // per row across a thousand rows is not a directory anyone can use.
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the player's profile"
      style={({ pressed }) => [
        styles.row,
        // Banding rather than a hairline under every row: at nine columns the
        // eye has to track the full width, and a rule per row reads as a grid
        // of boxes while a band reads as a line to follow.
        index % 2 === 1 && { backgroundColor: c.surfaceSunken },
        pressed && { backgroundColor: c.backgroundSelected },
      ]}>
      <Text
        numberOfLines={1}
        style={[Type.micro, NUMERIC, styles.right, { width: COL.rank, color: c.textTertiary }]}>
        {player.posRank ?? DASH}
      </Text>

      <PositionGlyph
        position={player.position}
        size={COL.pos}
        color={c.textSecondary}
        background={c.backgroundElement}
        borderColor={c.border}
      />

      {/* flexShrink + minWidth 0 is what actually makes a long name truncate
          instead of pushing the points column off the screen. */}
      <View style={styles.identity}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[Type.strong, styles.shrink, { color: c.text }]}>
          {player.name}
        </Text>
        <InjuryMark status={player.injuryStatus} />
      </View>

      <Text numberOfLines={1} style={[Type.label, { width: COL.team, color: c.textSecondary }]}>
        {team}
      </Text>

      {layout === 'full' ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[Type.fine, styles.college, { color: c.textTertiary }]}>
          {player.college ?? DASH}
        </Text>
      ) : null}

      {detailed ? (
        <>
          <Text
            numberOfLines={1}
            style={[Type.body, NUMERIC, styles.right, { width: COL.exp, color: c.textTertiary }]}>
            {years(player.experience)}
          </Text>
          <Text
            numberOfLines={1}
            style={[Type.body, NUMERIC, styles.right, { width: COL.age, color: c.textTertiary }]}>
            {player.age ?? DASH}
          </Text>
          <Text
            numberOfLines={1}
            style={[Type.body, NUMERIC, styles.right, { width: COL.games, color: c.textTertiary }]}>
            {player.gamesPlayed}
          </Text>
        </>
      ) : null}

      <Text
        numberOfLines={1}
        style={[Type.strong, NUMERIC, styles.right, { width: COL.fp, color: c.text }]}>
        {stat(player.seasonFp, player.gamesPlayed)}
      </Text>
      <Text
        numberOfLines={1}
        style={[Type.body, NUMERIC, styles.right, { width: COL.fpg, color: c.textSecondary }]}>
        {stat(player.fpPerGame, player.gamesPlayed)}
      </Text>
    </Pressable>
  );
}

/**
 * The designation, abbreviated. `InjuryChip` prints the status in full, which
 * is right on a profile but measures ~100pt beside a name at this row height —
 * it was the abbreviation or the name, and the name wins.
 *
 * Severity comes from `injuryWeight` and nowhere else: this screen and the
 * lineup screen must never disagree about what 'PUP-R' means.
 */
function InjuryMark({ status }: { status: string | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const weight = injuryWeight(status);
  if (!weight || !status) return null;

  // Blocking carries a filled bullet as well as the colour, so it survives a
  // greyscale screenshot and red/green colour blindness.
  const blocking = weight === 'blocking';
  return (
    <Text
      numberOfLines={1}
      style={[Type.micro, styles.fixed, { color: blocking ? c.negative : c.warning }]}>
      {blocking ? `● ${injuryAbbr(status)}` : injuryAbbr(status)}
    </Text>
  );
}

/**
 * Memoised: without it, every keystroke in the search box re-renders all
 * mounted rows.
 */
export const PlayerRow = memo(PlayerRowInner);

const styles = StyleSheet.create({
  row: {
    height: PLAYER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CELL_GAP,
    paddingHorizontal: ROW_GUTTER,
  },
  identity: {
    flexGrow: NAME_FLEX,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CELL_GAP,
  },
  college: { flexGrow: COLLEGE_FLEX, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  shrink: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
  right: { textAlign: 'right' },
});
