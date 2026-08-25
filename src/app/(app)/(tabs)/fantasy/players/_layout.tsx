import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * PLAYERS: the pool of every card in the game, as a board inside Yap again.
 *
 * It was a bottom TAB between 2026-08-21 and 2026-08-24, on the argument that
 * the league's whole pool is not a view of your own team the way your lineup
 * and your collection are. That is still true and no longer decides anything:
 * the bar became the list of PRODUCTS when Leagues joined it, and a board of
 * the card game cannot sit at the same rank as the card game. See the header of
 * `sections.ts`.
 *
 * NO `masthead` PROP ANY MORE, and it is the one line the move actually
 * changed. `FantasyFrame` is above this navigator again and draws the wordmark
 * once for the whole tab; asking for it here too would put two mastheads on
 * every card board. It was passed for the whole of the time this was a tab,
 * because a tab has no frame above it.
 *
 * The frame draws the section nav ONCE, above this navigator, so flipping
 * between Trend and Leaders replaces only the board underneath — see
 * `SectionFrame`. `Screen` supplies each page's remaining chrome and knows not
 * to draw the header a second time.
 *
 * THE ROUTE AND THE LABEL AGREE AGAIN. It was called All Cards for one day —
 * the argument being that every row here is a card template rather than a
 * person — and the route stayed `/fantasy/players` throughout, because every
 * deep link, both `dismissTo` fallbacks and the whole `components/players` tree
 * say player. The label came back to meet it: a nav word's job is recognition,
 * and All Cards was precision bought at the cost of it. See `sections.ts`.
 */
export default function PlayersLayout() {
  return (
    <SectionFrame section="/fantasy/players">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
