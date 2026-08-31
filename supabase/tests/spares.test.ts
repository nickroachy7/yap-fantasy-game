import { assertEquals } from 'jsr:@std/assert@1';
import { spareIds, type RankableCard } from '../../src/components/collection/spares.ts';

/**
 * Which copies the Spares chip marks.
 *
 * THE ONLY THING THIS SUITE IS PROTECTING is agreement with a SQL `ORDER BY` in
 * another directory. `commit_candidate` burns
 *
 *     order by ci.career_fp asc, ci.acquired_at asc, ci.id asc
 *
 * and the copy this function KEEPS is the one that ordering never reaches. Get
 * the terms in the wrong order — or reach for tier, which is the obvious way to
 * rank cards and is not the server's way — and the chip marks a copy a commit
 * would keep while hiding one it would burn. That is a filter that walks the
 * player into losing their best card in a sweep they were told was safe, and
 * nothing about the screen would look wrong while it happened.
 */

let seq = 0;
const card = (over: Partial<RankableCard> = {}): RankableCard => ({
  id: `i${(seq += 1)}`,
  cardId: 'c1',
  playerName: 'Someone',
  careerFp: 0,
  acquiredAt: 0,
  ...over,
});

Deno.test('a single copy is never spare', () => {
  const only = card({ id: 'a' });
  assertEquals(spareIds([only]), new Set());
});

Deno.test('the highest career FP is kept, the rest are spare', () => {
  const best = card({ id: 'best', careerFp: 300 });
  const mid = card({ id: 'mid', careerFp: 120 });
  const worst = card({ id: 'worst', careerFp: 4 });

  assertEquals(spareIds([mid, worst, best]), new Set(['mid', 'worst']));
});

Deno.test('input order does not decide the keeper', () => {
  const best = card({ id: 'best', careerFp: 300 });
  const worst = card({ id: 'worst', careerFp: 4 });

  assertEquals(spareIds([best, worst]), spareIds([worst, best]));
});

Deno.test('career FP outranks tier — the server does not look at tier', () => {
  /* The trap this exists for. A gold copy that has never started is EXPENDABLE
     to `commit_candidate`, which sorts on career_fp alone; ranking by tier here
     would keep it and burn the bronze that has earned 200. Tier is not even a
     field on `RankableCard`, which is the structural half of the same point. */
  const goldButIdle = card({ id: 'gold', careerFp: 0 });
  const bronzeWorkhorse = card({ id: 'bronze', careerFp: 200 });

  assertEquals(spareIds([goldButIdle, bronzeWorkhorse]), new Set(['gold']));
});

Deno.test('a career FP tie is broken by the older copy being spent first', () => {
  const older = card({ id: 'older', careerFp: 50, acquiredAt: 1_000 });
  const newer = card({ id: 'newer', careerFp: 50, acquiredAt: 9_000 });

  assertEquals(spareIds([newer, older]), new Set(['older']));
});

Deno.test('a total tie falls to the id, so the answer is stable', () => {
  const a = card({ id: 'aaa', careerFp: 7, acquiredAt: 5 });
  const b = card({ id: 'bbb', careerFp: 7, acquiredAt: 5 });

  assertEquals(spareIds([a, b]), new Set(['aaa']));
  assertEquals(spareIds([b, a]), new Set(['aaa']));
});

Deno.test('different printed cards are not each other spares', () => {
  /* Two seasons of one footballer are two cards, and a set slot is keyed on the
     printed card — so neither is a duplicate of the other. Same unit
     `summarise` counts duplicates in. */
  const y2025 = card({ id: 'a', cardId: 'c-2025', playerName: 'Same Man', careerFp: 10 });
  const y2026 = card({ id: 'b', cardId: 'c-2026', playerName: 'Same Man', careerFp: 90 });

  assertEquals(spareIds([y2025, y2026]), new Set());
});

Deno.test('a missing card_id groups by name rather than collapsing to one pile', () => {
  /* Every such row would otherwise share the key `null` and the whole lot would
     read as copies of one player. */
  const a1 = card({ id: 'a1', cardId: null, playerName: 'Alpha', careerFp: 1 });
  const a2 = card({ id: 'a2', cardId: null, playerName: 'Alpha', careerFp: 9 });
  const b1 = card({ id: 'b1', cardId: null, playerName: 'Beta', careerFp: 5 });

  assertEquals(spareIds([a1, a2, b1]), new Set(['a1']));
});

Deno.test('three copies leave exactly one keeper', () => {
  const cards = [
    card({ id: 'x', careerFp: 1 }),
    card({ id: 'y', careerFp: 2 }),
    card({ id: 'z', careerFp: 3 }),
  ];

  assertEquals(spareIds(cards), new Set(['x', 'y']));
});

Deno.test('an empty collection has no spares', () => {
  assertEquals(spareIds([]), new Set());
});
