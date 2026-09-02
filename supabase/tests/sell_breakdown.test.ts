import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { sellBreakdown } from '../../src/components/players/sell-copy.ts';

/**
 * The sentence the sell dialog puts in front of somebody about to destroy a
 * card for coins.
 *
 * It is a pure string function and it is tested because the number in it moved
 * by a factor of two and a half. Before 20260902060000 a price was a flat
 * per-tier constant — 8, 40, 150, 500 — and "you will receive 500 coins" needed
 * no account of itself. It is now
 * (what the player is worth + what this copy has earned) x its tier, so the
 * same diamond reads 1271, and the only thing standing between that and a
 * support message is this sentence.
 */

const card = (over: Partial<Parameters<typeof sellBreakdown>[0]> = {}) => ({
  sellValue: 8,
  baseCoins: 8,
  fpCoins: 0,
  tier: 'bronze',
  nextTierLabel: null,
  nextTierSellValue: null,
  ...over,
});

Deno.test('a card that has never started gets the plain sentence', () => {
  // THE MOST COMMON CASE IN THE GAME. Every pull is bronze with no points, so
  // listing "and 0 for what this copy has earned" would put noise on the
  // majority of cards to serve the minority.
  assertEquals(sellBreakdown(card()), 'You will receive 8 coins.');
});

Deno.test('a card that has earned shows both halves and names the multiplier', () => {
  const s = sellBreakdown(card({
    sellValue: 1271, baseCoins: 8, fpCoins: 900, tier: 'diamond',
  }));
  assertStringIncludes(s, '1271 coins');
  assertStringIncludes(s, '8 for the player');
  assertStringIncludes(s, '900 for what this copy has earned');
  // NAMED, NOT SHOWN. The tier multiplies the sum and the result is floored, so
  // 8 + 900 does not equal 1271 and the copy must not invite that subtraction.
  assertStringIncludes(s, 'multiplied by its diamond tier');
});

Deno.test('the parts are never presented as arithmetic that closes', () => {
  const s = sellBreakdown(card({
    sellValue: 1271, baseCoins: 8, fpCoins: 900, tier: 'diamond',
  }));
  // No "=" and no "+": either one turns a quoted breakdown into a sum a player
  // can check and find wrong.
  assertEquals(s.includes('='), false);
  assertEquals(s.includes('+'), false);
});

Deno.test('the next tier is offered as the reason not to sell', () => {
  const s = sellBreakdown(card({
    sellValue: 34, baseCoins: 34, fpCoins: 0,
    nextTierLabel: 'silver', nextTierSellValue: 119,
  }));
  assertStringIncludes(s, 'Played up to silver, it would sell for 119.');
});

Deno.test('a next tier worth no more than today is left unsaid', () => {
  // Diamond has no next tier at all, and a lower figure would be an argument
  // for selling — which the sell dialog does not need to make.
  assertEquals(
    sellBreakdown(card({ nextTierLabel: 'silver', nextTierSellValue: 8 })),
    'You will receive 8 coins.',
  );
  assertEquals(
    sellBreakdown(card({ sellValue: 1271, tier: 'diamond', baseCoins: 8, fpCoins: 900 }))
      .includes('Played up to'),
    false,
  );
});

Deno.test('missing parts fall back rather than printing null', () => {
  // card_profile returns these as jsonb and the coercion is null-preserving, so
  // an older server or a card the view could not price must not render
  // "null for the player".
  const s = sellBreakdown(card({ sellValue: 91, baseCoins: null, fpCoins: null }));
  assertEquals(s, 'You will receive 91 coins.');
});
