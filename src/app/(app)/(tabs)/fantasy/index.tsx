import { Redirect } from 'expo-router';

/**
 * `/fantasy` has no screen of its own: the tab opens on the lineup, with the
 * four boards in the strip above it.
 *
 * A HUB WAS BUILT HERE AND CUT BEFORE IT SHIPPED, because it was a tax. Four
 * rows, one line each, and nothing on it that could only be said in that one
 * place — so every session began with a tap answering a question nobody had
 * asked, and the board you actually wanted was always one further away than it
 * needed to be. The strip already lists all four; a page that lists them again
 * is a menu in front of a menu.
 *
 * The lineup is the right landing, not merely the first: it is the only screen
 * in the game with a DEADLINE on it, and the one whose state is wrong until you
 * act. Collection and Players are things you browse, and the board is a thing
 * you read after the fact.
 *
 * Kept as a redirect rather than deleted so `/fantasy` stays a real URL — the
 * tab button, the domain root and any bookmark all resolve here. Same shape as
 * `collection/index.tsx`, which sends `/fantasy/collection` on to Inventory.
 */
export default function FantasyIndex() {
  return <Redirect href="/fantasy/lineup" />;
}
