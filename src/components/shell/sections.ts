import type { Segment } from '@/components/shell/SegmentedControl';

/**
 * Section sub-pages, declared once. The sidebar lists them as rows and the
 * mobile SubNav renders them as segments — two presentations, one source, so
 * they cannot drift apart.
 *
 * Values are route paths, which is what SubNav navigates to.
 *
 * Shop lives under Collection rather than Cards: buying a pack is something you
 * do to your collection, and it puts spending gems next to the cards you get
 * for them. Cards is now purely the player lookup.
 */
export const COLLECTION_SEGMENTS: Segment<string>[] = [
  { value: '/collection/inventory', label: 'Inventory' },
  { value: '/collection/sets', label: 'Sets', badge: 'Soon' },
  { value: '/collection/shop', label: 'Shop' },
];
