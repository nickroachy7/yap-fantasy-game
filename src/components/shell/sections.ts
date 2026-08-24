/**
 * The navigation model, declared once.
 *
 * THREE LEVELS, and the reason there are three is that the bottom bar stopped
 * being the fantasy game's navigation and became the APP's.
 *
 *   1. NAV_TABS      — the bottom bar (and the top of the wide rail). Fantasy,
 *                      Players, Scores, Profile. These are products, not
 *                      screens.
 *   2. FANTASY_SECTIONS — the row under the header once you are inside Fantasy.
 *                      Compete, Collect, Board. These used to BE the bottom
 *                      bar.
 *   3. NavChild      — a section's OR a tab's sub-pages, drawn by `SectionNav`
 *                      as the page's action bar.
 *
 * PLAYERS IS A PRODUCT, NOT A BOARD, and moving it down a level is what let
 * Collection stop being a folder. The pool of every player in the league is not
 * a view of your fantasy team the way your lineup and your cards are — you go
 * there to look somebody up, which is the same kind of errand as checking the
 * scores. So it sits in the bottom bar and takes its three views with it.
 *
 * LEVEL 2 IS VERBS NOW, NOT OBJECTS, as of 2026-08-25. It was Lineup,
 * Collection, Sets, Board — four things you own or read. It is Compete,
 * Collect, Board: what you are there to DO, with the objects as views beneath.
 *
 * Grouping by intent is only right when the things inside share a job, and
 * these two do. Compete had no choice: contests mean there is no longer *a*
 * lineup for the board to be named after. Collect is the judgement call — a
 * set is where a card GOES, so the inventory and the exits from it are one
 * loop, and it had been split across two tabs where the exit lived on the one
 * you had to go out of your way to open.
 *
 * This DOES put a second strip under the section strip again, which is the
 * thing the note below used to celebrate removing. The difference is that the
 * pair that failed were two takes on the SAME rank competing for one job; these
 * are two ranks, and `SectionNav` sets out at length why that is allowed.
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
 * like: play your cards, then sort out the ones you did not play, then see
 * where that put you.
 *
 * One child of any parent that has several deliberately shares the parent's own
 * href. The nav needs an item for the landing page or there is no way back to
 * it, and the sidebar needs the parent row to stay a live target. Compete and
 * Collect both land on their first; Players lands on its second, and the note
 * there explains why being first was convention rather than mechanism.
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

/** One of the three boards inside Fantasy. Level 2. */
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
  /**
   * The tab's own sub-pages, for a tab that is one board rather than several.
   *
   * The same thing a section's `children` are and drawn by the same bar —
   * Players kept its three views when it moved down to the bottom bar, and
   * they did not become a level of their own on the way. `childrenOf` answers
   * for both, which is what stops `SectionNav` needing to know whether it is
   * looking at a tab or a section.
   */
  children?: NavChild[];
};

/**
 * Where you go to get more cards, declared once and used by BOTH boards that
 * make you want them.
 *
 * It is not a peer of anything and it is not a page: a sheet presented over the
 * app, so pressing it pushes `/packs` over whatever you were reading and
 * closing it puts you back on THAT page. See `app/(app)/packs.tsx`.
 *
 * IT APPEARS TWICE ON PURPOSE. It used to have one home because Collection was
 * a folder and the tray under it was the only place a round button could sit.
 * With Collection and Sets separated, "I need more cards" is the next thought
 * on both of them — a shop reachable from your cards but not from the set you
 * are two cards short of would be missing from exactly the screen that sells
 * hardest. One object, two doors, and the same sheet behind both.
 *
 * IT IS NOT A CHILD OF EITHER SECTION, and that is the difference between where
 * it sits and where it USED to. As a `detached` child it was drawn by
 * `SectionNav`, which meant a full row of chrome above the page holding one
 * circle and nothing else — the tray beside it had gone empty when Collection
 * stopped being a folder. It is drawn by the two pages now, on the right of
 * their summary strip (`PacksButton`, `SummaryStrip.action`), so the row is
 * gone and the button kept its size and its place at the top right.
 *
 * It stays declared HERE because everything else about it is still navigation:
 * the rail resolves `/packs` to this label and glyph, and `isOverlayPath` reads
 * `takeover` off it to know the sheet is mounted above the tabs.
 */
export const PACKS: NavChild = {
  href: '/packs',
  label: 'Packs',
  icon: 'shop',
  takeover: true,
  detached: true,
};

