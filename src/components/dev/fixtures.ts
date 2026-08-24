/**
 * Fixture data for the dev-only galleries (`/preview`, `/gallery`).
 *
 * Shared so the card gallery and the shell gallery show the same players — when
 * two galleries disagree it is never clear whether a difference is the layout
 * or the data. Deliberately awkward on purpose: one name long enough to
 * ellipsise at every size, one apostrophe-and-hyphen name, a maxed card with no
 * next tier, and both injury weights — plus all four fixture states the card's
 * footer can be in: a home game, an away game, a bye, and no schedule loaded at
 * all, which draws nothing rather than claiming a bye nobody checked for.
 */
import type { PlayerCardModel } from '@/components/cards';
import type { CardTier } from '@/constants/theme';
import type { SetMember } from '@/components/collection/SetChecklist';
import type { CardSet } from '@/components/collection/sets';
import type { CollectionCard } from '@/components/collection/types';
import type { CardActions, CardActionSet } from '@/components/cards/card-actions';

/**
 * The four sample cards, one per tier.
 *
 * `starts` and `perGame` are NOT on `PlayerCardModel` — the card stopped
 * drawing either — but the `CollectionCard` rows built from these below still
 * carry them, and the card profile draws them there. They live beside the model
 * rather than inside it so the gallery keeps exercising the real type.
 */
type Sample = PlayerCardModel & {
  /* NARROWED from the model, which allows nulls for the set checklist's sake —
     a card you do not hold has no tier and no career. Every sample here is a
     card in hand, and the `CollectionCard` rows built below require both. */
  tier: CardTier;
  careerFp: number;
  starts: number;
  perGame: number | null;
};

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


/**
 * Set progress, covering every state a row can be in — which is the whole point
 * of having it here. A real account reaches at most one or two of these at a
 * time, and never the interesting ones early, so a reviewer with a live session
 * sees a page of grey bars and none of the states that carry the design: ready
 * to claim, already claimed, part-filled with cards in hand, and untouched at
 * zero with nothing to add.
 *
 * TWO OF THEM ARE HERE TO CATCH ARITHMETIC RATHER THAN LAYOUT. The kickers hold
 * two candidates for a set that is already full, and the receivers hold five
 * for a set with two slots left; both must report what can actually be done
 * (0 and 2), because the server refuses a commit past the bar and a row that
 * promised more would be promising an error.
 *
 * EVERY LADDER STATE IS SOMEWHERE IN HERE: a rung collected, a rung reached and
 * waiting, a rung ahead, and a set with all four behind it. The team sets carry
 * their whole roster as the requirement, which is what makes their bars sit at
 * a quarter or less — the case a bar measured only against completion would be
 * useless for, and the reason the rung marks exist.
 *
 * The numbers mirror the real 2026 build — a team's whole roster on the
 * 100/500/1500/5000 ladder, a daily's three cards on its single 40-gem rung,
 * 50% of sell value on a commit — so the layout is exercised at the widths
 * those figures actually produce. Fixtures may restate the server's numbers;
 * product code reads `my_sets`.
 *
 * NO POSITION SETS. The family is retired (see `SetFamily`), so a gallery full
 * of them would be reviewing a screen the server can no longer send. The four
 * that were here are dailies now, carrying the same four states.
 */
