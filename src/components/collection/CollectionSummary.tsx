/**
 * What you own, as a block of tiles above the grid.
 *
 * WHAT THIS HAS BEEN, IN ORDER, AND WHY IT IS BOXES AGAIN
 *
 * It started as a six-cell stat grid, and that grid was removed for a good
 * reason: it cost ~60pt of a phone's screen to carry five numbers, and it sat
 * above FOUR rows of facets and a search field, so the first card was below the
 * fold before a single card had been drawn. It became one wrapping line of
 * label/value pairs, which was the right trade at the time.
 *
 * The four rows of facets are gone. They are one row of position chips and
 * three round buttons now — see `CollectionFilters` — which handed back most of
 * what the grid had been costing. A wrapping line of ten small words was the
 * cheapest thing that could work under that old pressure, and with the pressure
 * gone it read as leftover text rather than as a part of the page.
 *
 * ONE STRIP, NOT FIVE TILES. `PlayerHero`'s filled fact tiles are the obvious
 * thing to reuse here and they are wrong on this screen for a reason that does
 * not apply on a profile: five filled boxes would sit directly above a GRID of
 * filled boxes, and the summary would compete with the cards it is a summary
 * of. The page's subject is the collection; this is context for it.
 *
 * THE STRIP ITSELF IS `SummaryStrip` AND NOT THIS FILE'S. The frame, the
 * dividers, the label-over-figure cell and the rule that it cannot wrap all
 * live there, shared with the sets tab — which had a hand-copied twin of them
 * until the two visibly diverged. What is left here is the only part that is
 * the collection's: which numbers, in which order, at which widths.
 *
 * The numbers are over the WHOLE collection, never the current filter. The
 * result line below answers "how many match"; this answers "what do I own", and
 * a summary that moved every time a chip was pressed would answer neither.
 *
 * WHAT IT COUNTS: the total, the four tiers, and what the lot would sell for.
 *
 * It used to count cards, players, duplicates, teams, injuries and value —
 * seven possible cells, of which three appeared only sometimes, so the strip
 * was a different object on every account and the same account's strip changed
 * shape as a player got hurt. Most of those were facts ABOUT the collection
 * rather than facts a collector acts on: "19 teams" is trivia until you are
 * filling a team set, and the injury counts are a question about this week's
 * lineup, which the lineup screen answers with the swap beside it.
 *
 * The tier spread is the one thing a collection screen should lead with,
 * because tier is what this game is a chase for: it is the axis packs move you
 * along, the axis sets are priced on, and the only one where "33 cards" tells
 * you nothing at all. Thirty-three bronze and thirty-three diamond are not the
 * same collection.
 *
 * SIX CELLS, ALWAYS, WHICH IS THE POINT. Every one is unconditional — the tiers
 * print their noughts. That is a deliberate reversal of the old rule that a
 * fact reading zero for most players is dropped rather than shown as 0, and it
 * is right here for the opposite reason it was right there: a missing DIAMOND
 * cell would silently appear the day you pulled your first, and a strip whose
 * width per cell depends on how lucky you have been is not comparable with
 * itself a week later. A nought under DIAMOND is also the most motivating
 * figure on the row.
 *
 * THE TIER'S LETTER CARRIES ITS COLOUR; every figure stays the same white. It
 * is drawn by `TierMark`, the same object the card faces and the lineup row
 * use, so the strip cannot disagree with them about what a tier looks like —
 * and the letter is the non-colour channel `theme.ts` requires tier to keep, so
 * nothing here is colour alone.
 *
 * THE LABEL BUDGET IS ~36pt AND THE TIER WORDS DO NOT FIT IN IT. Measured, not
 * estimated: "DIAMOND" at `Type.micro` needs 51pt and "BRONZE" 43 against a
 * tier cell's ~32 of usable width, so both truncated to "DIAM…" and "BRON…" on
 * the first render. That is what sent the tier labels to their initials rather
 * than any judgement about brevity. "CARDS" (36.2) and "VALUE" (34.2) fit their
 * wider cells; VALUE's fuller sense — "what this would sell for" — stays in the
 * accessibility label, where the gem beside the figure does the visible half of
 * the job.
 *
 * DUPLICATES ARE THE OMISSION I WOULD RECONSIDER FIRST. Sets are filled by
 * burning spare copies, so "how many spares am I sitting on" is the one dropped
 * fact that is genuinely actionable. It is out because a seventh cell puts each
 * at ~49pt on a 375pt phone, and a four-figure sell value needs ~51 with its
 * gem. If the strip ever earns more width — a wider phone floor, a shorter
 * label — that is the cell to add back.
 */

