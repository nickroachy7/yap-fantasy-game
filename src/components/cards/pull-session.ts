/**
 * The one pull that is happening, published so a different screen can draw it.
 *
 * WHY A STORE AND NOT A ROUTE PARAM
 *
 * Opening a pack is now two screens: `/packs` holds the shelf and does the
 * spending, `/pull` holds the ceremony and the cards. The second needs
 * everything the first learns — five to fifty minted rows, how far through a
 * bulk buy the volley is, and whichever refusal stopped it — and none of that
 * fits in a URL.
 *
 * IT CANNOT BE A PARAM FOR A SECOND, HARDER REASON. A route carrying
 * `?code=starter&count=10` is a route that OPENS TEN PACKS WHEN IT IS
 * RELOADED, and this app ships to a browser where reload is a keystroke. The
 * spend has to stay on the screen with the button on it; a reloaded `/pull`
 * finds no session and says so, which costs nothing.
 *
 * THE SHELF GOES ON RUNNING WHILE THE CEREMONY PLAYS. `/pull` is pushed over
 * `/packs` rather than replacing it, so the loop in `packs.tsx` is still
 * mounted and still awaiting — it publishes each pack as it lands and the
 * ceremony counts them in. That is the whole reason the navigation happens
 * BEFORE the first `open_pack` rather than after the last: a bulk buy of ten is
 * ten round trips, and a player who pressed a button should be watching
 * something during them.
 *
 * ONE AT A TIME, AND THE NONCE IS WHY. There is exactly one live session — you
 * cannot open a second pack while the first is on screen — but a stale write
 * from an abandoned volley must not land on the one that replaced it. Every
 * update names the session it belongs to and is dropped if that is not the
 * current one.
 */
import { useSyncExternalStore } from 'react';

import type { Pulled } from './PackShelf';

export type PullSession = {
  /** Identifies this opening. Also the remount key for everything below it. */
  nonce: string;
  /** What was pressed, for the ceremony to name. */
  packName: string;
  /** How many packs the press bought. */
  requested: number;
  /**
   * Career FP the silver tier starts at, so the pull page can draw a card's
   * climb without asking for it again.
   *
   * CARRIED RATHER THAN RE-READ. It is a row in `tier_thresholds` that the
   * shelf has already fetched, and the pull page needs it during the ceremony —
   * a second round trip for a number sitting in memory one screen away would
   * be a spinner on a card that has nothing to wait for.
   */
  silverAt: number;
  /** How many of them have landed. */
  opened: number;
  /** Everything minted so far, in the order it was dealt. */
  cards: Pulled[];
  /**
   * `opening` while the volley runs, `ready` once it has stopped for any
   * reason. There is no `failed`: a volley that opened three of ten is both —
   * three real cards and a refusal — and a status that could only say one of
   * those would have to lie about the other. `refusal` carries the second half.
   */
  status: 'opening' | 'ready';
  /** Why the volley stopped early, in the server's own words. */
  refusal: string | null;
};

let session: PullSession | null = null;
const listeners = new Set<() => void>();
let counter = 0;

function publish(next: PullSession | null) {
  session = next;
  for (const fire of listeners) fire();
}

/** Start a session and take its nonce. The caller navigates, then fills it in. */
export function beginPull(packName: string, requested: number, silverAt: number): string {
  counter += 1;
  const nonce = `pull-${counter}`;
  publish({
    nonce,
    packName,
    requested,
    silverAt,
    opened: 0,
    cards: [],
    status: 'opening',
    refusal: null,
  });
  return nonce;
}

/** One pack landed. Ignored if the session has since been replaced. */
export function advancePull(nonce: string, cards: Pulled[]) {
  if (!session || session.nonce !== nonce) return;
  publish({ ...session, opened: session.opened + 1, cards: [...session.cards, ...cards] });
}

/** The volley has stopped, whether it finished or was refused. */
export function finishPull(nonce: string, refusal: string | null) {
  if (!session || session.nonce !== nonce) return;
  publish({ ...session, status: 'ready', refusal });
}

/**
 * Throw the session away.
 *
 * Called when a volley opened NOTHING — the shelf keeps the reader and shows
 * the refusal under the button, so a `/pull` left holding an empty session
 * would be a ceremony for no cards. `/pull` watches for this and shows itself
 * out. Also called when the pull page is done with, so returning to it by any
 * route does not replay a pack that has already been dealt with.
 */
export function endPull() {
  publish(null);
}

const subscribe = (fire: () => void) => {
  listeners.add(fire);
  return () => {
    listeners.delete(fire);
  };
};

const read = () => session;

/**
 * The live session, or null.
 *
 * `useSyncExternalStore` rather than a context: the publisher is a screen and
 * the reader is a DIFFERENT screen presented over it, so there is no component
 * that could hold both without being the whole app.
 */
export function usePullSession(): PullSession | null {
  return useSyncExternalStore(subscribe, read, read);
}
