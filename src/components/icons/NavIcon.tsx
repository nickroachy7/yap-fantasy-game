/**
 * The bottom bar's four glyphs, drawn rather than constructed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SITS IN FRONT OF `TabIcon` INSTEAD OF REPLACING IT
 * ---------------------------------------------------------------------------
 *
 * `TabIconName` has nine values; this set has drawn artwork for four of them —
 * the ones on the bottom bar. The other five (lineup, leaderboard, players,
 * collection, sets) are still `TabIcon`'s constructed geometry, and they are
 * fine: they are rectangles and circles on a 24pt grid, they carry no facet,
 * and they survive a native binary too old for `react-native-svg`, which the
 * bar on every screen has a real interest in.
 *
 * So this delegates rather than forks. Pass any `TabIconName` and you get drawn
 * art where it exists and the constructed glyph where it does not, which means
 * the swap could land on the four without a flag day for the other five and
 * without two components that both claim to draw the tab bar.
 *
 * ---------------------------------------------------------------------------
 * TWO ARTWORKS, NOT ONE GLYPH WITH TWO FILLS
 * ---------------------------------------------------------------------------
 *
 * `Icon` can hollow a `stateful` part by stroking it, and for a composed glyph
 * of a dozen points that works. These are 200-1500 point outlines, and stroking
 * one produces a tangle at 24pt rather than an outline — the stroke follows
 * every wobble in the contour.
 *
 * So focus picks a different DRAWING: `nav-yap` when active, `nav-yap-idle`
 * when not. Both were generated as their own artwork, which is why the idle
 * one has an even stroke weight instead of a traced one.
 *
 * This is what keeps the hollow/solid convention `TabIcon` argues for. Sleeper
 * signals the active tab with tint alone; tint is the one signal that does not
 * survive greyscale or a colour-blind reader, so the shape carries it too.
 */
import { TabIcon, type TabIconName, type TabIconProps } from '@/components/shell/TabIcon';

import { Icon } from './Icon';
import {
  league,
  navProfile,
  navProfileIdle,
  navScores,
  navScoresIdle,
  navYap,
  navYapIdle,
} from './glyphs';
import type { Glyph } from './system';

/**
 * The four the bottom bar draws, each with the artwork for both states.
 *
 * Keyed by `TabIconName` so the nav config stays the single source of truth —
 * `sections.ts` names the icon and neither this file nor the tab layout gets a
 * parallel list to drift from it.
 */
const DRAWN: Partial<Record<TabIconName, { active: Glyph; idle: Glyph }>> = {
  fantasy: { active: navYap, idle: navYapIdle },
  /* THE ONE TAB WHOSE ARTWORK DOES NOT CHANGE, and it is a shape problem
     rather than a missing drawing. Crossed pennants are thin-limbed: hollowing
     them puts two hairlines a hair apart down each staff, and at 24pt those
     merge into a scribble. Four generated attempts at a hollow variant all
     read weaker than the three glyphs beside it, so the solid mark does both
     states. What that costs is the shape half of the focus signal on this tab
     alone; tint and the label's own weight still carry it. Swap in a hollow
     pair the day one exists that holds at 24pt. */
  leagues: { active: league, idle: league },
  scores: { active: navScores, idle: navScoresIdle },
  profile: { active: navProfile, idle: navProfileIdle },
};

export function NavIcon({ name, color, focused, size = 24 }: TabIconProps) {
  const drawn = DRAWN[name];
  if (!drawn) return <TabIcon name={name} color={color} focused={focused} size={size} />;

  return (
    <Icon
      glyph={focused ? drawn.active : drawn.idle}
      // `Icon` wants a string; `tabBarIcon` hands us a `ColorValue`, which is
      // the same thing in every case this is called with.
      color={String(color)}
      size={size}
      // The artwork is already the right state, so nothing here should be
      // re-stated by the renderer's own fill/stroke switch.
      focused
    />
  );
}
