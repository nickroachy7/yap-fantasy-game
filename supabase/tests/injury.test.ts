import { assertEquals } from 'jsr:@std/assert@1';
import { injuryWeight } from '../../src/lib/injury.ts';

// Every status observed in the live feed, with its expected weight. If the
// provider adds a designation, add it here first and watch this fail.
const FEED: [string, 'blocking' | 'advisory'][] = [
  ['Questionable', 'advisory'],
  ['IR', 'blocking'],
  ['PUP-P', 'blocking'],
  ['PUP-R', 'blocking'],
  ['NFI-A', 'blocking'],
  ['NFI-R', 'blocking'],
  ['Reserve-Sus', 'blocking'],
  ['Reserve-DNR', 'blocking'],
  ['Out', 'blocking'],
];

Deno.test('classifies every status the feed actually emits', () => {
  for (const [status, expected] of FEED) {
    assertEquals(injuryWeight(status), expected, `${status} should be ${expected}`);
  }
});

Deno.test('a healthy player has no weight at all', () => {
  assertEquals(injuryWeight(null), null);
  assertEquals(injuryWeight(undefined), null);
  assertEquals(injuryWeight(''), null);
  assertEquals(injuryWeight('   '), null);
});

Deno.test('suffixed reserve designations are blocking, not advisory', () => {
  // The bug this guards: exact-match sets classified 122 unavailable players
  // as a mild advisory because they only matched the bare stem.
  for (const s of ['PUP-P', 'PUP-R', 'NFI-A', 'NFI-R', 'Reserve-Sus', 'Reserve-DNR']) {
    assertEquals(injuryWeight(s), 'blocking', `${s} must block`);
  }
});

Deno.test('case and whitespace do not change the answer', () => {
  assertEquals(injuryWeight('  questionable  '), 'advisory');
  assertEquals(injuryWeight('OUT'), 'blocking');
  assertEquals(injuryWeight('pup-p'), 'blocking');
});

Deno.test('an unrecognised status degrades to advisory rather than silence', () => {
  assertEquals(injuryWeight('Some New Designation'), 'advisory');
});
