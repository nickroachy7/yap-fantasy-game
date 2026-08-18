/**
 * Injury status classification (build plan task 25).
 *
 * Pure and shared so it can be unit tested and reused: the lineup screen is not
 * the only place that will need to know how serious a designation is.
 *
 * Two weights on purpose. `Questionable` is the single most common status in the
 * feed (196 of 330 flagged players), so giving it the same alarm as `Out` would
 * train people to ignore the alarm entirely.
 */
export type InjuryWeight = 'blocking' | 'advisory' | null;

/**
 * Matched by prefix, against the vocabulary the feed actually emits:
 *   Questionable, IR, PUP-P, PUP-R, NFI-A, NFI-R, Reserve-Sus, Reserve-DNR, Out
 *
 * An earlier exact-match version missed every suffixed form and classified 122
 * definitively-unavailable players as a mild advisory. Prefix matching also
 * survives the feed inventing `PUP-X` next season.
 */
export function injuryWeight(status: string | null | undefined): InjuryWeight {
  if (!status) return null;
  const s = status.trim().toLowerCase();
  if (!s) return null;

  if (
    s === 'ir' ||
    s.startsWith('injured reserve') ||
    s.startsWith('out') ||
    s.startsWith('doubtful') ||
    s.startsWith('pup') ||
    s.startsWith('nfi') ||
    s.startsWith('reserve') ||
    s.startsWith('suspend')
  ) {
    return 'blocking';
  }

  if (
    s.startsWith('questionable') ||
    s.startsWith('limited') ||
    s.startsWith('probable') ||
    s.startsWith('day')
  ) {
    return 'advisory';
  }

  // Unknown labels surface rather than vanish: the feed adds designations and
  // silence is the worst failure mode for an injury warning.
  return 'advisory';
}

/**
 * Short form of a designation, for places too narrow to print it in full.
 *
 * The compact inventory card is 106pt wide, which leaves ~92px for the flag —
 * `○ QUESTIONABLE` measures 102px there and was rendering as `○ QUESTIONA…`,
 * ellipsising the one word that carries the meaning. Abbreviating is better
 * than truncating because the cut point is chosen rather than incidental.
 *
 * Prefix-matched against the same vocabulary as `injuryWeight`, and kept in
 * this file for the same reason: two screens must never disagree about what a
 * designation is called. Callers keep the FULL status in the accessibility
 * label — this is a visual abbreviation, not a data one.
 */
export function injuryAbbr(status: string): string {
  const s = status.trim().toLowerCase();

  if (s.startsWith('questionable')) return 'QUES';
  if (s.startsWith('doubtful')) return 'DOUB';
  if (s.startsWith('probable')) return 'PROB';
  if (s.startsWith('limited')) return 'LTD';
  if (s.startsWith('day')) return 'DTD';
  if (s.startsWith('out')) return 'OUT';
  if (s === 'ir' || s.startsWith('injured reserve')) return 'IR';
  if (s.startsWith('suspend')) return 'SUSP';
  if (s.startsWith('reserve-sus')) return 'SUSP';
  if (s.startsWith('reserve')) return 'RES';

  // PUP-P, PUP-R, NFI-A, NFI-R are already at their short form.
  const upper = status.trim().toUpperCase();

  // An unrecognised designation is clipped rather than dropped: silence is the
  // worst failure mode for an injury warning, and the a11y label still has it.
  return upper.length <= 6 ? upper : upper.slice(0, 5);
}
