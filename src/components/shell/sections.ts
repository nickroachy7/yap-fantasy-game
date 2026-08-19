/**
 * The navigation model, declared once.
 *
 * Three presentations read this: the bottom tab bar renders one tab per
 * section, the wide-web sidebar renders sections as rows with their sub-pages
 * nested beneath, and the mobile `SubNav` renders a section's sub-pages as a
 * segmented control. Values are route paths.
 *
 * This file previously declared only the Collection segments while
 * `Sidebar.tsx` kept its own parallel copy of the whole nav — so the comment
 * claiming they could not drift was describing an intention rather than the
 * code, and adding a sub-page meant remembering to edit two files. The sidebar
 * now derives from here, which is what makes that claim true.
 *
 * Order is deliberate: the weekly decision first, standings second, acquisition
 * third, what you own fourth, identity last.
 *
 * A section's FIRST child deliberately shares the section's own href. The
 * segmented control needs a segment for the landing page or there is no way
 * back to it, and the sidebar needs the parent row to stay a live target. The
 * alternative — a bare `/lineup/index` child — would show the same word twice
 * in the rail for no gain.
 */
import type { Segment } from '@/components/shell/SegmentedControl';
import type { TabIconName } from '@/components/shell/TabIcon';

export type NavChild = { href: string; label: string; badge?: string };
export type NavSection = {
  href: string;
  label: string;
  /**
   * Shorter name for the bottom tab bar, where five labels share the screen
   * width. Falls back to `label`.
   *
   * Only Leaderboard needs one. Measured at 10pt on a 320pt viewport — an
   * iPhone SE — "Leaderboard" needs 64px in a 54px slot and rendered as
   * "Leader…"; every other label fits with room. It even fit exactly, to the
   * pixel, at 375pt, which is not a margin worth shipping.
   *
   * "Board" rather than an invented abbreviation: it is already this app's own
   * shorthand for that screen — `leaderboard/board.ts`, `BOARD_LIMIT`, the
   * screen's own doc comment ("The global board"), and the shell gallery's
   * label for it.
   */
  tabLabel?: string;
  /** Drawn by the bottom tab bar and the wide-web rail. See TabIcon. */
  icon: TabIconName;
  children?: NavChild[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    href: '/lineup',
    label: 'Lineup',
    icon: 'lineup',
    children: [
      { href: '/lineup', label: 'This week' },
      { href: '/lineup/scores', label: 'Scores' },
    ],
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    tabLabel: 'Board',
    icon: 'leaderboard',
    children: [
      { href: '/leaderboard', label: 'Standings' },
      { href: '/leaderboard/scoring', label: 'Scoring' },
    ],
  },
  {
    href: '/cards',
    label: 'Cards',
    icon: 'cards',
    children: [
      { href: '/cards', label: 'Directory' },
      { href: '/cards/trend', label: 'Trend' },
    ],
  },
  {
    href: '/collection',
    label: 'Collection',
    icon: 'collection',
    children: [
      { href: '/collection/inventory', label: 'Inventory' },
      // Sets is a designed empty state until Week 3; the badge says so rather
      // than the screen looking broken.
      { href: '/collection/sets', label: 'Sets', badge: 'Soon' },
      { href: '/collection/shop', label: 'Shop' },
    ],
  },
  { href: '/profile', label: 'Profile', icon: 'profile' },
];

/**
 * The route segment expo-router knows a section by — `/lineup` -> `lineup`.
 *
 * The tab layout needs both forms: `name` to match the file on disk, and `href`
 * to point the tab button at the section's landing page. Deriving the first
 * from the second is what keeps the tab bar from becoming the parallel copy of
 * this file that the header above warns about — an earlier version of the tab
 * layout carried its own array of five sections and had already started to
 * drift from this one.
 */
export function routeNameOf(section: NavSection): string {
  return section.href.replace(/^\//, '');
}

/** The sub-pages of a section, as SubNav's segmented control wants them. */
export function segmentsFor(sectionHref: string): Segment<string>[] {
  const section = NAV_SECTIONS.find((s) => s.href === sectionHref);
  return (section?.children ?? []).map((c) => ({
    value: c.href,
    label: c.label,
    badge: c.badge,
  }));
}

/**
 * Retained so the Collection screens keep a stable import. Derived rather than
 * duplicated — that is the entire point of this file.
 */
export const COLLECTION_SEGMENTS: Segment<string>[] = segmentsFor('/collection');

export const LINEUP_SEGMENTS: Segment<string>[] = segmentsFor('/lineup');
export const LEADERBOARD_SEGMENTS: Segment<string>[] = segmentsFor('/leaderboard');
export const CARDS_SEGMENTS: Segment<string>[] = segmentsFor('/cards');
