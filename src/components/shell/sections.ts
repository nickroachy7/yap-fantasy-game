/**
 * The navigation model, declared once.
 *
 * Two presentations read this: the wide-web sidebar renders sections as rows
 * with their sub-pages nested beneath, and the mobile `SubNav` renders a
 * section's sub-pages as a segmented control. Values are route paths.
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

export type NavChild = { href: string; label: string; badge?: string };
export type NavSection = { href: string; label: string; children?: NavChild[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    href: '/lineup',
    label: 'Lineup',
    children: [
      { href: '/lineup', label: 'This week' },
      { href: '/lineup/scores', label: 'Scores' },
    ],
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    children: [
      { href: '/leaderboard', label: 'Standings' },
      { href: '/leaderboard/scoring', label: 'Scoring' },
    ],
  },
  {
    href: '/cards',
    label: 'Cards',
    children: [
      { href: '/cards', label: 'Directory' },
      { href: '/cards/trend', label: 'Trend' },
    ],
  },
  {
    href: '/collection',
    label: 'Collection',
    children: [
      { href: '/collection/inventory', label: 'Inventory' },
      // Sets is a designed empty state until Week 3; the badge says so rather
      // than the screen looking broken.
      { href: '/collection/sets', label: 'Sets', badge: 'Soon' },
      { href: '/collection/shop', label: 'Shop' },
    ],
  },
  { href: '/profile', label: 'Profile' },
];

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