export const SETS_FIXTURE: CardSet[] = [
  {
    // TODAY'S DAILY, cleared and waiting: the claim button at its loudest, and
    // the shape most players will meet most often.
    id: 'set-1',
    code: 'daily-qb-2026-08-21',
    name: 'Quarterback of the day',
    family: 'daily',
    subtitle: 'Friday 21 August',
    season: 2026,
    required: 3,
    totalCards: 120,
    committed: 3,
    ready: 0,
    commitPayoutPct: 50,
    complete: true,
    // ONE RUNG. A daily pays on the third card and not before — the whole
    // point of the family is that it does not trickle.
    milestones: [{ pct: 100, cards: 3, gems: 40, reached: true, claimed: false, paid: null }],
    totalReward: 40,
    claimableGems: 40,
    claimedGems: 0,
    nextAt: null,
    nextReward: null,
    sortOrder: 0,
  },
  {
    // Yesterday's, cleared and collected, still holding two spares. Nothing is
    // actionable and the row must say so — the server refuses a commit past
    // the bar, so an offer of two more would be an offer of an error.
    id: 'set-2',
    code: 'daily-pk-2026-08-20',
    name: 'Kicker of the day',
    family: 'daily',
    subtitle: 'Thursday 20 August',
    season: 2026,
    required: 3,
    totalCards: 41,
    committed: 3,
    ready: 2,
    commitPayoutPct: 50,
    complete: true,
    milestones: [{ pct: 100, cards: 3, gems: 40, reached: true, claimed: true, paid: 40 }],
    totalReward: 40,
    claimableGems: 0,
    claimedGems: 40,
    nextAt: null,
    nextReward: null,
    sortOrder: 0,
  },
  {
    // Mid-ladder with rungs both behind and ahead, and more candidates held
    // than slots left: the row must promise 2, not 5.
    id: 'set-3',
    code: 'daily-wr-2026-08-19',
    name: 'Wide receiver of the day',
    family: 'daily',
    subtitle: 'Wednesday 19 August',
    season: 2026,
    required: 3,
    totalCards: 398,
    committed: 1,
    ready: 5,
    commitPayoutPct: 50,
    complete: false,
    milestones: [{ pct: 100, cards: 3, gems: 40, reached: false, claimed: false, paid: null }],
    totalReward: 40,
    claimableGems: 0,
    claimedGems: 0,
    nextAt: 3,
    nextReward: 40,
    sortOrder: 0,
  },
  {
    // Untouched and with nothing in hand to touch it with — the state a daily
    // opens in every morning, and the one with no lever on it at all.
    id: 'set-4',
    code: 'daily-te-2026-08-18',
    name: 'Tight end of the day',
    family: 'daily',
    subtitle: 'Tuesday 18 August',
    season: 2026,
    required: 3,
    totalCards: 208,
    committed: 0,
    ready: 0,
    commitPayoutPct: 50,
    complete: false,
    milestones: [{ pct: 100, cards: 3, gems: 40, reached: false, claimed: false, paid: null }],
    totalReward: 40,
    claimableGems: 0,
    claimedGems: 0,
    nextAt: 3,
    nextReward: 40,
    sortOrder: 0,
  },
  {
    // A team set as they actually look for most of a season: a fraction of
    // the roster in, the first rung collected, the second a long way off.
    id: 'set-5',
    code: 'team-nyg-2026',
    name: 'New York Giants',
    family: 'team',
    subtitle: 'NFC East',
    season: 2026,
    required: 32,
    totalCards: 32,
    committed: 9,
    ready: 1,
    commitPayoutPct: 50,
    complete: false,
    milestones: [
      { pct: 25, cards: 8, gems: 100, reached: true, claimed: true, paid: 100 },
      { pct: 50, cards: 16, gems: 500, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 24, gems: 1500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 32, gems: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 7100,
    claimableGems: 0,
    claimedGems: 100,
    nextAt: 16,
    nextReward: 500,
    sortOrder: 21,
  },
  {
    // A long club name, to prove the row ellipsises rather than shoving the
    // right-hand column off its edge. One rung reached and uncollected, so
    // the checklist gallery opens on a live claim AND live add buttons.
    id: 'set-6',
    code: 'team-jax-2026',
    name: 'Jacksonville Jaguars',
    family: 'team',
    subtitle: 'AFC South',
    season: 2026,
    required: 29,
    totalCards: 29,
    committed: 8,
    ready: 2,
    commitPayoutPct: 50,
    complete: false,
    milestones: [
      { pct: 25, cards: 8, gems: 100, reached: true, claimed: false, paid: null },
      { pct: 50, cards: 15, gems: 500, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 22, gems: 1500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 29, gems: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 7100,
    claimableGems: 100,
    claimedGems: 0,
    nextAt: 15,
    nextReward: 500,
    sortOrder: 9,
  },
  {
    // Zero with nothing to add: the state 31 of 32 team sets sit in early on.
    id: 'set-7',
    code: 'team-lac-2026',
    name: 'Los Angeles Chargers',
    family: 'team',
    subtitle: 'AFC West',
    season: 2026,
    required: 27,
    totalCards: 27,
    committed: 0,
    ready: 0,
    commitPayoutPct: 50,
    complete: false,
    milestones: [
      { pct: 25, cards: 7, gems: 100, reached: false, claimed: false, paid: null },
      { pct: 50, cards: 14, gems: 500, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 21, gems: 1500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 27, gems: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 7100,
    claimableGems: 0,
    claimedGems: 0,
    nextAt: 7,
    nextReward: 100,
    sortOrder: 13,
  },
];

/**
 * One set's membership, for the checklist gallery. Deliberately awkward: a
 * duplicate held three times (which must move the bar by ONE), a name long
 * enough to ellipsise, a player with no production yet (no FP suffix, not a
 * printed zero), and more missing than held so both halves of the filter have
 * something in them.
 */
export const SET_MEMBERS_FIXTURE: SetMember[] = [
  { card_id: 'm1', player_id: 'p1', player_name: 'Brian Thomas Jr.',        position_abbreviation: 'WR', team_abbreviation: 'JAX', season_fp: 241.8, committed: true,  held: 0, commit_value: 0,  commit_tier: null },
  { card_id: 'm2', player_id: 'p2', player_name: 'Travis Etienne',          position_abbreviation: 'RB', team_abbreviation: 'JAX', season_fp: 188.4, committed: true,  held: 0, commit_value: 0,  commit_tier: null },
  { card_id: 'm3', player_id: 'p3', player_name: 'Trevor Lawrence',         position_abbreviation: 'QB', team_abbreviation: 'JAX', season_fp: 174.2, committed: true,  held: 1, commit_value: 4,  commit_tier: 'bronze' },
  // Three copies held: the row must offer ONE add and say ×3 beside it.
  { card_id: 'm4', player_id: 'p4', player_name: 'Christian Kirk-Williams', position_abbreviation: 'WR', team_abbreviation: 'JAX', season_fp: 96.1,  committed: false, held: 3, commit_value: 4,  commit_tier: 'bronze' },
  // A gold copy, so the dialog's "burns your gold copy" line is exercised and
  // the payout is visibly bigger than a bronze one.
  { card_id: 'm5', player_id: 'p5', player_name: 'Evan Engram',             position_abbreviation: 'TE', team_abbreviation: 'JAX', season_fp: 88.7,  committed: false, held: 1, commit_value: 75, commit_tier: 'gold' },
  { card_id: 'm6', player_id: 'p6', player_name: 'Cam Little',              position_abbreviation: 'PK', team_abbreviation: 'JAX', season_fp: 61.0,  committed: false, held: 1, commit_value: 4,  commit_tier: 'bronze' },
  { card_id: 'm7', player_id: 'p7', player_name: 'Parker Washington',       position_abbreviation: 'WR', team_abbreviation: 'JAX', season_fp: 24.3,  committed: false, held: 0, commit_value: 0,  commit_tier: null },
  // No production yet: no FP suffix, rather than a printed zero.
  { card_id: 'm8', player_id: 'p8', player_name: 'Seth Williams',           position_abbreviation: 'WR', team_abbreviation: 'JAX', season_fp: null,  committed: false, held: 0, commit_value: 0,  commit_tier: null },
];

/**
 * One pack opening, for the reveal gallery.
 *
 * FIVE CARDS COVERING THE FIVE STATES the panel under the deck can be in, in
 * the order you meet them scrolling right:
 *
 *   1  the ordinary case — one set open, sellable, this copy is the one that
 *      would burn;
 *   2  a player you already own a spare of, so committing burns the OTHER copy
 *      and the row has to say so;
 *   3  in two sets at once — a team set and today's daily — which is the only
 *      case that opens the picker rather than committing on the first tap;
 *   4  a card whose slot is already filled, so there is nothing to add it to
 *      and only the sell button is left;
 *   5  a card in no active set at all, which is a different piece of news from
 *      the one above and must not read the same.
 */
export const PULLED_FIXTURE: PulledFixture[] = [
  { card_instance_id: 'ci-1', player_name: 'Drew Allar',              position_abbreviation: 'QB', team_abbreviation: 'TEN', rarity: 'common' },
  { card_instance_id: 'ci-2', player_name: 'Amar Johnson',            position_abbreviation: 'RB', team_abbreviation: 'KC',  rarity: 'common' },
  { card_instance_id: 'ci-3', player_name: "Ja'Marr Chase-Williams",  position_abbreviation: 'WR', team_abbreviation: 'CIN', rarity: 'rare'   },
  { card_instance_id: 'ci-4', player_name: 'Evan Engram',             position_abbreviation: 'TE', team_abbreviation: 'JAX', rarity: 'common' },
  { card_instance_id: 'ci-5', player_name: 'Cam Little',              position_abbreviation: 'PK', team_abbreviation: 'JAX', rarity: 'common' },
];

type PulledFixture = {
  card_instance_id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  rarity: string | null;
};

const teamSet = (code: string, name: string, committed: number, required: number): CardActionSet => ({
  code,
  name,
  family: 'team',
  subtitle: 'AFC North',
  pays: 4,
  committed,
  required,
  slotFilled: false,
  setComplete: false,
  canCommit: true,
});

export const PULL_ACTIONS_FIXTURE = new Map<string, CardActions>([
  [
    'ci-1',
    {
      cardInstanceId: 'ci-1', cardId: 'c-1', sellValue: 8, held: true, sellable: true,
      burnsThisCopy: true,
      sets: [teamSet('team-ten-2026', 'Tennessee Titans', 6, 31)],
    },
  ],
  [
    'ci-2',
    {
      cardInstanceId: 'ci-2', cardId: 'c-2', sellValue: 8, held: true, sellable: true,
      // The spare-copy case: the commit burns an older copy, not this one.
      burnsThisCopy: false,
      // THE LONGEST NAME IN THE LEAGUE, on purpose. 'Add to Washington
      // Commanders' plus a price overruns a 257pt card, so this is the fixture
      // that proves the label shrinks and the gem figure does not.
      sets: [teamSet('team-wsh-2026', 'Washington Commanders', 12, 32)],
    },
  ],
  [
    'ci-3',
    {
      cardInstanceId: 'ci-3', cardId: 'c-3', sellValue: 8, held: true, sellable: true,
      burnsThisCopy: true,
      sets: [
        {
          code: 'daily-wr-2026-08-23', name: 'Receiver of the day', family: 'daily',
          subtitle: 'Sunday 23 August', pays: 4, committed: 1, required: 3,
          slotFilled: false, setComplete: false, canCommit: true,
        },
        teamSet('team-cin-2026', 'Cincinnati Bengals', 3, 30),
      ],
    },
  ],
  [
    'ci-4',
    {
      cardInstanceId: 'ci-4', cardId: 'c-4', sellValue: 8, held: true, sellable: true,
      burnsThisCopy: true,
      sets: [
        {
          code: 'team-jax-2026', name: 'Jacksonville Jaguars', family: 'team',
          subtitle: 'AFC South', pays: 4, committed: 9, required: 28,
          slotFilled: true, setComplete: false, canCommit: false,
        },
      ],
    },
  ],
  [
    'ci-5',
    {
      cardInstanceId: 'ci-5', cardId: 'c-5', sellValue: 8, held: true, sellable: true,
      burnsThisCopy: true,
      sets: [],
    },
  ],
]);

/**
 * Three sets for the card-exits gallery, one per state the row can be in.
 *
 * Separate from `PULL_ACTIONS_FIXTURE` because that one is a whole pack and
 * these are single rows — a gallery that had to open a pack to see a button
 * would be testing the pack.
 */
export const KIT_SET_OPEN: CardActionSet = {
  code: 'team-ten-2026',
  name: 'Tennessee Titans',
  family: 'team',
  subtitle: 'AFC South',
  pays: 4,
  committed: 6,
  required: 31,
  slotFilled: false,
  setComplete: false,
  canCommit: true,
};

export const KIT_SET_DAILY: CardActionSet = {
  code: 'daily-wr-2026-08-24',
  name: 'Receiver of the day',
  family: 'daily',
  subtitle: 'Monday 24 August',
  pays: 75,
  committed: 1,
  required: 3,
  slotFilled: false,
  setComplete: false,
  canCommit: true,
};

/** His slot is taken, so the whole row collapses to a sentence saying so. */
export const KIT_SET_FILLED: CardActionSet = {
  code: 'team-jax-2026',
  name: 'Jacksonville Jaguars',
  family: 'team',
  subtitle: 'AFC South',
  pays: 4,
  committed: 9,
  required: 28,
  slotFilled: true,
  setComplete: false,
  canCommit: false,
};