/**
 * The two views under Compete.
 *
 * LINEUP SHARES THE SECTION'S OWN HREF, which is this file's convention for a
 * parent that has several children: the bar needs an item for the landing page
 * or there is no way back to it. It is not an arbitrary pick of which child
 * goes first — the free contest is auto-entered, so it is the one view of this
 * board nobody chose to be on, and it is the one with a deadline.
 */
const COMPETE_VIEWS: NavChild[] = [
  { href: '/fantasy/compete', label: 'Lineup', icon: 'lineup' },
  { href: '/fantasy/compete/contests', label: 'Contests', icon: 'contests' },
];

/**
 * The two views under Collect.
 *
 * The same pair Collection held before 2026-08-21, back under one board for a
 * reason the split did not weigh: a set is where a card GOES. See
 * `collect/_layout.tsx`.
 */
const COLLECT_VIEWS: NavChild[] = [
  { href: '/fantasy/collect', label: 'Collection', icon: 'inventory' },
  { href: '/fantasy/collect/sets', label: 'Sets', icon: 'sets' },
];

export const FANTASY_SECTIONS: NavSection[] = [
  /* COMPETE, which was Lineup. Renaming it is not a tidy-up — a lobby means
     there is no longer *a* lineup to name the board after. The section is
     where your entries live, and the free contest's lineup is its index. */
  {
    href: '/fantasy/compete',
    label: 'Compete',
    icon: 'lineup',
    children: COMPETE_VIEWS,
  },
  /* COLLECT, which was Collection and Sets as peers. Two boards for one loop —
     look at your cards, decide what to do with them — and the exit was on the
     board you had to go out of your way to open. */
  {
    href: '/fantasy/collect',
    label: 'Collect',
    icon: 'collection',
    children: COLLECT_VIEWS,
  },
  /* No children, and the only section still without any. It had two —
     STANDINGS and SCORING — and the strip they produced cost every phone screen
     a permanent row of navigation to offer one board and one reference page you
     read once. The board itself now carries a six-way switcher, so that strip
     sat directly above another strip; two rows of chrome before a single row of
     data. Scoring moved to `/scoring`, reached from Profile -> Settings.

     IT STAYS OUTSIDE THE OTHER TWO, and the verb/verb/noun asymmetry is the
     point rather than an oversight: Compete and Collect are things you DO to
     your own team, and the boards are where you read about everybody else. It
     is the same distinction that moved Players down to the bottom bar. */
  {
    href: '/fantasy/leaderboard',
    label: 'Leaderboard',
    tabLabel: 'Board',
    icon: 'leaderboard',
  },
];

/**
 * The three ways into the player pool, which came down from level 2 with it.
 *
 * THE TAB LANDS ON THE SECOND, not the first, and it is the only nav item in
 * the app where that is true. The rule elsewhere — first child shares the
 * parent's href — exists so there is always a way back to the landing page, and
 * it is satisfied by ANY child pointing at it; being first was convention, not
 * mechanism, and `SectionNav` marks the active item by comparing paths rather
 * than by position. What the order carries instead is how the three read as a
 * set: find a player, see who moved, see who is best. Opening on Trend is a
 * separate decision from where Trend sits in that row, and forcing the two to
 * agree would mean landing on a search box — a page that shows you nothing
 * until you type.
 */
const PLAYER_VIEWS: NavChild[] = [
  /* Not `/players/search`: it is a full-screen takeover living above the tab
     navigator, so its path is a root one. See `app/(app)/search.tsx`. */
  { href: '/search', label: 'Search', icon: 'search', takeover: true },
  { href: '/players', label: 'Trend', icon: 'trend' },
  { href: '/players/leaders', label: 'Leaders', icon: 'standings' },
];