import type { ReactNode } from 'react';

import { Gem } from '@/components/shell/AppHeader';
import { TierMark } from '@/components/cards/TierMark';
import { SummaryStrip, type SummaryCell } from '@/components/ui/SummaryStrip';
import { getTierTheme, TierColors, TierOrder } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectionStats } from './types';

/**
 * Row shares. A tier cell holds one letter over a two-digit count; the sell
 * value holds five digits and a gem. Giving them the same width means one of
 * them is wrong, and it is always the same one.
 */
const TIER_WEIGHT = 0.8;
const CARDS_WEIGHT = 1.2;
const VALUE_WEIGHT = 2;

export function CollectionSummary({
  stats,
  action,
}: {
  stats: CollectionStats;
  /** Drawn beside the strip — the Packs button. See `SummaryStrip.action`. */
  action?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const gold = TierColors[scheme].gold.accent;

  /* Built as a list rather than as JSX in place, because the divider is a LEFT
     border and only the leading cell may skip it. It is a fixed six — the
     total, a cell per tier, and the sell value — so nothing here is
     conditional and the strip is the same object on every account. */
  const cells: SummaryCell[] = [
    {
      key: 'cards',
      label: 'CARDS',
      value: stats.cards.toLocaleString(),
      weight: CARDS_WEIGHT,
      accessibilityLabel: `${stats.cards} cards`,
    },

    /* Bottom tier first, the same order `TierOrder` gives everything else that
       walks the ladder — the card's own rungs included — so the row reads left
       to right as the climb does.

       LABELLED BY `TierMark`, NOT BY THE TIER'S NAME. "DIAMOND" needs 51pt of a
       cell with ~32 to give and truncated to "DIAM…"; every tier word is at or
       past the budget. The initial is the app's own answer to that — it is what
       the card faces, the lineup row and the checklist all use, it is the
       non-colour channel `theme.ts` requires tier to keep, and it is 7pt wide.
       The colour rides on the letter here rather than on the figure, so the
       four counts stay the same white as CARDS and VALUE and only the
       identifiers are tinted. */
    ...TierOrder.map((tier) => {
      const held = stats.byTier[tier];
      return {
        key: tier,
        labelNode: <TierMark tier={tier} size={9} />,
        value: held.toLocaleString(),
        weight: TIER_WEIGHT,
        accessibilityLabel: `${held} ${getTierTheme(tier, scheme).label.toLowerCase()} cards`,
      };
    }),

    /* What the whole collection is worth if sold. It earns its place twice: it
       is the only figure here denominated in gems rather than cards, and it is
       how anyone finds out selling exists at all — the action itself lives on
       the card page, where there is room to show what a copy has earned before
       you give it up. Last, because it is the one cell that is not a count of
       cards, and widest, because it is the one that runs to five figures.

       Unconditional, where it used to appear only above zero: with the cell
       count fixed there is nothing to be gained by hiding it, and a collection
       worth nothing is a fact worth printing rather than a gap. */
    {
      key: 'value',
      label: 'VALUE',
      value: stats.sellValue.toLocaleString(),
      mark: <Gem color={gold} size={8} />,
      weight: VALUE_WEIGHT,
      accessibilityLabel: `Worth ${stats.sellValue} gems if every card were sold`,
    },
  ];

  return <SummaryStrip cells={cells} action={action} />;
}
