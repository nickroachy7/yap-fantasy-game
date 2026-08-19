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
import type { GameContext } from '@/components/lineup/model';

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
    game: { opponent: 'CAR', home: false, startsAt: '2026-09-13T17:05:00Z' },
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
    game: { opponent: 'BUF', home: true, startsAt: '2026-09-13T20:25:00Z' },
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
    game: null,
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

/**
 * Club -> this week's game, the shape `useUpcomingFixtures` returns.
 *
 * `OWNED_CARDS` is the `CollectionCard` shape and deliberately carries no
 * fixture: in the product the schedule is a SEPARATE read on a different
 * cadence, loaded once for the whole grid rather than per card. The galleries
 * have to hand it in the same way, or the compact size — the one the inventory
 * actually uses — would silently never exercise the fixture line.
 *
 * Clubs with no game are OMITTED rather than mapped to null, so `get()` returns
 * undefined for them. That is the fourth state and a real one — the shop shows
 * freshly pulled cards before any schedule is loaded — and mapping it to null
 * would have made the gallery claim a bye for a week nobody looked up.
 */
export const SAMPLE_FIXTURES: Map<string, GameContext | null> = new Map(
  SAMPLE_CARDS.filter((m) => m.game !== undefined).map((m) => [
    m.teamAbbreviation?.toUpperCase() ?? '',
    m.game ?? null,
  ]),
);
