/**
 * One grid cell: a <PlayerCard> sized to the column, plus an injury flag.
 *
 * The card itself is reused as-is — this wrapper adds only the two things the
 * card cannot know about: how wide its column is, and whether the player is
 * available this week.
 *
 * Injury weight comes from `injuryWeight()` rather than a status list invented
 * here, so the collection and the lineup screen can never disagree about what
 * "PUP-R" means.
 */
import { StyleSheet, Text, View } from 'react-native';

import { PlayerCard } from '@/components/cards';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryAbbr, injuryWeight, type InjuryWeight } from '@/lib/injury';
import { toCardModel, type CollectionCard } from './types';

/**
 * The two weights are separated by fill, border style, marker glyph and text —
 * not by hue. A greyscale screenshot still reads "solid = out, dashed = maybe".
 */
const INJURY_COLORS = {
  light: { blocking: '#B3261E', advisory: '#7A5B00', onBlocking: '#FFFFFF' },
  dark: { blocking: '#FF9A8F', advisory: '#E0C46A', onBlocking: '#2A0806' },
} as const;

function InjuryFlag({ weight, status }: { weight: Exclude<InjuryWeight, null>; status: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = INJURY_COLORS[scheme];
  const blocking = weight === 'blocking';
  const tone = blocking ? palette.blocking : palette.advisory;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        blocking
          ? `Injury status ${status}. Very unlikely to play.`
          : `Injury status ${status}. Availability uncertain.`
      }
      style={[
        styles.flag,
        {
          borderColor: tone,
          borderStyle: blocking ? 'solid' : 'dashed',
          backgroundColor: blocking ? tone : 'transparent',
        },
      ]}>
      <Text
        numberOfLines={1}
        style={[styles.flagText, { color: blocking ? palette.onBlocking : tone }]}>
        {blocking ? '✕' : '○'} {injuryAbbr(status)}
      </Text>
    </View>
  );
}

export function InventoryCard({
  card,
  width,
  onPress,
}: {
  card: CollectionCard;
  /** Exact column width, so rows align and the last row does not stretch. */
  width: number;
  onPress?: () => void;
}) {
  const weight = injuryWeight(card.injuryStatus);

  return (
    <View style={[styles.cell, { width }]}>
      <PlayerCard model={toCardModel(card)} size="compact" fixedWidth={false} onPress={onPress} />
      {weight && card.injuryStatus ? (
        <InjuryFlag weight={weight} status={card.injuryStatus} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { gap: Spacing.one + 2 },
  flag: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
  },
  flagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
});
