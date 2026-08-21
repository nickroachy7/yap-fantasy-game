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
 * text tabs, `SectionNav` renders one section's children as the first items of
 * the page's action bar, and the wide-web rail renders WEB_NAV — a FLATTENING
 * of the three levels below, declared at the foot of this file. Values are
 * route paths.
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
import type { Measure } from '@/constants/theme';

export type NavChild = {
  href: string;
  label: string;
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
   * The other children are peers — boards you flip between — so replacing is
   * right for them: pushing would build a back stack out of every toggle.
   *
   * TWO CHILDREN ARE NOT PEERS, and they are not the same shape as each other
   * either — what they share is that both live ABOVE the tab navigator, on a
   * root path, and both are things you put DOWN rather than navigate away from.
   * Search is a `fullScreenModal`: you use it instead of the app. Packs is the
   * profile sheet: you glance at it over the app. Either way it belongs on top
   * of whatever you were reading, and the way out is to close it and find that
   * page still there.
   *
   * Replacing was what made the way out wrong. With no entry left behind it,
   * the screen had nothing to go back TO, so it hard-coded a return to Trend —
   * and anyone who opened search from Leaders was quietly moved to a different
   * board on the way out.
   */
  takeover?: boolean;
  /**
   * Drawn as the round button beside the tray rather than as a cell in it.
   *
   * SEPARATE FROM `takeover`, and the two must not be folded together again —
   * they answer different questions. `takeover` is about NAVIGATION: push over
   * the page rather than replace it. This is about PRESENTATION: is the thing
   * a place, or an errand?
   *
   * Both of this file's takeovers prove the difference. Search is a takeover
   * and stays a cell, because it IS a third way to browse the players board —
   * find one, see who moved, see who is best. It belongs among its peers.
   * Packs is a takeover and does not, because it is not another way to look at
   * your collection; it is where you go to buy more. One is a room in the
   * house, the other is the shop on the corner.
   *
   * Deriving this from `takeover` made Search a circle too, which is how the
   * distinction got noticed.
   */
  detached?: boolean;
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
  /**
   * Drawn by the wide-web rail, which reaches it through `WEB_NAV` rather than
   * by walking this array — see `iconOf`. The narrow top nav is text-only.
   */
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
      /* NOT a peer of the two above, and not a page. Packs are a sheet
         presented over the app — the same `takeover` shape Search already
         uses, so pressing this pushes `/packs` over whatever you were reading
         and closing it puts you back on THAT page rather than on Inventory.
         It keeps the slot Shop had because the question is unchanged: this
         is still where you go to get more cards. See `app/(app)/packs.tsx`. */
      { href: '/packs', label: 'Packs', icon: 'shop', takeover: true, detached: true },
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
  /* No children, like Lineup. It had two — STANDINGS and SCORING — and the
     strip they produced cost every phone screen a permanent row of navigation
     to offer one board and one reference page you read once. The board itself
     now carries a six-way switcher, so that strip sat directly above another
     strip; two rows of chrome before a single row of data.
     Scoring moved to `/scoring`, reached from Profile → Settings. */
  {
    href: '/fantasy/leaderboard',
    label: 'Leaderboard',
    tabLabel: 'Board',
    icon: 'leaderboard',
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

/* ------------------------------------------------------------------------- *
 * LEVEL 0: WIDE WEB
 *
 * A browser window is not a phone with more pixels, and the three-level tree
 * above is the shape a phone forced on us. Fifteen rows of indented rail was
 * the app's own file structure printed down the side of the window: to reach
 * Leaders you read "Fantasy", then "Players", then "Leaders" — three words to
 * name one board, two of which are not places you can be. `/fantasy` is a
 * redirect and `/fantasy/players` opens on Trend, so two of the rail's ranks
 * were labels pretending to be destinations.
 *
 * WEB_NAV is the same app with the pretending removed: one flat list of the
 * places a reader can actually go, each one row, each one click. It is
 * declared rather than derived because two of the decisions in it are
 * editorial and could not be computed from the tree:
 *
 *   PROFILE IS NOT IN IT. The rail already ends in the account row, and a
 *   product whose own name is at the bottom of the window does not also need a
 *   line in the middle of it.
 *
 *   PACKS COMES OUT OF COLLECTION. On a phone it is the shop on the corner
 *   reached from the collection's action bar; on a desktop rail there is room
 *   to put the shop on the street, and burying the one screen that spends gems
 *   two levels down was costing it every impression.
 *
 * AND TWO SECTIONS FOLD RATHER THAN SPLIT. Inventory/Sets and Search/Trend/
 * Leaders are not four and three destinations — they are two boards each with
 * a couple of views, and the phone only made them routes because a phone has
 * nowhere to put a view switcher. On web the row is the board and the views
 * are tabs in the page's own heading; see `webSectionOf` and `WebPageTabs`.
 * The routes are untouched, so every URL, deep link and mobile path still
 * resolves exactly where it did.
 *
 * NOTHING BELOW CHANGES THE PHONE. NAV_TABS and FANTASY_SECTIONS are still the
 * whole story for the bottom bar, the top nav and the action bar, and this
 * block is read only by `Sidebar` and `Screen`, both of which gate on
 * `useIsWide()` — which is "web, and wide enough" and false on every device.
 * ------------------------------------------------------------------------- */

/**
 * Which of the app's two hand-drawn glyph sets a rail row uses.
 *
 * They are separate sets for a reason `ActionBar` sets out at length — one
 * names destinations at 24pt, the other names verbs at 18 — and the flat rail
 * is the first thing that needs to draw from both, because Packs is now a
 * destination and its glyph only exists in the verb set. Tagging the set is
 * how the row picks the right component without either set having to grow a
 * copy of the other's shape.
 */
export type WebNavIcon =
  | { set: 'tab'; name: TabIconName }
  | { set: 'action'; name: ActionIconName };

/**
 * One rail row, as DECLARED. Label and icon are absent because they are looked
 * up — see `WEB_NAV`.
 */
type WebNavSpec = {
  /** Where the row goes. For a folded row, the view it opens on. */
  href: string;
  /**
   * Path prefix that lights the row, when the row covers more than its own
   * href, AND the key its label and icon are looked up under. Defaults to
   * `href`.
   *
   * Collection opens on Inventory but owns `/fantasy/collection/*`, so without
   * this the row would go dark the moment you switched to Sets — and it would
   * be captioned "Inventory", the view, rather than "Collection", the board.
   */
  match?: string;
  /**
   * Extra whole paths that also light it, for destinations that live outside
   * their section's subtree.
   *
   * Only Search needs it: it is a full-screen takeover mounted above the tab
   * navigator, so its path is the root-level `/search` rather than something
   * under `/fantasy/players` — see `NavChild.takeover`.
   */
  also?: string[];
  /**
   * The FANTASY_SECTIONS href whose sub-pages this row folds into page tabs.
   *
   * Absent on a row that is one page. Present on Collection and Players, which
   * is what makes those two rows a board rather than a folder.
   */
  section?: string;
  /**
   * The measure EVERY view of a folded board is drawn at, overriding what the
   * individual pages ask `Screen` for. Only meaningful with `section`.
   *
   * IT EXISTS BECAUSE THE FOLD MADE A LATENT MISMATCH VISIBLE. Inventory asked
   * for `grid` (1180) and Sets for `table` (940), which was defensible while
   * they were two pages a phone reached from an action bar. Folded into one
   * board they are two tabs of one page — and the page jumped ~240pt wider
   * when you pressed Inventory, which reads as the layout breaking rather than
   * as two screens with different needs.
   *
   * The narrower one wins. A grid can always use less room; a table stretched
   * past its measure makes the eye travel from a name to its number.
   *
   * Inert below 940, so every phone and every narrow browser is unaffected.
   */
  measure?: Measure;
  /**
   * Extra air above this row, dividing the list into groups.
   *
   * The ONLY structure left in a flat rail, and it is enough for six rows.
   * Indentation said "inside"; this says "different kind of thing", which is
   * the only distinction the flattened list still needs to make.
   */
  spacedAbove?: boolean;
};

export type WebNavItem = WebNavSpec & { label: string; icon: WebNavIcon };

const WEB_NAV_SPEC: WebNavSpec[] = [
  { href: '/fantasy/lineup' },
  {
    href: '/fantasy/collection/inventory',
    match: '/fantasy/collection',
    section: '/fantasy/collection',
    measure: 'table',
  },
  /* Directly under Collection, because that is the question it answers — you
     have just looked at what you own and the next thought is "get more". It is
     still the sheet it is on a phone (see `(app)/_layout`), opened over the app
     rather than navigated to; a rail row that opens a sheet is the same
     bargain as a toolbar button that does, and the alternative — a second,
     desktop-only packs PAGE — would be two implementations of one shop. */
  { href: '/packs' },
  {
    href: '/fantasy/players',
    section: '/fantasy/players',
    also: ['/search'],
    /* Both views already ask for `table`; naming it here is what stops the
       next one being added at a different width. */
    measure: 'table',
  },
  { href: '/fantasy/leaderboard' },
  /* Last, and outside the five above it, because it is the only row that is
     not about you: the other five are your lineup, your cards, your packs,
     your pool and your rank, and this is the league's own week. */
  { href: '/scores', spacedAbove: true },
];

/**
 * The name and glyph a rail row takes from the tree above.
 *
 * NOTHING ABOVE IS RETYPED IN `WEB_NAV_SPEC`, and that is the whole point of
 * the lookup. The first version spelled out all six labels and all six icons,
 * which is precisely the parallel copy this file's header warns about — rename
 * "Leaderboard" in FANTASY_SECTIONS and the rail would quietly keep the old
 * word. Every row's key already appears in the tree exactly once, so the tree
 * can simply be asked.
 *
 * WHICH ARRAY ANSWERS ALSO SAYS WHICH GLYPH SET IT IS. Sections and tabs carry
 * a `TabIconName`, children carry an `ActionIconName`, so the tag falls out of
 * the lookup with no casts and nothing to declare beside the href. Packs is the
 * only row that resolves to a child, and the only row needing the verb set.
 *
 * SECTIONS BEFORE CHILDREN, and the order is load-bearing: `/fantasy/players`
 * is both the Players SECTION and the href of its Trend child, and the rail row
 * must be captioned with the board's name rather than the view's.
 */
function resolveRow(key: string): { label: string; icon: WebNavIcon } {
  const section = FANTASY_SECTIONS.find((s) => s.href === key);
  if (section) return { label: section.label, icon: { set: 'tab', name: section.icon } };

  const child = FANTASY_SECTIONS.flatMap((s) => s.children ?? []).find((c) => c.href === key);
  if (child) return { label: child.label, icon: { set: 'action', name: child.icon } };

  const tab = NAV_TABS.find((t) => t.href === key);
  if (tab) return { label: tab.label, icon: { set: 'tab', name: tab.icon } };

  /* Thrown at module load rather than papered over with a fallback. This is
     static data declared in this same file, so a miss is a typo that is wrong
     for everyone and fails the build — where a fallback would ship a rail row
     captioned with a URL. */
  throw new Error(`WEB_NAV: no navigation entry declares "${key}"`);
}

export const WEB_NAV: WebNavItem[] = WEB_NAV_SPEC.map((spec) => ({
  ...spec,
  ...resolveRow(spec.match ?? spec.href),
}));

/** One view of a folded board, as the page heading draws it. */
export type WebPageTab = {
  href: string;
  label: string;
  /** Push over the app rather than replace the board. See `NavChild`. */
  takeover?: boolean;
};

export type WebSection = {
  /** The board's name — what the page heading says instead of the view's. */
  label: string;
  tabs: WebPageTab[];
  /** The one width all of its views are drawn at. See `WebNavSpec.measure`. */
  measure?: Measure;
};

/**
 * Is the reader at or inside this row?
 *
 * Exported because the rail asks it of every row to draw the active one, and
 * `webNavItemFor` asks it of every row to find that same row — and for one
 * commit those were two copies of this function, one of them in `Sidebar`.
 * Two implementations of "which row am I on" is how the rail and the page
 * heading come to disagree about it.
 *
 * The boundary check is not decoration: a bare `startsWith` would light
 * `/fantasy/lineup` for a future `/fantasy/lineups`, and a rail that marks the
 * wrong row is worse than one that marks none. `also` covers the destinations
 * that live outside their board's subtree — see `WebNavSpec`.
 */
export function isWebNavActive(item: WebNavItem, pathname: string): boolean {
  const root = item.match ?? item.href;
  if (pathname === root || pathname.startsWith(`${root}/`)) return true;
  return item.also?.includes(pathname) ?? false;
}

/** The rail row the reader is currently inside, if any. */
function webNavItemFor(pathname: string): WebNavItem | undefined {
  return WEB_NAV.find((item) => isWebNavActive(item, pathname));
}

/**
 * The board this path belongs to and the views it folds, or null if the path
 * is a page in its own right.
 *
 * `detached` children are excluded: Packs is a rail row of its own now, and
 * leaving it in the Collection tab strip would put the shop in two places on
 * one screen. A board left with fewer than two views has nothing to switch
 * between, so it reports null and the page keeps its own heading and its own
 * measure.
 */
export function webSectionOf(pathname: string): WebSection | null {
  const item = webNavItemFor(pathname);
  if (!item?.section) return null;
  const section = FANTASY_SECTIONS.find((s) => s.href === item.section);
  if (!section) return null;
  const tabs = (section.children ?? [])
    .filter((child) => !child.detached)
    .map<WebPageTab>((child) => ({
      href: child.href,
      label: child.label,
      takeover: child.takeover,
    }));
  return tabs.length > 1 ? { label: section.label, tabs, measure: item.measure } : null;
}

/**
 * Root-level routes presented OVER the tab navigator rather than inside it.
 *
 * WHY ANYTHING NEEDS TO KNOW. `usePathname()` reports the TOP of the stack, and
 * these routes are mounted above the tabs with the page you came from still
 * rendered underneath — so while a sheet is open, every page beneath it is
 * asking "which board am I on?" and being told "/packs".
 *
 * That was a visible defect the moment the wide heading started deriving from
 * the route: opening Packs from the Players board re-titled the page behind the
 * dialog from "Players" to "Trend" and dropped its tab row, then put both back
 * when you closed it. The rail is the opposite case and is correct as it is —
 * Packs IS a rail row, and it should light while its sheet is open. The two
 * genuinely want different answers, which is why this is a separate question
 * rather than a fix to the matcher.
 *
 * Two sources, and both are named because neither can be derived from the
 * other: the takeovers are declared in FANTASY_SECTIONS above (`/packs`,
 * `/search`), and the profile sheets are declared as `Stack.Screen`s in
 * `(app)/_layout.tsx` and appear nowhere in this file's tree. If a fourth sheet
 * is added there, add it here.
 */
const SHEET_PREFIXES = ['/player/', '/card/', '/set/'] as const;

export function isOverlayPath(pathname: string): boolean {
  const takeovers = FANTASY_SECTIONS.flatMap((s) => s.children ?? []).filter((c) => c.takeover);
  if (takeovers.some((c) => c.href === pathname)) return true;
  return SHEET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