export const NAV_TABS: NavTab[] = [
  { href: '/fantasy', label: 'Fantasy', icon: 'fantasy', sections: FANTASY_SECTIONS },
  /* Next to Fantasy because the two are the game: your team, then everyone
     else's players. It was the third board inside Fantasy and never sat right
     there — the other three are all about YOUR week, and this one is the
     league's whole pool. */
  { href: '/players', label: 'Players', icon: 'players', children: PLAYER_VIEWS },
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

/**
 * A section's or a tab's sub-pages, in order. `SectionNav` turns these into bar
 * items.
 *
 * Both are asked because the bar is drawn the same way at either level — the
 * Collection section and the Players tab each hand it an href and get their own
 * children back, and neither has to know which list it lives in.
 */
export function childrenOf(href: string): NavChild[] {
  const section = FANTASY_SECTIONS.find((s) => s.href === href);
  if (section) return section.children ?? [];

  return NAV_TABS.find((t) => t.href === href)?.children ?? [];
}

/**
 * Every sub-page declared anywhere in the tree, plus the ones that hang off no
 * bar at all.
 *
 * `PACKS` is the whole reason for the third term: it is a destination the rail
 * lists and a takeover `isOverlayPath` must know about, and it is drawn by two
 * pages rather than by anybody's nav — so it appears in no `children` array and
 * walking the tree alone would miss it.
 */
function allChildren(): NavChild[] {
  return [
    ...FANTASY_SECTIONS.flatMap((s) => s.children ?? []),
    ...NAV_TABS.flatMap((t) => t.children ?? []),
    PACKS,
  ];
}

/* ------------------------------------------------------------------------- *
 * LEVEL 0: WIDE WEB
 *
 * A browser window is not a phone with more pixels, and the three-level tree
 * above is the shape a phone forced on us. Fifteen rows of indented rail was
 * the app's own file structure printed down the side of the window: to reach
 * Leaders you read "Fantasy", then "Players", then "Leaders" — three words to
 * name one board, two of which are not places you can be. `/fantasy` is a
 * redirect and `/players` opens on Trend, so two of the rail's ranks
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
   * Collection opens on Inventory but owns `/fantasy/collect/*`, so without
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
   * under `/players` — see `NavChild.takeover`.
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
  /* TWO FOLDED BOARDS. Each is one row on the rail with its views as page tabs
     — the same fold Collection/Sets had before they were split apart, restored
     because they are genuinely one board again, and now matched by Compete.
     The rail was never the thing that wanted them separate; a phone was. */
  { href: '/fantasy/compete', section: '/fantasy/compete', measure: 'form' },
  { href: '/fantasy/collect', section: '/fantasy/collect', measure: 'table' },
  /* Directly under the board that makes you want more cards, which is the
     question it answers. It is still the sheet it is on a phone (see
     `(app)/_layout`), opened over the app rather than navigated to; a rail row
     that opens a sheet is the same bargain as a toolbar button that does, and
     the alternative — a second, desktop-only packs PAGE — would be two
     implementations of one shop. */
  { href: '/packs' },
  {
    href: '/players',
    section: '/players',
    also: ['/search'],
    /* Both views already ask for `table`; naming it here is what stops the
       next one being added at a different width. */
    measure: 'table',
  },
  { href: '/fantasy/leaderboard' },
  /* Last, and outside the rest, because it is the only row that is not about
     you: the others are your lineup, your cards, your packs, your pool and your
     rank, and this is the league's own week. */
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
 * PARENTS BEFORE CHILDREN, and the order is load-bearing: `/players` is both
 * the Players TAB and the href of its Trend child, and the rail row must be
 * captioned with the board's name rather than the view's.
 */
function resolveRow(key: string): { label: string; icon: WebNavIcon } {
  const section = FANTASY_SECTIONS.find((s) => s.href === key);
  if (section) return { label: section.label, icon: { set: 'tab', name: section.icon } };

  const tab = NAV_TABS.find((t) => t.href === key);
  if (tab) return { label: tab.label, icon: { set: 'tab', name: tab.icon } };

  const child = allChildren().find((c) => c.href === key);
  if (child) return { label: child.label, icon: { set: 'action', name: child.icon } };

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
 * `/fantasy/compete` for a future `/fantasy/competes`, and a rail that marks the
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
  const label = resolveRow(item.section).label;
  const tabs = childrenOf(item.section)
    .filter((child) => !child.detached)
    .map<WebPageTab>((child) => ({
      href: child.href,
      label: child.label,
      takeover: child.takeover,
    }));
  return tabs.length > 1 ? { label, tabs, measure: item.measure } : null;
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
 * other: the takeovers are declared in the tree above (`/packs` under two
 * sections, `/search` under the Players tab), and the profile sheets are
 * declared as `Stack.Screen`s in `(app)/_layout.tsx` and appear nowhere in this
 * file's tree. If a fourth sheet is added there, add it here.
 */
const SHEET_PREFIXES = ['/player/', '/card/', '/set/', '/contest/'] as const;

export function isOverlayPath(pathname: string): boolean {
  const takeovers = allChildren().filter((c) => c.takeover);
  if (takeovers.some((c) => c.href === pathname)) return true;
  return SHEET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
