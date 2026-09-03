/**
 * The board that ranked cards, kept alive as a redirect.
 *
 * It was TOP — the season's best cards by the market's consensus rank — and
 * before that Leaders, until the standings between MANAGERS took that word. It
 * is now one of six orderings on the Players board, which is what it always
 * was: `marketRank`, ascending, with nothing filtered. That is the order the
 * board opens on, so this path lands exactly where it used to.
 *
 * THE ROUTE OUTLIVES THE PAGE, deliberately. It survived two renames on the
 * argument that a URL is a promise — deep links, `dismissTo` fallbacks and the
 * rail's `also` list all name it — and a merge is a worse reason to break one
 * than a rename was. Anyone holding this link gets the board rather than a
 * blank screen.
 *
 * A REDIRECT, NOT A REPLACE IN AN EFFECT. `Redirect` runs during render, so the
 * old path never mounts a screen of its own and there is nothing to flash; an
 * effect would paint an empty page for a frame before navigating out of it.
 *
 * This file can go once nothing points here — but nothing pointing here is a
 * claim about the outside world, not about the codebase, so it is not on a
 * timer.
 */
import { Redirect } from 'expo-router';

export default function LeadersRedirect() {
  return <Redirect href="/fantasy/players" />;
}
