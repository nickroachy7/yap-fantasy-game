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
