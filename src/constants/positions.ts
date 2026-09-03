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
 * Hues follow Sleeper's assignment (QB magenta, WR blue, TE orange) because a
 * large number of the people this app is for already have those mappings
 * memorised, and inventing our own would spend that for nothing. PK is ours —
 * Sleeper leaves kickers grey, but a kicker is a real starting slot here and
 * grey reads as "disabled" next to four saturated chips.
 *
 * RB IS THE ONE THAT BREAKS FROM SLEEPER, AND IT COST SOMETHING TO DO IT.
 * It was #4CC38A — the SAME HEX as `positive`, the app's "you won" colour, on
 * rows that print both. Zero degrees apart, one meaning each. Once selection
 * became green too, green was speaking three times and the eye cannot rank
 * three. RB moved because it is the cheapest of the three to move: `positive`
 * is green by a convention older than this app, and a selection accent is the
 * whole chrome.
 *
 * TEAL IS NOT A FREE CHOICE, IT IS THE ONLY GAP LEFT. The wheel is already
 * spoken for — magenta 330, negative 357, orange 30, gold 45, lime 75,
 * selection 126, positive 152, diamond 190, WR/live 210, PK 265. At ~173 this
 * clears `positive` by 21 degrees and the diamond tier by 17. Diamond is the
 * tight one and it is accepted deliberately: a tier paints a card's FRAME and
 * badge, a position paints a two-letter chip in a different place and shape,
 * so the two never have to be told apart at the same glance. Putting RB in the
 * other real gap (~300, magenta-purple) would have read as a second QB pink at
 * badge size, which is the confusion that actually costs a lineup decision.
 *
 * The light values are dark enough to carry white text; the dark values are
 * bright enough to carry near-black text and to be read as text themselves on
 * `surface`. Neither set is the same hue at two lightnesses — each was picked
 * against its own background.
 */
export const PositionColors: Record<'light' | 'dark', Record<PositionKey, PositionColorSet>> = {
  light: {
    QB: { accent: '#A8005C', onAccent: '#FFFFFF', soft: '#FBE9F2' },
    RB: { accent: '#0F7A6E', onAccent: '#FFFFFF', soft: '#E0F3F0' },
    WR: { accent: '#14568F', onAccent: '#FFFFFF', soft: '#E5EFF9' },
    TE: { accent: '#9A4E00', onAccent: '#FFFFFF', soft: '#FBECDD' },
    PK: { accent: '#5B3E9E', onAccent: '#FFFFFF', soft: '#EDE8F8' },
    other: { accent: '#5A5F66', onAccent: '#FFFFFF', soft: '#EDEEF0' },
  },
  dark: {
    QB: { accent: '#FF8ACB', onAccent: '#2B0018', soft: '#2A0F1F' },
    RB: { accent: '#2FD1BE', onAccent: '#04211D', soft: '#0C2723' },
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
  /* The BARE codes as well as the numbered ones. `positionsForSlot` strips a
     trailing digit before its second lookup, so `RB3` — which the eight-slot
     board never had but a manager-built contest can — needs somewhere to land.
     Without these it degrades to a solid badge coloured from its label, which
     is right for RB and WR and wrong for the two combination slots below. */
  RB: ['RB'],
  RB1: ['RB'],
  RB2: ['RB'],
  WR: ['WR'],
  WR1: ['WR'],
  WR2: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  /* SUPERFLEX WAS MISSING, and it is not new: the seeded `superflex` format has
     had an SFLEX slot since `20260901050000`, and with nothing here it drew as
     a grey "other" badge — the one slot in the game whose whole point is that
     it takes a quarterback OR a skill player, saying neither. */
  SFLEX: ['QB', 'RB', 'WR', 'TE'],
  K: ['PK'],
};
