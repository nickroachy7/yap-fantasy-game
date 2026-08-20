/**
 * The navigation model, declared once.
 *
 * THREE LEVELS, and the reason there are three is that the bottom bar stopped
 * being the fantasy game's navigation and became the APP's.
 *
 *   1. NAV_TABS      — the bottom bar (and the top of the wide rail). Fantasy,
 *                      Scores, Profile. These are products, not screens.
 *   2. FANTASY_SECTIONS — the row under the header once you are inside Fantasy.
 *                      Lineup, Collection, Players, Board. These used to BE the
 *                      bottom bar.
 *   3. NavChild      — a section's sub-pages, drawn by `SectionNav` as the
 *                      page's action bar. Unchanged.
 *
 * Four presentations read this file: the bottom tab bar renders one tab per
 * entry in NAV_TABS, `FantasyTopNav` renders FANTASY_SECTIONS as underlined
 * text tabs, the wide-web sidebar renders the whole tree as indented rows, and
 * `SectionNav` renders one section's children as the first items of the page's
 * action bar. Values are route paths.
 *
 * This file previously declared only the Collection segments while
 * `Sidebar.tsx` kept its own parallel copy of the whole nav — so the comment
 * claiming they could not drift was describing an intention rather than the
 * code, and adding a sub-page meant remembering to edit two files. Every
 * presentation now derives from here, which is what makes that claim true.
 *
 * Order inside Fantasy is deliberate, and it follows what a week actually looks
 * like: set the lineup, look at what you own, go and get more, then see where
 * that put you.
 *
 * One child of every section deliberately shares the section's own href. The
 * nav needs an item for the landing page or there is no way back to it, and the
 * sidebar needs the parent row to stay a live target. The alternative — a bare
 * `/fantasy/lineup/index` child — would show the same word twice in the rail
 * for no gain.
 *
 * It is the FIRST child everywhere except Players, which lands on its second;
 * see the note there.
 */
import type { ActionIconName } from '@/components/shell/ActionBar';
import type { TabIconName } from '@/components/shell/TabIcon';

export type NavChild = {
  href: string;
  label: string;
  /**
   * A word beside the label in the wide RAIL — and only there. The rail is a
   * vertical list of rows, so a badge at the end of one costs nothing; the
   * narrow bar stacks icon over label and a third line changes the height of
   * every cell in the strip. `ActionBar` therefore has no badge at all.
   *
   * Nothing sets this today. See the note on Sets.
   */
  badge?: string;
  /**
   * Drawn beside the label in the page's action bar.
   *
   * It lives here rather than in the screens because the bar is assembled from
   * this file — a screen that picked its own glyph for "Shop" would be the
   * parallel copy of the navigation this file's header warns about, one icon at
   * a time.
   */
  icon: ActionIconName;
  /**
   * Opened with a PUSH rather than a replace, and dismissed rather than
   * navigated away from.
   *
   * The other children are peers — three boards you flip between — so replacing
   * is right for them: pushing would build a back stack out of every toggle.
   * Search is not a peer. It is a full-screen takeover living ABOVE the tab
   * navigator, so it belongs on top of whatever you were reading, and the way
   * out of it is to close it and find that page still there.
   *
   * Replacing was what made the way out wrong. With no entry left behind it,
   * the screen had nothing to go back TO, so it hard-coded a return to Trend —
   * and anyone who opened search from Leaders was quietly moved to a different
   * board on the way out.
   */
  takeover?: boolean;
};

/** One of the four boards inside Fantasy. Level 2. */
export type NavSection = {
  href: string;
  label: string;
  /**
   * Shorter name for a bar where labels share the screen width. Falls back to
   * `label`.
   *
   * Only Leaderboard needs one, and it needs one in BOTH bars it appears in —
   * the wide rail has room, the narrow top nav does not. Measured at 13pt
   * across four items on a 320pt viewport, an iPhone SE: "Leaderboard" alone
   * wants more than its quarter and truncated to "Leaderboa…", which reads as
   * a bug rather than as an abbreviation.
   *
   * "Board" rather than an invented abbreviation: it is already this app's own
   * shorthand for that screen — `leaderboard/board.ts`, `BOARD_LIMIT`, the
   * screen's own doc comment ("The global board"), and the shell gallery's
   * label for it.
   */
  tabLabel?: string;
  /** Drawn by the wide-web rail. The narrow top nav is text-only — see there. */
  icon: TabIconName;
  children?: NavChild[];
};

