import type { Segment } from '@/components/shell/SegmentedControl';

/**
 * Section sub-pages, declared once. The sidebar lists them as rows and the
 * mobile SubNav renders them as segments — two presentations, one source, so
 * they cannot drift apart.
 *
 * Values are the route paths, which is what SubNav navigates to.
 */
export const CARD_SEGMENTS: Segment<string>[] = [
  { value: '/cards/players', label: 'Players' },
  { value: '/cards/shop', label: 'Shop' },
];

export const COLLECTION_SEGMENTS: Segment<string>[] = [
  { value: '/collection/inventory', label: 'Inventory' },
  { value: '/collection/sets', label: 'Sets', badge: 'Soon' },
];
