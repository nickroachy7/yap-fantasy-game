/**
 * The renderer. One place where a glyph becomes pixels, so the state
 * convention, the tinting and the scaling cannot be re-litigated per icon.
 *
 * Everything interesting is in `system.ts`; this file is deliberately dull.
 * That is the division of labour: the system decides what a glyph may be, the
 * validator checks it is, and this draws it the one agreed way.
 *
 * WHY SVG AND NOT VIEWS. `TabIcon` draws its nine from rounded rectangles and
 * circles and is right to — they are rectangles and circles, and a dependency
 * to draw a circle would be one. This set is faceted: chamfers, chevrons,
 * shields, diamonds. Those are polygons, and a polygon made of Views is a pile
 * of rotated boxes nobody can read. `react-native-svg` is already a dependency
 * (`YapLogo` brought it on 2026-08-21), so the cost here is zero.
 */
import { useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, G, Mask, Rect } from 'react-native-svg';

import { Fonts } from '@/constants/theme';

import { GRID, LABEL, STROKE, type Glyph } from './system';

export type IconProps = {
  glyph: Glyph;
  /** Rendered box size in px. The glyph is authored at GRID and scaled once. */
  size?: number;
  color: string;
  /**
   * Solid when true, outlined when false — the same signal the tab bar uses,
   * and the reason it survives greyscale and a colour-blind reader.
   *
   * Geometry never changes between the two. Only fill does. A shape that grows
   * or gains a part on selection makes a whole rail twitch as you move along
   * it, which `TabIcon` establishes and this set has no licence to contradict.
   */
  focused?: boolean;
  /** For `accent` parts — the gold in a tier mark, the steel in a blade. */
  accent?: string;
  /**
   * The surface behind the glyph, and ONLY for the label.
   *
   * Knockout paths are cut with a mask, so they need no idea what is behind
   * them and work on any surface. Type cannot be: it is RN `Text` sitting over
   * the SVG (see the label below for why), and text has no mask to be cut
   * from — so when the plate beneath it fills, the letters have to be painted
   * the colour of the page to read as punched out of it.
   *
   * Passing the wrong one is a visible bug rather than a silent one, which is
   * the least-bad property available here.
   */
  background?: string;
  /** Decorative by default; pass a label when the glyph is the only content. */
  accessibilityLabel?: string;
};

export function Icon({
  glyph,
  size = GRID,
  color,
  focused = false,
  accent,
  background,
  accessibilityLabel,
}: IconProps) {
  const u = size / GRID;
  const decorative = accessibilityLabel == null;

  // Masks are referenced by id, and two icons on one screen must not share
  // one. `useId` is stable across re-renders and unique per instance, which is
  // the same problem `Hearts` solves for its clip paths.
  const maskId = `knock-${useId()}`;

  const knockouts = glyph.parts.filter((p) => p.role === 'knockout');
  const painted = glyph.parts.filter((p) => p.role !== 'knockout');

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no' : 'yes'}>
      <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
        {/* The knockout mask: the whole box is kept, and every `knockout` part
            is punched out of it. Black is "remove" in an SVG luminance mask.
            When a glyph declares no knockouts the mask is omitted entirely, so
            the common case pays nothing for it. */}
        {knockouts.length > 0 ? (
          <Mask id={maskId}>
            <Rect x={0} y={0} width={GRID} height={GRID} fill="#fff" />
            {knockouts.map((part, i) => (
              <Path key={i} d={part.d} fill="#000" />
            ))}
          </Mask>
        ) : null}
        <G mask={knockouts.length > 0 ? `url(#${maskId})` : undefined}>
          {painted.map((part, i) => {
            const role = part.role ?? 'stateful';

            // `accent` and `constant` are always filled. Only `stateful` parts
            // answer the focus question — see PartRole in `system.ts`.
            const solid = role !== 'stateful' || focused;
            const paint = role === 'accent' ? (accent ?? color) : color;

            if (part.stroke && !solid) {
              return (
                <Path
                  key={i}
                  d={part.d}
                  fill="none"
                  stroke={paint}
                  strokeWidth={STROKE[part.stroke]}
                  strokeLinejoin="miter"
                  opacity={part.opacity}
                />
              );
            }

            // An unfocused stateful part with no declared weight still has to
            // hollow out, so it borrows `regular` — the tab bar's own weight.
            if (!solid) {
              return (
                <Path
                  key={i}
                  d={part.d}
                  fill="none"
                  stroke={paint}
                  strokeWidth={STROKE.regular}
                  strokeLinejoin="miter"
                  opacity={part.opacity}
                />
              );
            }

            return <Path key={i} d={part.d} fill={paint} opacity={part.opacity} />;
          })}
        </G>
      </Svg>

      {/* Type, when the glyph IS type — the reference sheet's own answer for
          position marks. Drawn as RN `Text` rather than SVG `<Text>` because
          the platform font stack is what keeps two capitals legible at 16pt,
          and `react-native-svg` does not get the system face on web. */}
      {glyph.label ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            position: 'absolute',
            // Punched out of the plate when it is filled — the same subtraction
            // `knockout` does for paths, done the only way type can be.
            color: focused ? (background ?? color) : color,
            fontFamily: Fonts.sans,
            fontWeight: LABEL.weight,
            fontSize: LABEL.size * u,
            letterSpacing: LABEL.tracking * u,
            textAlign: 'center',
          }}>
          {glyph.label}
        </Text>
      ) : null}
    </View>
  );
}
