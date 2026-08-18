import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';

export type PositionGlyphProps = {
  /** e.g. 'QB' | 'RB' | 'WR' | 'TE' | 'PK'. Null when the feed omits it. */
  position: string | null;
  /** Rendered box size in px. */
  size: number;
  color: string;
  background: string;
  borderColor: string;
};

type PositionGroup = 'passer' | 'rusher' | 'receiver' | 'specialist' | 'other';

/**
 * We are not licensed to use player likenesses, team logos or jerseys, so the
 * position is drawn as a TEXT badge rather than any club mark. The badge shape
 * additionally encodes the position GROUP, so the role is readable at grid
 * size even before the abbreviation is legible.
 */
function groupFor(position: string | null): PositionGroup {
  switch ((position ?? '').toUpperCase()) {
    case 'QB':
      return 'passer';
    case 'RB':
    case 'FB':
    case 'HB':
      return 'rusher';
    case 'WR':
    case 'TE':
      return 'receiver';
    case 'PK':
    case 'K':
    case 'P':
      return 'specialist';
    default:
      return 'other';
  }
}

/** Corner radius per group - a shape cue that does not rely on colour. */
function radiusFor(group: PositionGroup, size: number): number {
  switch (group) {
    case 'passer':
      return size / 2; // full circle
    case 'rusher':
      return size * 0.28; // soft square
    case 'receiver':
      return size * 0.14; // barely rounded
    case 'specialist':
      return 2; // hard square
    default:
      return size * 0.2;
  }
}

export function PositionGlyph({
  position,
  size,
  color,
  background,
  borderColor,
}: PositionGlyphProps) {
  const group = groupFor(position);
  const label = (position ?? '--').toUpperCase();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={position ? `Position ${label}` : 'Position unknown'}
      style={[
        styles.glyph,
        {
          width: size,
          height: size,
          borderRadius: radiusFor(group, size),
          backgroundColor: background,
          borderColor,
        },
      ]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[
          styles.text,
          {
            color,
            // Scales with the box so 2- and 3-letter codes both fit.
            fontSize: label.length > 2 ? size * 0.34 : size * 0.42,
          },
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  text: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
