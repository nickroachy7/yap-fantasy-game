import { Redirect } from 'expo-router';

/**
 * `/fantasy` has no screen of its own: the tab opens on Compete, which opens
 * on this week's lineup.
 *
 * A HUB WAS BUILT HERE AND CUT BEFORE IT SHIPPED, because it was a tax. Rows
 * with one line each and nothing on them that could only be said in that one
 * place — so every session began with a tap answering a question nobody had
 * asked, and the board you actually wanted was always one further away than it
 * needed to be. The strip already lists the sections; a page that lists them
 * again is a menu in front of a menu.
 *
 * Compete is the right landing, not merely the first: it holds the only screen
 * in the game with a DEADLINE on it, and the one whose state is wrong until you
 * act. Collect is a thing you browse, and the board is a thing you read after
 * the fact.
 *
 * Kept as a redirect rather than deleted so `/fantasy` stays a real URL — the
 * tab button, the domain root and any bookmark all resolve here.
 */
export default function FantasyIndex() {
  return <Redirect href="/fantasy/compete" />;
}
