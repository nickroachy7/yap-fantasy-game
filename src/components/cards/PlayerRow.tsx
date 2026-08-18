/**
 * One row of the Players browser.
 *
 * Fixed height on purpose: it lets the FlatList supply `getItemLayout`, which
 * is what keeps scrolling ~1,000 rows smooth on a phone.
 *
 * No photo, no logo, no jersey — we hold no licence for any of them. The club
 * is its three-letter abbreviation as text and the position is a glyph.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { InjuryChip } from './InjuryChip';
import { PositionGlyph } from './PositionGlyph';
import type { DirectoryPlayer } from './player-directory';

/** Row box + hairline. Must match what `getItemLayout` is told. */
export const PLAYER_ROW_HEIGHT = 64;

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function PlayerRowInner({
  player,
  onPress,
}: {
  player: DirectoryPlayer;
  onPress: (player: DirectoryPlayer) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const team = player.team?.toUpperCase() ?? '—';

  const label =
    `${player.name}, ${player.position ?? 'unknown position'}, ${team}. ` +
    `${oneDp(player.seasonFp)} season fantasy points, ` +
    `${oneDp(player.fpPerGame)} per game over ${player.gamesPlayed} games.`;

  return (
    <Pressable
      onPress={() => onPress(player)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the player's game log"
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.backgroundElement },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <PositionGlyph
        position={player.position}
        size={32}
        color={c.text}
        background={c.backgroundElement}
        borderColor={c.backgroundSelected}
      />

      <View style={styles.identity}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.name, { color: c.text }]}>
          {player.name}
        </Text>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={[styles.meta, { color: c.textSecondary }]}>
            {player.rarity ? `${team} · ${player.rarity.toUpperCase()}` : team}
          </Text>
          <InjuryChip status={player.injuryStatus} />
        </View>
      </View>

      <View style={styles.numbers}>
        <Text numberOfLines={1} style={[styles.fp, NUMERIC, { color: c.text }]}>
          {oneDp(player.seasonFp)}
        </Text>
        <Text numberOfLines={1} style={[styles.fpg, NUMERIC, { color: c.textSecondary }]}>
          {player.gamesPlayed > 0 ? `${oneDp(player.fpPerGame)} /g` : 'no games'}
        </Text>
      </View>
    </Pressable>
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // flexShrink + minWidth 0 is what actually makes a long name truncate
  // instead of pushing the points column off the screen.
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 0 },
  meta: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, flexShrink: 1 },
  numbers: { alignItems: 'flex-end', width: 78, flexShrink: 0 },
  fp: { fontSize: 16, fontWeight: '800' },
  fpg: { fontSize: 11, fontWeight: '600' },
});