/** One of the three products in the bottom bar. Level 1. */
export type NavTab = {
  href: string;
  label: string;
  /** Drawn by the bottom tab bar and the wide-web rail. See TabIcon. */
  icon: TabIconName;
  /**
   * The boards under this tab, if it has any. Only Fantasy does; Scores and
   * Profile are single pages.
   *
   * A tab WITH sections is a nested navigator, and that is the difference the
   * tab layout keys off when deciding whether to pin the tab button to an href.
   */
  sections?: NavSection[];
};

export const FANTASY_SECTIONS: NavSection[] = [
  // No children: the scoreboard that used to be `/lineup/scores` is the Scores
  // tab now, so the section is one page again.
  { href: '/fantasy/lineup', label: 'Lineup', icon: 'lineup' },
  {
    href: '/fantasy/collection',
    label: 'Collection',
    icon: 'collection',
    children: [
      { href: '/fantasy/collection/inventory', label: 'Inventory', icon: 'inventory' },
      /* No "Soon" badge, though Sets is a designed empty state until Week 3.
         The badge cost the whole Collection bar 11pt of height — it was a third
         line in a cell, so it stretched its two siblings with it and the strip
         sat lower than every other section's. And it was saying, at 7pt, a
         weaker version of what the page itself opens with: NOT BUILT YET, over
         "Nothing to collect here yet", over PLANNED — Week 3. */
      { href: '/fantasy/collection/sets', label: 'Sets', icon: 'sets' },
      { href: '/fantasy/collection/shop', label: 'Shop', icon: 'shop' },
    ],
  },
  {
    href: '/fantasy/players',
    label: 'Players',
    icon: 'players',
    /* THE LANDING PAGE IS THE SECOND CHILD, not the first, and it is the only
       section where that is true.

       The rule below — first child shares the section's href — exists so there
       is always a way back to the landing page, and it is satisfied by ANY
       child pointing at it; being first was convention, not mechanism, and
       `SectionNav` marks the active item by comparing paths rather than by
       position. What the order carries instead is how the three read as a set:
       find a player, see who moved, see who is best. Opening on Trend is a
       separate decision from where Trend sits in that row, and forcing the two
       to agree would mean landing on a search box — a page that shows you
       nothing until you type. */
    children: [
      /* Not `/fantasy/players/search`: it is a full-screen takeover living
         above the tab navigator, so its path is a root one. See
         `app/(app)/search.tsx`. */
      { href: '/search', label: 'Search', icon: 'search', takeover: true },
      { href: '/fantasy/players', label: 'Trend', icon: 'trend' },
      { href: '/fantasy/players/leaders', label: 'Leaders', icon: 'standings' },
    ],
  },
  {
    href: '/fantasy/leaderboard',
    label: 'Leaderboard',
    tabLabel: 'Board',
    icon: 'leaderboard',
    children: [
      { href: '/fantasy/leaderboard', label: 'Standings', icon: 'standings' },
      { href: '/fantasy/leaderboard/scoring', label: 'Scoring', icon: 'scoring' },
    ],
  },
];

export const NAV_TABS: NavTab[] = [
  { href: '/fantasy', label: 'Fantasy', icon: 'fantasy', sections: FANTASY_SECTIONS },
  /* The league's own week, rather than yours. It was a band across the top of
     the lineup until it had somewhere better to be; a page can hold the week
     picker and the per-game leaders that the band had no room for. */
  { href: '/scores', label: 'Scores', icon: 'scores' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
];

/**
 * The route segment expo-router knows a tab by — `/fantasy` -> `fantasy`.
 *
 * The tab layout needs both forms: `name` to match the file on disk, and `href`
 * to point the tab button at the page. Deriving the first from the second is
 * what keeps the tab bar from becoming the parallel copy of this file that the
 * header above warns about — an earlier version of the tab layout carried its
 * own array of five sections and had already started to drift from this one.
 */
export function routeNameOf(tab: NavTab): string {
  return tab.href.replace(/^\//, '');
}

/** A section's sub-pages, in order. `SectionNav` turns these into bar items. */
export function childrenOf(sectionHref: string): NavChild[] {
  return FANTASY_SECTIONS.find((s) => s.href === sectionHref)?.children ?? [];
}
