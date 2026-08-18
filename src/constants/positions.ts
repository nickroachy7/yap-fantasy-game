/**
 * Position as a colour, shape and order — the one thing Sleeper does more
 * consistently than anything else in its UI, and the reason a Sleeper roster
 * can be read at a glance from three feet away.
 *
 * WHY THIS DOES NOT FIGHT THE TIER SYSTEM
 *
 * `theme.ts` establishes that TIER is a card's identity: it is earned, it is
 * what the card art is built around, and it is separated on four axes so it
 * survives greyscale. Position is a different question — not "what is this
 * card worth" but "what is this player FOR" — and it is asked in different
 * places: a lineup slot, a scoreboard section, a directory filter. Nothing
 * here is ever drawn on a PlayerCard, so the two systems never share a surface
 * and cannot be confused for one another.
 *
 * COLOUR IS ALWAYS REDUNDANT HERE
 *
 * Every consumer of this file draws the position ABBREVIATION inside or beside
 * the colour. That is deliberate and non-negotiable: the palette below has a
 * blue that is not far from the diamond tier's cyan and an orange adjacent to
 * bronze, so colour alone would be a genuinely bad signal in this app. It is a
 * scanning accelerator on top of a text label, never the label itself. A
 * greyscale screenshot loses nothing; a colour-blind reader loses nothing.
 *
 * The five positions below are the whole set — `cards` joins to players with
 * exactly QB, RB, WR, TE and PK. `other` exists so a feed change cannot crash
 * a badge, not because we expect to use it.
 */

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PK'] as const;

export type Position = (typeof POSITIONS)[number];

/** Includes the fallback, which is what any lookup can actually return. */
export type PositionKey = Position | 'other';

export type PositionColorSet = {
  /** The fill of a badge, and the colour of a section heading. */
  accent: string;
  /** Text drawn ON `accent`. Clears 4.5:1 against it in both schemes. */
  onAccent: string;
  /** A tinted well behind rows belonging to this position. Never text. */
  soft: string;
};

/**
 * Hues follow Sleeper's assignment (QB magenta, RB green, WR blue, TE orange)
 * because a large number of the people this app is for already have those four
 * mappings memorised, and inventing our own would spend that for nothing. PK
 * is ours — Sleeper leaves kickers grey, but a kicker is a real starting slot
 * here and grey reads as "disabled" next to four saturated chips.
 *
 * The light values are dark enough to carry white text; the dark values are
 * bright enough to carry near-black text and to be read as text themselves on
 * `surface`. Neither set is the same hue at two lightnesses — each was picked
 * against its own background.
 */
export const PositionColors: Record<'light' | 'dark', Record<PositionKey, PositionColorSet>> = {
  light: {
    QB: { accent: '#A8005C', onAccent: '#FFFFFF', soft: '#FBE9F2' },
    RB: { accent: '#1A7F49', onAccent: '#FFFFFF', soft: '#E4F4EA' },
    WR: { accent: '#14568F', onAccent: '#FFFFFF', soft: '#E5EFF9' },
    TE: { accent: '#9A4E00', onAccent: '#FFFFFF', soft: '#FBECDD' },
    PK: { accent: '#5B3E9E', onAccent: '#FFFFFF', soft: '#EDE8F8' },
    other: { accent: '#5A5F66', onAccent: '#FFFFFF', soft: '#EDEEF0' },
  },
  dark: {
    QB: { accent: '#FF8ACB', onAccent: '#2B0018', soft: '#2A0F1F' },
    RB: { accent: '#4CC38A', onAccent: '#052416', soft: '#0E2619' },
    WR: { accent: '#6FB4F5', onAccent: '#04203D', soft: '#0D2035' },
    TE: { accent: '#F2A65A', onAccent: '#2E1700', soft: '#2A1B0B' },
    PK: { accent: '#B79CF0', onAccent: '#1B0F3A', soft: '#1D1730' },
    other: { accent: '#9BA1A9', onAccent: '#15171A', soft: '#1B1D20' },
  },
};

/**
 * Normalises whatever the feed says into a key this file has colours for.
 *
 * `PK` is the provider's spelling for a kicker and `K` is what our lineup slot
 * is called, so both have to land in the same bucket — see the infra notes.
 */
export function positionKey(position: string | null | undefined): PositionKey {
  switch ((position ?? '').trim().toUpperCase()) {
    case 'QB':
      return 'QB';
    case 'RB':
    case 'FB':
    case 'HB':
      return 'RB';
    case 'WR':
      return 'WR';
    case 'TE':
      return 'TE';
    case 'PK':
    case 'K':
      return 'PK';
    default:
      return 'other';
  }
}

export function positionColors(
  position: string | null | undefined,
  scheme: 'light' | 'dark',
): PositionColorSet {
  return PositionColors[scheme][positionKey(position)];
}

/**
 * Reading order for anything grouped by position: the order a fantasy manager
 * thinks in, which is roughly descending scoring weight, NOT alphabetical.
 * Used by the scoreboard's leader sections and the scoring reference.
 */
export const POSITION_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'PK'];

/** Long names, for section headings where a two-letter code reads as shouting. */
export const POSITION_NAMES: Record<PositionKey, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  PK: 'Kicker',
  other: 'Other',
};

/**
 * Which positions a lineup slot accepts, for drawing a slot badge before any
 * row data exists.
 *
 * This is a DISPLAY fallback, not the rule. `lineup_slot_config` is the truth
 * and the database re-checks eligibility on submit; this only exists so a badge
 * can be drawn during the first paint, and so the gallery can render every slot
 * variant without a network round trip. A slot missing from this map degrades
 * to a plain single-cell badge rather than throwing.
 */
export const SLOT_POSITIONS: Record<string, Position[]> = {
  QB: ['QB'],
  RB1: ['RB'],
  RB2: ['RB'],
  WR1: ['WR'],
  WR2: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  K: ['PK'],
};
