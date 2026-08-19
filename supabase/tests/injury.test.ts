import { assertEquals } from 'jsr:@std/assert@1';
import { injuryAbbr, injuryCode, injuryWeight } from '../../src/lib/injury.ts';

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

/* ---- injuryCode ------------------------------------------------------- *
 * The mark at the end of a lineup row's fixture line. It has room for three
 * characters and no more, and — unlike the abbreviation — it has to stay
 * DISTINCT, because at one character the codes are close enough together that
 * a collision would be invisible rather than obviously wrong.                */

Deno.test('every status the feed emits codes to at most three characters', () => {
  for (const [status] of FEED) {
    const code = injuryCode(status);
    assertEquals(
      code.length <= 3,
      true,
      `${status} -> ${code} is ${code.length} chars, too wide for a fixture line`,
    );
    assertEquals(code.length > 0, true, `${status} produced an empty code`);
  }
});

Deno.test('no two designations share a code', () => {
  // Every status the app can be handed, not just the ones the feed emits
  // today: two designations collapsing to one letter is a warning that lies.
  const all = [
    'Questionable',
    'Doubtful',
    'Probable',
    'Limited',
    'Day-To-Day',
    'Out',
    'IR',
    'Injured Reserve',
    'PUP-P',
    'NFI-A',
    'Reserve-Sus',
    'Reserve-DNR',
  ];
  const seen = new Map<string, string>();
  for (const status of all) {
    const code = injuryCode(status);
    const prior = seen.get(code);
    // `IR` and `Injured Reserve` are the same designation spelled two ways,
    // and SHOULD collide. Nothing else may.
    const sameThing =
      prior !== undefined && [prior, status].every((s) => /^(ir|injured reserve)$/i.test(s));
    assertEquals(
      prior === undefined || sameThing,
      true,
      `${status} and ${prior} both code to ${code}`,
    );
    seen.set(code, status);
  }
});

Deno.test('doubtful and day-to-day do not collapse, being opposite weights', () => {
  assertEquals(injuryWeight('Doubtful'), 'blocking');
  assertEquals(injuryWeight('Day-To-Day'), 'advisory');
  assertEquals(injuryCode('Doubtful') === injuryCode('Day-To-Day'), false);
});

Deno.test('codes are the designations, not arbitrary prefixes', () => {
  assertEquals(injuryCode('Questionable'), 'Q');
  assertEquals(injuryCode('Out'), 'O');
  assertEquals(injuryCode('Doubtful'), 'D');
  assertEquals(injuryCode('IR'), 'IR');
  assertEquals(injuryCode('Injured Reserve'), 'IR');
  assertEquals(injuryCode('PUP-R'), 'PUP');
  assertEquals(injuryCode('NFI-A'), 'NFI');
});

Deno.test('case and whitespace do not change the code', () => {
  assertEquals(injuryCode('  questionable  '), 'Q');
  assertEquals(injuryCode('OUT'), 'O');
});

Deno.test('an unrecognised designation is shortened, never dropped', () => {
  const code = injuryCode('Some New Designation');
  assertEquals(code.length <= 3, true);
  assertEquals(code.length > 0, true);
});
