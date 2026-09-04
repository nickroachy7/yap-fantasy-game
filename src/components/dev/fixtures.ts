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
import type { CommitPlan } from '@/components/collection/bulk';
import type { Json } from '@/lib/database.types';
import type { PeekSlot as PeekEntrySlot } from '@/components/contests/use-contest-field';
import type { HistoryEntry } from '@/components/contests/use-contest-history';

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
 * Roughly what `card_prices` pays at each tier for a mid-table player. A
 * fixture, so it is allowed to restate the server's numbers — but only here,
 * and only so the gallery shows realistic figures. Product code reads
 * `sell_value` off `my_collection` and never computes a price.
 *
 * Since 20260902060000 the real figure is (player value + earned points) x tier
 * rather than a flat per-tier constant, so these are illustrative rather than
 * exact — which is all a gallery needs.
 */
const FIXTURE_SELL_VALUE: Record<CollectionCard['tier'], number> = {
  bronze: 24,
  silver: 91,
  gold: 385,
  diamond: 1271,
};

export const OWNED_CARDS: CollectionCard[] = SAMPLE_CARDS.map((m, i) => ({
  // The PLAYER's season average, not the card's earnings. The last card leaves
  // it null on purpose: a player with no scored games yet is a real state and
  // the card must draw it as absence rather than as a zero.
  fpPerGame: m.perGame,
  // Every third sample is a player already in a set, so the grid's IN SET pill
  // is exercised beside cards without it rather than on a page of them.
  inSet: i % 3 === 1,
  id: `sample-${i}`,
  cardId: `card-${i}`,
  playerName: m.playerName,
  position: m.positionAbbreviation,
  team: m.teamAbbreviation,
  injuryStatus: INJURIES[i] ?? null,
  tier: m.tier,
  sellValue: FIXTURE_SELL_VALUE[m.tier],
  // Spread across a plausible position pool, and the last sample is left
  // unranked so the card is drawn at least once without a rank — the real state
  // for the 40% of the set with no prior-season production.
  posRank: i === SAMPLE_CARDS.length - 1 ? null : i + 1,
  posPool: i === SAMPLE_CARDS.length - 1 ? null : 64,
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
 * waiting, a rung ahead, and a set with every rung still in front of it. The
 * team sets carry their whole roster as the requirement, which is what makes
 * their bars sit at a quarter or less — the case a bar measured only against
 * completion would be useless for, and the reason the rung marks exist.
 *
 * The numbers mirror the real 2026 build — a team's whole roster on the
 * six-rung 100/300/500/700/2500/5000 ladder, a daily's three cards on its
 * single 40-coin rung, a weekly's three silvers on its single 250-coin one, 50%
 * of sell value on a commit — so the layout is exercised at the widths those
 * figures actually produce. Fixtures may restate the server's numbers; product
 * code reads `my_sets`.
 *
 * THE WEEKLY IS THE ONE WITH A FLOOR, and it is in here specifically so the
 * gallery has a row where `ready` is smaller than the number of members held.
 * Every other family counts any copy; this one counts silver and better, and a
 * layout reviewed only against unfloored sets would never show that case.
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
    minTier: null,
    complete: true,
    // ONE RUNG. A daily pays on the third card and not before — the whole
    // point of the family is that it does not trickle.
    milestones: [{ pct: 100, cards: 3, coins: 40, reached: true, claimed: false, paid: null }],
    totalReward: 40,
    claimableCoins: 40,
    claimedCoins: 0,
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
    minTier: null,
    complete: true,
    milestones: [{ pct: 100, cards: 3, coins: 40, reached: true, claimed: true, paid: 40 }],
    totalReward: 40,
    claimableCoins: 0,
    claimedCoins: 40,
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
    minTier: null,
    complete: false,
    milestones: [{ pct: 100, cards: 3, coins: 40, reached: false, claimed: false, paid: null }],
    totalReward: 40,
    claimableCoins: 0,
    claimedCoins: 0,
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
    minTier: null,
    complete: false,
    milestones: [{ pct: 100, cards: 3, coins: 40, reached: false, claimed: false, paid: null }],
    totalReward: 40,
    claimableCoins: 0,
    claimedCoins: 0,
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
    minTier: null,
    complete: false,
    milestones: [
      { pct: 10, cards: 4, coins: 60, reached: true, claimed: true, paid: 100 },
      { pct: 25, cards: 8, coins: 100, reached: true, claimed: true, paid: 300 },
      { pct: 40, cards: 13, coins: 500, reached: false, claimed: false, paid: null },
      { pct: 50, cards: 16, coins: 700, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 24, coins: 2500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 32, coins: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 8860,
    claimableCoins: 0,
    /* 400, NOT 160, AND THE GAP IS THE POINT. `my_sets.claimed_coins` sums the
       FROZEN `paid` on each rung — what actually landed — while `coins` is what
       the rung costs today. These two were collected before
       20260825000000_close_reachable_band.sql took the band from 400 to 160, so
       this row reads 400 collected against a ladder that would now pay 160.
       That is the honest answer and the only fixture that exercises it. */
    claimedCoins: 400,
    nextAt: 13,
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
    minTier: null,
    complete: false,
    milestones: [
      { pct: 10, cards: 3, coins: 60, reached: true, claimed: true, paid: 100 },
      { pct: 25, cards: 8, coins: 100, reached: true, claimed: false, paid: null },
      { pct: 40, cards: 12, coins: 500, reached: false, claimed: false, paid: null },
      { pct: 50, cards: 15, coins: 700, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 22, coins: 2500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 29, coins: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 8860,
    /* Today's price for the 25% rung, which is what an unclaimed rung is worth:
       100, where the same rung paid this player's rivals 300 last week. */
    claimableCoins: 100,
    claimedCoins: 100,
    nextAt: 12,
    nextReward: 500,
    sortOrder: 9,
  },
  {
    // BARELY STARTED, BUT YOU ARE HOLDING FOUR THAT FIT — and it is here to
    // prove the band, because nothing else in this list does.
    //
    // Sections order by what you can DO: claimable first, then sets you hold a
    // card for, then everything else. This one sits at 1 of 31 and must
    // therefore appear ABOVE the Giants at 9 of 32, who are much further along
    // and have nothing to add. Sorted by progress — which is what the list did
    // before — it would sink to the bottom, which is exactly the case the
    // banding exists to fix: a set you can act on today should never sit under
    // one you can only look at.
    id: 'set-9',
    code: 'team-ari-2026',
    name: 'Arizona Cardinals',
    family: 'team',
    subtitle: 'NFC West',
    season: 2026,
    required: 31,
    totalCards: 31,
    committed: 1,
    ready: 4,
    commitPayoutPct: 50,
    minTier: null,
    complete: false,
    milestones: [
      { pct: 10, cards: 4, coins: 60, reached: false, claimed: false, paid: null },
      { pct: 25, cards: 8, coins: 100, reached: false, claimed: false, paid: null },
      { pct: 40, cards: 13, coins: 500, reached: false, claimed: false, paid: null },
      { pct: 50, cards: 16, coins: 700, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 24, coins: 2500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 31, coins: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 8860,
    claimableCoins: 0,
    claimedCoins: 0,
    nextAt: 4,
    nextReward: 100,
    sortOrder: 2,
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
    minTier: null,
    complete: false,
    milestones: [
      { pct: 10, cards: 3, coins: 60, reached: false, claimed: false, paid: null },
      { pct: 25, cards: 7, coins: 100, reached: false, claimed: false, paid: null },
      { pct: 40, cards: 11, coins: 500, reached: false, claimed: false, paid: null },
      { pct: 50, cards: 14, coins: 700, reached: false, claimed: false, paid: null },
      { pct: 75, cards: 21, coins: 2500, reached: false, claimed: false, paid: null },
      { pct: 100, cards: 27, coins: 5000, reached: false, claimed: false, paid: null },
    ],
    totalReward: 8860,
    claimableCoins: 0,
    claimedCoins: 0,
    nextAt: 3,
    nextReward: 100,
    sortOrder: 13,
  },
  {
    // THE WEEKLY, and it is here because it is the only set in the game with a
    // TIER FLOOR — the one row whose add buttons can be dark while the player
    // is holding a copy of the card. `ready` is 2 against a requirement of 3
    // even though the collection is full of bronzes, because only the silvers
    // and better count towards it, and a fixture that ignored that would review
    // a row the server cannot send.
    //
    // Part-filled rather than cleared: the interesting state is the one where
    // the reward is visible and out of reach, because that is the moment the
    // set is asking the player to give up a card they have been starting.
    id: 'set-8',
    code: 'weekly-2026-08-24',
    name: 'Proven three',
    family: 'weekly',
    subtitle: 'Week of 24 August',
    season: 2026,
    // The whole mintable pool is the membership: position is not the
    // constraint here, tier is.
    required: 3,
    totalCards: 968,
    committed: 1,
    ready: 2,
    commitPayoutPct: 50,
    minTier: 'silver',
    complete: false,
    // ONE REWARD, at completion, for the same reason the daily has one.
    milestones: [{ pct: 100, cards: 3, coins: 250, reached: false, claimed: false, paid: null }],
    totalReward: 250,
    claimableCoins: 0,
    claimedCoins: 0,
    nextAt: 3,
    nextReward: 250,
    sortOrder: 0,
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

/**
 * A shelf holding one of each kind of pack row.
 *
 * THE POINT OF THE THIRD ROW is the bulk control: a repeatable pack you spend
 * coins on is the only kind that carries ×1/×5/×10, because it is the only kind
 * you could buy twice anyway — see `PackShelf`. Priced at 200 against the kit's
 * 1,240 coin balance so that ×5 is affordable and ×10 is not, which is the pair
 * of states the row's dimming and the money line's shortfall both need.
 *
 * `guaranteed_positions` is jsonb in the database and `unknown` until parsed,
 * so it is written here exactly as the column returns it.
 */
export const SHELF_FIXTURE: ShelfPack[] = [
  {
    id: 'pk-starter',
    code: 'starter',
    name: 'Starter Pack',
    coin_cost: 0,
    card_count: 8,
    once_per_user: true,
    daily_limit: null,
    guaranteed_positions: { qb: 1, rb: 2, wr: 3, te: 1, pk: 1 },
  },
  {
    id: 'pk-daily',
    code: 'daily',
    name: 'Daily Pack',
    coin_cost: 0,
    card_count: 3,
    once_per_user: false,
    daily_limit: 1,
    guaranteed_positions: {},
  },
  {
    id: 'pk-standard',
    code: 'standard',
    name: 'Standard Pack',
    coin_cost: 200,
    card_count: 5,
    once_per_user: false,
    daily_limit: null,
    guaranteed_positions: { qb: 1, wr: 2 },
  },
];

/**
 * How many times each fixture pack has been opened.
 *
 * THE STARTER IS UNSPENT HERE, and it used to be the opposite — one opening, so
 * its button read "Claimed". A spent once-per-player pack does not draw a dead
 * card any more; it leaves the shelf entirely (see `PackShelf`), so a fixture
 * that claimed it would delete the row this section exists to show.
 *
 * The standard pack carries a count instead, which is the head's `opened 12×`
 * state — the only pack kind that can have one, since the other two are capped
 * at one open ever and one open a day.
 */
export const SHELF_OPENINGS = new Map<string, number>([['pk-standard', 12]]);

type ShelfPack = {
  id: string;
  code: string;
  name: string;
  coin_cost: number;
  card_count: number;
  once_per_user: boolean;
  daily_limit: number | null;
  guaranteed_positions: Json;
};

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
  minTier: null,
  burnsThisCopy: true,
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
      // that proves the label shrinks and the coin figure does not.
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
          slotFilled: false, setComplete: false, minTier: null,
          burnsThisCopy: true, canCommit: true,
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
          slotFilled: true, setComplete: false, minTier: null,
          burnsThisCopy: true, canCommit: false,
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
  minTier: null,
  burnsThisCopy: true,
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
  minTier: null,
  burnsThisCopy: true,
  canCommit: true,
};

/** His slot is taken, so the whole row collapses to a sentence saying so. */
/**
 * A set that has met its requirement.
 *
 * The OTHER reason a card cannot go in, and it must not read like the one
 * below: the player is not in this set at all, it simply cannot take another
 * card. The exits say "SET IS FULL" here and "ALREADY IN SET" there, and only
 * the second gets a tick.
 */
export const KIT_SET_COMPLETE: CardActionSet = {
  code: 'daily-pk-2026-08-24',
  name: 'Kicker of the day',
  family: 'daily',
  subtitle: 'Sunday 24 August',
  pays: 4,
  committed: 3,
  required: 3,
  slotFilled: false,
  setComplete: true,
  minTier: null,
  burnsThisCopy: true,
  canCommit: false,
};

/**
 * A set that will not take THIS COPY, which is the third refusal and the only
 * one that is about the player's collection rather than about the set.
 *
 * It exists because the exits row used to know two reasons and reached for
 * "SET IS FULL" for anything that was not "ALREADY IN SET" — so a weekly
 * turning away a bronze would have told the player a set with one card in it
 * was complete. The gallery needs the state to keep that honest.
 */
export const KIT_SET_UNDER_FLOOR: CardActionSet = {
  code: 'weekly-2026-08-24',
  name: 'Proven three',
  family: 'weekly',
  subtitle: 'Week of 24 August',
  // 0, not 4: there is no copy this set would take, so there is nothing to
  // price. A floored offer quoting the bronze would be the bug this fixture
  // guards.
  pays: 0,
  committed: 1,
  required: 3,
  slotFilled: false,
  setComplete: false,
  minTier: 'silver',
  burnsThisCopy: false,
  canCommit: false,
};

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
  minTier: null,
  burnsThisCopy: true,
  canCommit: false,
};

/**
 * A commit plan for the bulk bar's gallery, and it is deliberately the AWKWARD
 * shape rather than the tidy one: three sets, twelve copies ticked but only
 * eight players going in — two second copies, one player already in his set,
 * one belonging to no open set. A plan where everything lines up would show
 * none of the sentences the dialog exists to say.
 */
export const KIT_COMMIT_PLAN: CommitPlan = {
  legs: [
    { setCode: 'team-buf-2026', setName: 'Buffalo Bills', cardIds: ['c1', 'c2', 'c3'], coins: 12 },
    { setCode: 'team-cin-2026', setName: 'Cincinnati Bengals', cardIds: ['c4', 'c5'], coins: 8 },
    {
      setCode: 'daily-wr-2026-08-24',
      setName: 'Receiver of the day',
      cardIds: ['c6', 'c7', 'c8'],
      coins: 120,
    },
  ],
  cards: 8,
  coins: 140,
  // All three reasons a copy stays behind, so the dialog has to say all three.
  alreadyIn: 1,
  noSet: 1,
  duplicate: 2,
  // The four copies the counts above describe, so the leftovers dialog has
  // something to offer selling.
  leftovers: [
    { id: 'left-1', cardId: 'lc1', sellValue: 8, careerFp: 0 },
    { id: 'left-2', cardId: 'lc2', sellValue: 8, careerFp: 0 },
    { id: 'left-3', cardId: 'lc3', sellValue: 40, careerFp: 90 },
    { id: 'left-4', cardId: 'lc4', sellValue: 8, careerFp: 0 },
  ],
  anySpare: true,
};

/**
 * A settled entry, drawn as every state its three lines can be in at once.
 *
 * It is the board's row — `ReadOnlyRow` over `Identity` — so these fixtures
 * have to exercise the two lines the board's own fixtures cannot:
 *
 *   THE FIXTURE, which on a settled row says who won. A win, a loss, a tie, a
 *   BYE, and a card whose server sends no fixture at all. The tie is here
 *   because it is the one result drawn in neither accent and it happens about
 *   twice a season; the bye because it is the only line in the app coloured as
 *   a warning; the last because it is the state every install is in until
 *   `20260831050000` lands, and drawing it as a bye would be the row telling a
 *   confident lie about a card that played.
 *
 *   THE TIER LINE, which is the card's own history. Every branch of
 *   `cardStory`, and the interesting ones cannot be reached by looking at a
 *   real week: a promotion needs a card that crossed a floor THIS contest.
 *
 * And the right column's three figures — the previous total, the gain, and the
 * coins it paid — including the two states that are absences rather than
 * noughts: a week settled but not yet paid, and a card with no history sent.
 *
 * The thresholds are the real ladder — 200 silver, 750 gold, 2500 diamond (see
 * `20260821250000_reachable_tier_ladder`) — and the coin figures are what
 * `award_score_coins` would actually pay at the tier each card held GOING IN, so
 * the arithmetic on screen is the arithmetic that will run in production rather
 * than numbers chosen to look tidy.
 */
export const KIT_ENTRY_SLOTS: PeekEntrySlot[] = [
  /* Ordinary: scored, climbed, still short of the next tier. Paid at BRONZE
     (1.00), which is the tier it went into the week holding — floor(9.8 × 1.5
     × 1.00) = 14, exactly as `award_score_coins` prices it. */
  {
    slot: 'QB', playerId: 'e1', playerName: 'Ty Simpson', pos: 'QB', team: 'LAR',
    tier: 'bronze', points: 9.8, started: true,
    careerFp: 58.3, tierFloorFp: 0, nextTierAt: 200, nextTierLabel: 'silver',
    coins: 14, bonusCoins: null, awarded: true,
    game: { opponent: 'BUF', home: true,  startsAt: null, status: 'final', statusText: 'Final', teamScore: 27, oppScore: 13 },
  },
  /* The moment worth drawing: this contest carried it over the silver floor.
     And it is still PAID AT BRONZE, because the multiplier is the one it held
     going in — the promotion pays from next week. */
  {
    slot: 'RB1', playerId: 'e2', playerName: 'Jeremiyah Love', pos: 'RB', team: 'ARI',
    tier: 'silver', points: 9.8, started: true,
    careerFp: 203.4, tierFloorFp: 200, nextTierAt: 750, nextTierLabel: 'gold',
    coins: 14, bonusCoins: null, awarded: true,
    game: { opponent: 'SF',  home: false, startsAt: null, status: 'final', statusText: 'Final/OT', teamScore: 24, oppScore: 27 },
  },
  /* Landed exactly ON the floor, which is still a promotion. */
  {
    slot: 'RB2', playerId: 'e3', playerName: 'Jonathon Brooks', pos: 'RB', team: 'CAR',
    tier: 'silver', points: 5, started: true,
    careerFp: 200, tierFloorFp: 200, nextTierAt: 750, nextTierLabel: 'gold',
    coins: 7, bonusCoins: null, awarded: true,
    /* A TIE takes the quiet colour. Not a result anybody is pleased or
       sorry about, and a third accent for a state that happens twice a
       season would be a colour nobody learns. */
    game: { opponent: 'NO',  home: true,  startsAt: null, status: 'final', statusText: 'Final', teamScore: 20, oppScore: 20 },
  },
  /* Already inside the tier — climbed, crossed nothing. Silver's 1.10 is what
     makes 16 out of the same 9.8 the bronze rows were paid 14 for, which is
     the whole argument for tier and the reason the figure is worth drawing. */
  {
    slot: 'WR1', playerId: 'e4', playerName: 'Tetairoa McMillan', pos: 'WR', team: 'CAR',
    tier: 'silver', points: 9.8, started: true,
    careerFp: 260, tierFloorFp: 200, nextTierAt: 750, nextTierLabel: 'gold',
    coins: 16, bonusCoins: null, awarded: true,
    game: { opponent: 'ATL', home: false, startsAt: null, status: 'final', statusText: 'Final', teamScore: 31, oppScore: 17 },
  },
  /* A bye. No arrow: the total is a standing figure, not a movement. AND AN
     EARNED NOUGHT, which is not the same as an unpaid row — the line is drawn,
     quietly, because "this card made nothing" is a real answer. */
  {
    slot: 'WR2', playerId: 'e5', playerName: "Tre' Harris", pos: 'WR', team: 'LAC',
    tier: 'bronze', points: 0, started: false,
    careerFp: 48.5, tierFloorFp: 0, nextTierAt: 200, nextTierLabel: 'silver',
    coins: 0, bonusCoins: null, awarded: true,
    /* A BYE: no game at all, so the fixture line says so in the negative
       colour. It is the one row where that line is a warning rather than a
       report, and the only place in the app that ever mentions a bye. */
    game: null,
  },
  /* Top tier: nothing above it to count toward. The best week on the board and
     the only one with a POSITION BONUS on it — 46 for the points at diamond's
     1.40, plus 60 for finishing top of the tight ends, drawn as the 106 the
     card actually made. */
  {
    slot: 'TE', playerId: 'e6', playerName: 'Brock Bowers', pos: 'TE', team: 'LV',
    tier: 'diamond', points: 22.1, started: true,
    careerFp: 2610.4, tierFloorFp: 2500, nextTierAt: null, nextTierLabel: null,
    coins: 46, bonusCoins: 60, awarded: true,
    game: { opponent: 'KC',  home: true,  startsAt: null, status: 'final', statusText: 'Final', teamScore: 34, oppScore: 28 },
  },
  /* SETTLED, NOT YET PAID. The state a week spends its first minutes in: the
     scores are final and `award_score_coins` has not run, so there is no money
     line at all. A nought here would tell a player their week paid nothing at
     the exact moment they came to find out what it paid. */
  {
    slot: 'FLEX', playerId: 'e7', playerName: 'Rome Odunze', pos: 'WR', team: 'CHI',
    tier: 'gold', points: 17.6, started: true,
    careerFp: 812.5, tierFloorFp: 750, nextTierAt: 2500, nextTierLabel: 'diamond',
    coins: null, bonusCoins: null, awarded: false,
    game: { opponent: 'GB',  home: false, startsAt: null, status: 'final', statusText: 'Final', teamScore: 21, oppScore: 14 },
  },
  /* A SERVER THAT SENDS NONE OF IT. 20260831020000 (the career), 040000 (the
     money) and 050000 (the fixture) are all applied now, so nothing reaches
     this state in production — it is kept because the row's contract is that
     an absent column goes QUIET rather than being guessed at, and that
     contract is only checkable if something exercises it. The failure it
     guards against is specific: `game` undefined drawn as `game` null would
     put "BYE — no game this week" in red on a card that scored 12.4. */
  {
    slot: 'FLEX2', playerId: 'e8', playerName: 'Emeka Egbuka', pos: 'WR', team: 'TB',
    tier: 'bronze', points: 12.4, started: true,
    careerFp: null, tierFloorFp: null, nextTierAt: null, nextTierLabel: null,
    coins: null, bonusCoins: null, awarded: false,
    /* AND NO FIXTURE EITHER, which is the state that must not be drawn as a
       bye: `game` is UNDEFINED rather than null, so the line is left blank
       instead of claiming in red that a card which scored 12.4 did not play. */
  },
];

/**
 * Unseen results, as the welcome-back banner receives them.
 *
 * FOUR SETS, because the banner's sentence changes shape with the count and
 * with what is in it, and only one of those shapes can be reached by waiting
 * for a Sunday. A single win, a single loss, a mixed week, and the player back
 * after a fortnight whose marks are capped with a count.
 *
 * The last row carries a NULL result — a field too small to be a contest
 * produces no result at all, and the banner has to word that as "finished"
 * rather than as a loss. It is the sentence most likely to be got wrong and the
 * least likely to occur while anybody is looking.
 *
 * `finalizedAt` is a fixed string rather than a computed one: `new Date()` in a
 * module the gallery imports would make this file's output differ between two
 * renders of the same screen.
 */
const settled = (
  n: number,
  name: string,
  result: 'W' | 'L' | 'T' | null,
  points: number,
): HistoryEntry => ({
  contestId: `kit-unseen-${n}`,
  code: `KIT${n}`,
  name,
  kind: 'lobby',
  season: 2026,
  seasonType: 'preseason',
  week: 4,
  points,
  rank: result === 'W' ? 2 : 14,
  entrants: result === null ? 1 : 26,
  result,
  heartsDelta: result === 'W' ? 1 : result === 'L' ? -1 : 0,
  prizeCoins: result === 'W' ? 120 : null,
  finalizedAt: '2026-08-31T10:00:00.000Z',
});

export const KIT_UNSEEN_SETS: HistoryEntry[][] = [
  [settled(1, 'Flex Three', 'W', 118.4)],
  [settled(2, 'WR Room', 'L', 71.9)],
  [
    settled(3, 'Flex Three', 'W', 118.4),
    settled(4, 'WR Room', 'L', 71.9),
    settled(5, 'The Free One', 'T', 88.2),
  ],
  [
    settled(6, 'Flex Three', 'W', 118.4),
    settled(7, 'WR Room', 'L', 71.9),
    settled(8, 'The Free One', 'T', 88.2),
    settled(9, 'Deep League', 'W', 131.0),
    settled(10, 'Kicker Special', 'L', 44.5),
    settled(11, 'Week One Special', null, 88.2),
  ],
];
