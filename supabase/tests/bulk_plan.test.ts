import { assertEquals } from 'jsr:@std/assert@1';
import {
  planCommits,
  sellTotal,
  type PlannableActions,
  type PlannableCard,
  type PlannableSet,
} from '../../src/components/collection/bulk.ts';

/**
 * Routing a multi-selection into `commit_cards_to_set` calls.
 *
 * This is the one piece of the bulk feature with no server equivalent to defer
 * to: the RPC takes ONE set, and a selection out of the inventory is twenty
 * spares off fourteen clubs. Every rule below exists because getting it wrong
 * sends the server a call it will refuse — and a bulk action whose refusals are
 * routine is one nobody can read the result of.
 */

const card = (
  id: string,
  cardId: string,
  sellValue: number,
  careerFp = 0,
): PlannableCard => ({
  id,
  cardId,
  sellValue,
  careerFp,
});

const set = (code: string, name: string, pays: number, canCommit = true): PlannableSet => ({
  code,
  name,
  pays,
  canCommit,
});

const offers = (
  id: string,
  /* Named for the reader: the map is keyed by INSTANCE, and every test below
     passes the card id beside it so the two are visible together. */
  _cardId: string,
  sets: PlannableSet[],
  burnsThisCopy = true,
): [string, PlannableActions] => [
  id,
  { burnsThisCopy, sets },
];

Deno.test('groups a mixed selection into one leg per set', () => {
  const cards = [card('i1', 'c1', 8), card('i2', 'c2', 8), card('i3', 'c3', 8)];
  const actions = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    offers('i2', 'c2', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    offers('i3', 'c3', [set('team-kc-2026', 'Kansas City Chiefs', 4)]),
  ]);

  const plan = planCommits(cards, actions);

  assertEquals(plan.legs.length, 2);
  assertEquals(plan.cards, 3);
  assertEquals(plan.gems, 12);
  // Alphabetical by set name, so the confirmation reads the same way twice.
  assertEquals(plan.legs[0].setName, 'Buffalo Bills');
  assertEquals(plan.legs[0].cardIds.sort(), ['c1', 'c2']);
  assertEquals(plan.legs[1].cardIds, ['c3']);
});

Deno.test('a card in two sets goes to the first the server listed', () => {
  // `card_actions` orders dailies ahead of team sets — the one that expires at
  // midnight wins. Sending the card to both would send it twice.
  const actions = new Map([
    offers('i1', 'c1', [
      set('daily-wr-2026-08-24', 'Receiver of the day', 40),
      set('team-buf-2026', 'Buffalo Bills', 4),
    ]),
  ]);

  const plan = planCommits([card('i1', 'c1', 8)], actions);

  assertEquals(plan.legs.length, 1);
  assertEquals(plan.legs[0].setName, 'Receiver of the day');
  assertEquals(plan.gems, 40);
});

Deno.test('three copies of one player fill his slot once', () => {
  // A set slot is a PLAYER. Ticking all three copies is reasonable; sending all
  // three is not — the server would refuse two as "already in this set".
  const cards = [card('i1', 'c1', 8), card('i2', 'c1', 8), card('i3', 'c1', 8)];
  const actions = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    offers('i2', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    offers('i3', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
  ]);

  const plan = planCommits(cards, actions);

  assertEquals(plan.cards, 1);
  assertEquals(plan.legs[0].cardIds, ['c1']);
  // And the other two are REPORTED, not silently dropped.
  assertEquals(plan.duplicate, 2);
  assertEquals(plan.noSet, 0);
});

Deno.test('sends the cheapest copy first within a leg', () => {
  // `commit_cards_to_set` walks the array front to back and refuses the tail
  // once the requirement is met, so this order decides which cards survive a
  // set that fills up mid-call.
  const cards = [
    card('i1', 'c1', 150, 400),
    card('i2', 'c2', 8, 0),
    card('i3', 'c3', 40, 90),
  ];
  const actions = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 75)]),
    offers('i2', 'c2', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    offers('i3', 'c3', [set('team-buf-2026', 'Buffalo Bills', 20)]),
  ]);

  const plan = planCommits(cards, actions);

  assertEquals(plan.legs[0].cardIds, ['c2', 'c3', 'c1']);
});

Deno.test('keeps the cheapest copy when deduping a player', () => {
  // Same rule, applied across copies of ONE card: the expensive one stays in
  // the collection. A mis-tick must never cost the better card.
  const cards = [card('i1', 'c1', 150, 400), card('i2', 'c1', 8, 0)];
  const actions = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 75)]),
    offers('i2', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
  ]);

  const plan = planCommits(cards, actions);

  assertEquals(plan.cards, 1);
  // Priced off the copy that is actually going.
  assertEquals(plan.gems, 4);
  assertEquals(plan.duplicate, 1);
});

Deno.test('counts cards no set can take, separately from duplicates', () => {
  const cards = [card('i1', 'c1', 8), card('i2', 'c2', 8), card('i3', 'c3', 8)];
  const actions = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)]),
    // Belongs to a set that cannot take him.
    offers('i2', 'c2', [set('team-kc-2026', 'Kansas City Chiefs', 4, false)]),
    // Belongs to no set at all.
    offers('i3', 'c3', []),
  ]);

  const plan = planCommits(cards, actions);

  assertEquals(plan.cards, 1);
  assertEquals(plan.noSet, 2);
  assertEquals(plan.duplicate, 0);
});

Deno.test('a card with no offers at all is left alone, not assumed eligible', () => {
  // The read can come back empty — `readCardActions` answers an outage with an
  // empty map rather than throwing. Nothing may be planned from that.
  const plan = planCommits([card('i1', 'c1', 8)], new Map());

  assertEquals(plan.legs.length, 0);
  assertEquals(plan.cards, 0);
  assertEquals(plan.noSet, 1);
});

Deno.test('flags a plan that burns a copy other than the one ticked', () => {
  const withSpare = new Map([
    offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)], false),
  ]);
  assertEquals(planCommits([card('i1', 'c1', 8)], withSpare).anySpare, true);

  const noSpare = new Map([offers('i1', 'c1', [set('team-buf-2026', 'Buffalo Bills', 4)])]);
  assertEquals(planCommits([card('i1', 'c1', 8)], noSpare).anySpare, false);
});

Deno.test('sums what the ticked copies sell for', () => {
  assertEquals(sellTotal([card('i1', 'c1', 8), card('i2', 'c2', 150)]), 158);
  assertEquals(sellTotal([]), 0);
});
