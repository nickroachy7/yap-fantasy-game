/**
 * The words the sell dialog puts around a price.
 *
 * ITS OWN FILE, AND WITH NO `@/` IMPORTS, for the same reason `bulk.ts` has
 * none: the Deno unit suites resolve real paths and cannot follow the alias, so
 * anything that wants a unit test has to be reachable without it. The parameter
 * is structural rather than `CardProfile['card']` so this file needs to import
 * nothing at all.
 */

/**
 * The sale, in a sentence, with its working shown.
 *
 * A price used to be one flat number per tier, so "you will receive 8 coins"
 * needed no account of itself. Since 20260902060000 it is
 * (what the player is worth + what this copy has earned) x its tier, and a
 * diamond that reads 1271 where it read 500 is a number nobody will believe
 * without being told where it came from.
 *
 * THE PARTS ARE QUOTED, NOT RECONCILED. The tier multiplies their sum and the
 * result is floored, so base + points does not equal the total and must not be
 * presented as though it should. "…, multiplied by its diamond tier" carries
 * that without inviting the arithmetic.
 *
 * A card that has never started has no points half, and listing a zero there
 * would be noise on the most common case in the game — so it gets the plain
 * sentence it always had.
 */
export function sellBreakdown(k: {
  sellValue: number;
  baseCoins: number | null;
  fpCoins: number | null;
  tier: string;
  nextTierLabel: string | null;
  nextTierSellValue: number | null;
}): string {
  const parts =
    k.baseCoins != null && k.fpCoins != null && k.fpCoins > 0
      ? `You will receive ${k.sellValue} coins — ${k.baseCoins} for the player and ${k.fpCoins} for what this copy has earned, multiplied by its ${k.tier} tier.`
      : `You will receive ${k.sellValue} coins.`;

  /* THE COUNTER-ARGUMENT, and it belongs in the sell dialog rather than being
     kept out of it. The next-tier figure is priced at that tier's floor — the
     points the copy must settle to arrive — so it is what the card is worth if
     it is played rather than sold, which is the decision actually being made. */
  const next =
    k.nextTierLabel && k.nextTierSellValue != null && k.nextTierSellValue > k.sellValue
      ? ` Played up to ${k.nextTierLabel}, it would sell for ${k.nextTierSellValue}.`
      : '';

  return parts + next;
}
