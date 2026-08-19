/**
 * Fixture data for the dev-only galleries (`/preview`, `/gallery`).
 *
 * Shared so the card gallery and the shell gallery show the same players — when
 * two galleries disagree it is never clear whether a difference is the layout
 * or the data. Deliberately awkward on purpose: one name long enough to
 * ellipsise at every size, one apostrophe-and-hyphen name, a maxed card with no
 * next tier, and both injury weights.
 */
import type { PlayerCardModel } from '@/components/cards';
import type { CollectionCard } from '@/components/collection/types';

export const SAMPLE_CARDS: PlayerCardModel[] = [
  {
    playerName: 'Drew Allar',
    positionAbbreviation: 'QB',
    teamAbbreviation: 'TEN',
    tier: 'bronze',
    careerFp: 20.32,
    lineupStarts: 1,
    tierFloorFp: 0,
    nextTierAt: 200,
    nextTierLabel: 'SILVER',
  },
  {
    playerName: 'Amar Johnson',
    positionAbbreviation: 'RB',
    teamAbbreviation: 'KC',
    tier: 'silver',
    careerFp: 412.5,
    lineupStarts: 14,
    tierFloorFp: 200,
    nextTierAt: 750,
    nextTierLabel: 'GOLD',
  },
  {
    playerName: 'Christian McCaffrey',
    positionAbbreviation: 'WR',
    teamAbbreviation: 'SF',
    tier: 'gold',
    careerFp: 1284.75,
    lineupStarts: 41,
    tierFloorFp: 750,
    nextTierAt: 2500,
    nextTierLabel: 'DIAMOND',
  },
  {
    playerName: 'Ja"Marr Chase-Williamson',
    positionAbbreviation: 'TE',
    teamAbbreviation: 'CIN',
    tier: 'diamond',
    careerFp: 3140.2,
    lineupStarts: 96,
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
  id: `sample-${i}`,
  cardId: `card-${i}`,
  playerName: m.playerName,
  position: m.positionAbbreviation,
  team: m.teamAbbreviation,
  injuryStatus: INJURIES[i] ?? null,
  tier: m.tier,
  sellValue: FIXTURE_SELL_VALUE[m.tier],
  careerFp: m.careerFp,
  lineupStarts: m.lineupStarts,
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
