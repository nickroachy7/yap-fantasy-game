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
 * THERE IS NO SECTION NAV LEFT FOR THE FRAME TO DRAW, and that is the newest
 * thing about this file. Players had three views — Search, Trend and Top — and
 * two of them turned out to be sort keys on the board they shared, so they are
 * controls on it now; Search is a takeover reached from those controls. See the
 * head of `index.tsx`. `SectionFrame` and `SectionNav` both test for children
 * and draw nothing when a section has none, so this needed no change to stop
 * drawing a bar — which is the whole reason the frame owns that test.
 *
 * THE FRAME STAYS ANYWAY, for the thing it does besides the bar: it provides
 * the frame context `Screen` reads to know what chrome is already above it, and
 * it is the seam a second view would hang off if one is ever wanted back.
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
