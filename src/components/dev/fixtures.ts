/**
 * Fixture data for the dev-only galleries (`/preview`, `/gallery`).
 *
 * Shared so the card gallery and the shell gallery show the same players — when
 * two galleries disagree it is never clear whether a difference is the layout
 * or the data. Deliberately awkward on purpose: one name long enough to
 * ellipsise at every size, one apostrophe-and-hyphen name, a maxed card with no
 * next tier, and both injury weights — plus all three fixture states the card
 * can be in: a home game, an away game, a bye (`game: null`), and no schedule
 * loaded at all (`game` omitted), which renders no fixture line rather than
 * claiming a bye nobody checked for.
 */
import type { PlayerCardModel } from '@/components/cards';
import type { CollectionCard } from '@/components/collection/types';

/**
 * The four sample cards, one per tier.
 *
 * `starts` and `perGame` are NOT on `PlayerCardModel` — the card stopped
 * drawing either — but the `CollectionCard` rows built from these below still
 * carry them, and the card profile draws them there. They live beside the model
 * rather than inside it so the gallery keeps exercising the real type.
 */
type Sample = PlayerCardModel & { starts: number; perGame: number | null };

export const SAMPLE_CARDS: Sample[] = [
  {
    playerName: 'Drew Allar',
    positionAbbreviation: 'QB',
    teamAbbreviation: 'TEN',
    tier: 'bronze',
    careerFp: 20.32,
    starts: 1,
    tierFloorFp: 0,
    nextTierAt: 200,
    nextTierLabel: 'SILVER',
    perGame: 14.2,
  },
  {
    playerName: 'Amar Johnson',
    positionAbbreviation: 'RB',
    teamAbbreviation: 'KC',
    tier: 'silver',
    careerFp: 412.5,
    starts: 14,
    tierFloorFp: 200,
    nextTierAt: 750,
    nextTierLabel: 'GOLD',
    perGame: 21.7,
  },
  {
    playerName: 'Christian McCaffrey',
    positionAbbreviation: 'WR',
    teamAbbreviation: 'SF',
    tier: 'gold',
    careerFp: 1284.75,
    starts: 41,
    tierFloorFp: 750,
    nextTierAt: 2500,
    nextTierLabel: 'DIAMOND',
    perGame: 8.4,
  },
  {
    playerName: 'Ja"Marr Chase-Williamson',
    positionAbbreviation: 'TE',
    teamAbbreviation: 'CIN',
    tier: 'diamond',
    careerFp: 3140.2,
    starts: 96,
    perGame: null,
    tierFloorFp: 2500,
    nextTierAt: null,
  },
];

/** Statuses run alongside the tiers so both injury weights are exercised. */
const INJURIES: (string | null)[] = [null, 'Questionable', 'Out', null];

/**
 * Mirrors `tier_thresholds.sell_value`. A fixture, so it is allowed to restate
 * the server's numbers — but only here, and only so the gallery shows realistic
 * figures. Product code reads `sell_value` off `my_collection`.
 */
const FIXTURE_SELL_VALUE: Record<CollectionCard['tier'], number> = {
  bronze: 8,
  silver: 40,
  gold: 150,
  diamond: 500,
};

export const OWNED_CARDS: CollectionCard[] = SAMPLE_CARDS.map((m, i) => ({
  // The PLAYER's season average, not the card's earnings. The last card leaves
  // it null on purpose: a player with no scored games yet is a real state and
  // the card must draw it as absence rather than as a zero.
  fpPerGame: m.perGame,
  id: `sample-${i}`,
  cardId: `card-${i}`,
  playerName: m.playerName,
  position: m.positionAbbreviation,
  team: m.teamAbbreviation,
  injuryStatus: INJURIES[i] ?? null,
  tier: m.tier,
  sellValue: FIXTURE_SELL_VALUE[m.tier],
  careerFp: m.careerFp,
  lineupStarts: m.starts,
  tierFloorFp: m.tierFloorFp,
  nextTierAt: m.nextTierAt,
  nextTierLabel: m.nextTierLabel,
  season: 2026,
  acquiredAt: 0,
}));

/** Enough cards to fill several rows and prove the grid wraps evenly. */
export const OWNED_MANY: CollectionCard[] = Array.from({ length: 14 }, (_, i) => {
  const base = OWNED_CARDS[i % OWNED_CARDS.length];
  return { ...base, id: `many-${i}`, cardId: `many-card-${i}` };
});

