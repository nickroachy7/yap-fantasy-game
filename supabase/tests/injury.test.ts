import { assertEquals } from 'jsr:@std/assert@1';
import { injuryAbbr, injuryWeight } from '../../src/lib/injury.ts';

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

/* ---- injuryAbbr ------------------------------------------------------- *
 * The flag on a compact card has ~92px. At 10px bold the budget is six
 * characters plus the marker glyph, so every abbreviation must fit in six.  */

Deno.test('every status the feed emits abbreviates to at most six characters', () => {
  for (const [status] of FEED) {
    const abbr = injuryAbbr(status);
    assertEquals(
      abbr.length <= 6,
      true,
      `${status} -> ${abbr} is ${abbr.length} chars, too wide for a compact card`,
    );
  }
});

Deno.test('abbreviations are the designations, not arbitrary prefixes', () => {
  assertEquals(injuryAbbr('Questionable'), 'QUES');
  assertEquals(injuryAbbr('Doubtful'), 'DOUB');
  assertEquals(injuryAbbr('Out'), 'OUT');
  assertEquals(injuryAbbr('IR'), 'IR');
  assertEquals(injuryAbbr('Reserve-Sus'), 'SUSP');
  assertEquals(injuryAbbr('Reserve-DNR'), 'RES');
});

Deno.test('already-short designations are passed through unchanged', () => {
  for (const s of ['PUP-P', 'PUP-R', 'NFI-A', 'NFI-R']) {
    assertEquals(injuryAbbr(s), s.toUpperCase());
  }
});

Deno.test('case and whitespace do not change the abbreviation', () => {
  assertEquals(injuryAbbr('  questionable  '), 'QUES');
  assertEquals(injuryAbbr('OUT'), 'OUT');
});

Deno.test('an unrecognised designation is shortened, never dropped', () => {
  const abbr = injuryAbbr('Some New Designation');
  assertEquals(abbr.length <= 6, true);
  assertEquals(abbr.length > 0, true);
});
