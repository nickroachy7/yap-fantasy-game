/**
 * Turning a `sell_card` refusal into something a person can act on.
 *
 * The function raises with a short technical sentence, which is the right thing
 * for it to do — it is an API, and the client is not the only caller. But
 * "card is in a lineup that has not been scored yet" tells someone what
 * happened and not what to do about it, so the mapping lives here rather than
 * inline in a component: there will be a second sell surface (a bulk sell in
 * the inventory is the obvious next one) and both must say the same thing.
 *
 * Matched on a distinctive fragment rather than on the SQLSTATE, because
 * PostgREST surfaces the message reliably and the code only sometimes.
 */
export function sellErrorMessage(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase();

  if (s.includes('not been scored')) {
    return 'This card is in a lineup that has not been scored yet. You can sell it once the week is settled.';
  }
  if (s.includes('already been sold')) {
    return 'You have already sold this copy. Pull to refresh.';
  }
  if (s.includes('does not belong to you')) {
    return 'That card is no longer in your collection.';
  }
  if (s.includes('not authenticated')) {
    return 'Your session has expired. Sign in again to sell.';
  }
  if (s.includes('no wallet')) {
    return 'Your coin wallet is missing, so there is nowhere to pay the sale into. Contact support.';
  }
  // Anything unmapped is surfaced verbatim rather than replaced by a shrug:
  // a wrong-but-friendly message is harder to debug than an ugly true one.
  return raw?.trim() || 'The sale could not be completed.';
}
