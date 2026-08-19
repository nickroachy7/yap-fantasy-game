/**
 * Bottom-tab icons, drawn rather than imported.
 *
 * No icon font and no SVG. That is the house rule already set by `Gem`
 * ("a rotated square rather than an icon font so it stays crisp everywhere and
 * costs no dependency"), `PositionGlyph` and `TierMotif` — and this project
 * has neither `@expo/vector-icons` nor `react-native-svg` installed. Adding
 * one for five glyphs would ship a font of a thousand icons to draw five.
 *
 * Every icon is composed from rounded rectangles and circles inside a fixed
 * 24pt box, so they share a baseline, an optical weight and a stroke width, and
 * none of them can drift when the type scale changes.
 *
 * FOCUS IS NOT COLOUR ALONE. The tab bar already tints the active icon, but
 * tint is the same signal the label uses and it disappears in greyscale. Every
 * glyph here is HOLLOW when inactive and SOLID when active, so the selected tab
 * is legible from shape at a glance — the standard platform idiom on both iOS
 * and Android, and one that survives a colour-blind reader.
 *
 * Geometry never changes between states. Only fill does. A shape that grows or
 * gains a part on selection makes the whole bar twitch as you move between
 * tabs.
 */
import { StyleSheet, View, type ColorValue } from 'react-native';

export type TabIconName = 'lineup' | 'leaderboard' | 'players' | 'collection' | 'profile';

export type TabIconProps = {
  name: TabIconName;
  /** `ColorValue`, not `string` — this is what `tabBarIcon` hands us. */
  color: ColorValue;
  focused: boolean;
  /** Box size. The tab bar passes ~24; the kit gallery draws larger. */
  size?: number;
};

/** Stroke weight for the hollow state, at the 24pt reference size. */
const STROKE = 1.6;

export function TabIcon({ name, color, focused, size = 24 }: TabIconProps) {
  // Everything below is expressed against a 24pt box and scaled once here, so
  // the glyphs stay proportional at any size instead of needing a second set.
  const u = size / 24;
  const stroke = Math.max(1, STROKE * u);

  /** Solid when active, outlined when not — the one thing focus changes. */
  const skin = focused
    ? { backgroundColor: color }
    : { borderWidth: stroke, borderColor: color, backgroundColor: 'transparent' };

  const box = [styles.box, { width: size, height: size }];

  switch (name) {
    case 'lineup':
      /* A roster: three slots, each a marker and the name beside it. The
         markers carry the fill state; the name bars stay solid because a
         2pt bar cannot hold a 1.6pt outline and read as anything. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          {/* Fixed-width column so the three rows share a left edge. Sizing to
              content instead would centre each row on its own bar length and
              give a ragged glyph that reads as noise at 24pt. */}
          <View style={{ width: 20 * u, gap: 2.5 * u }}>
            {[12, 8, 10].map((barWidth, i) => (
              <View key={i} style={[styles.slotRow, { gap: 3 * u, height: 6 * u }]}>
                <View style={[{ width: 6 * u, height: 6 * u, borderRadius: 2 * u }, skin]} />
                <View
                  style={{
                    width: barWidth * u,
                    height: 2 * u,
                    borderRadius: u,
                    backgroundColor: color,
                    opacity: focused ? 1 : 0.75,
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      );

    case 'leaderboard':
      /* A podium, second-first-third as it is actually built, so the tallest
         column is centred and the glyph is symmetrical in the bar. */
      return (
        <View style={[box, styles.podium]} accessibilityElementsHidden importantForAccessibility="no">
          {[10, 16, 13].map((h, i) => (
            <View
              key={i}
              style={[
                {
                  width: 5.5 * u,
                  height: h * u,
                  borderRadius: 1.5 * u,
                  marginHorizontal: 1.25 * u,
                },
                skin,
              ]}
            />
          ))}
        </View>
      );

    case 'players':
      /* Two cards, one tucked behind the other. The back card is always
         hollow — a solid pair at this size merges into one blob. */
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={{
              position: 'absolute',
              width: 11.5 * u,
              height: 15.5 * u,
              borderRadius: 2.5 * u,
              borderWidth: stroke,
              borderColor: color,
              opacity: 0.7,
              transform: [{ rotate: '-15deg' }, { translateX: -4.5 * u }],
            }}
          />
          <View
            style={[
              {
                width: 12.5 * u,
                height: 16.5 * u,
                borderRadius: 2.5 * u,
                transform: [{ translateX: 3 * u }],
              },
              skin,
            ]}
          />
        </View>
      );

    case 'collection':
      /* Four cards in a grid — the inventory, which is what this tab opens. */
      return (
        <View style={[box, styles.grid, { gap: 2.5 * u }]} accessibilityElementsHidden importantForAccessibility="no">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[{ width: 7.5 * u, height: 7.5 * u, borderRadius: 2 * u }, skin]}
            />
          ))}
        </View>
      );

    case 'profile':
    default:
      /* Head and shoulders. The shoulders are a full circle clipped to its top
         half by the parent, which is what keeps the outline weight even all
         the way round the arch — drawing an arch with corner radii instead
         leaves a visible border along the flat bottom edge. */
      return (
        <View style={[box, styles.profile, { gap: 2 * u }]} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[{ width: 8 * u, height: 8 * u, borderRadius: 4 * u }, skin]} />
          <View style={{ width: 16 * u, height: 7 * u, overflow: 'hidden' }}>
            <View style={[{ width: 16 * u, height: 16 * u, borderRadius: 8 * u }, skin]} />
          </View>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  slotRow: { flexDirection: 'row', alignItems: 'center' },
  podium: { flexDirection: 'row', alignItems: 'flex-end' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center' },
  profile: { justifyContent: 'center' },
});
