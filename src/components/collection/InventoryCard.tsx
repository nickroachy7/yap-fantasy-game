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
import type { GameContext } from '@/components/lineup/model';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryAbbr, injuryWeight, type InjuryWeight } from '@/lib/injury';
import { toCardModel, type CollectionCard } from './types';

/**
 * The two weights are separated by fill, border style, marker glyph and text —
 * not by hue. A greyscale screenshot still reads "solid = out, dashed = maybe".
 *
 * The colours are the theme's `negative` and `warning` rather than a local pair.
 * They were local because the theme had no status palette; it does now, and one
 * app-wide red is worth more than a locally tuned one — the flag sits on the
 * page background here, not on the card's tier surface, so the theme's own
 * contrast pairings apply.
 */
function InjuryFlag({ weight, status }: { weight: Exclude<InjuryWeight, null>; status: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const blocking = weight === 'blocking';
  const tone = blocking ? c.negative : c.warning;

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
        style={[Type.micro, styles.flagText, { color: blocking ? c.background : tone }]}>
        {blocking ? '✕' : '○'} {injuryAbbr(status)}
      </Text>
    </View>
  );
}

export function InventoryCard({
  card,
  width,
  game,
  onPress,
}: {
  card: CollectionCard;
  /** Exact column width, so rows align and the last row does not stretch. */
  width: number;
  /** This club's game this week. Undefined until the schedule lands. */
  game?: GameContext | null;
  onPress?: () => void;
}) {
  const weight = injuryWeight(card.injuryStatus);

  return (
    <View style={[styles.cell, { width }]}>
      <PlayerCard
        model={toCardModel(card, game)}
        size="compact"
        fixedWidth={false}
        onPress={onPress}
      />
      {weight && card.injuryStatus ? (
        <InjuryFlag weight={weight} status={card.injuryStatus} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { gap: Spacing.one },
  flag: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  flagText: { textAlign: 'center' },
});
