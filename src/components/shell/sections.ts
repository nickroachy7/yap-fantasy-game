/**
 * The navigation model, declared once.
 *
 * THREE LEVELS, and the reason there are three is that the bottom bar stopped
 * being the fantasy game's navigation and became the APP's.
 *
 *   1. NAV_TABS      — the bottom bar (and the top of the wide rail). Yap,
 *                      Leagues, Scores, Profile. These are products, not
 *                      screens.
 *   2. FANTASY_SECTIONS — the row under the header once you are inside Yap.
 *                      Compete, Collect, Players, Leaders. These used to BE
 *                      the bottom bar.
 *   3. NavChild      — a section's OR a tab's sub-pages, drawn by `SectionNav`
 *                      as the page's action bar.
 *
 * LEVEL 1 IS PRODUCTS, AND THERE ARE TWO OF THEM as of 2026-08-24. Yap is the
 * card game, and the whole tree below level 1 belongs to it; Leagues is private
 * leagues, a different game with a different shape, and today a placeholder.
 * Scores and Profile are not products — they are a reference page and an
 * account, and they are at level 1 because there is nowhere else for a thing
 * that belongs to the app rather than to either game.
 *
 * THAT IS WHY PLAYERS CAME BACK DOWN A LEVEL. It was promoted to the bar on the
 * argument that the league's whole pool is not a view of your own team — which
 * is true, and which stopped mattering once level 1 meant "a product". A bar
 * reading Yap, Leagues, Players, Scores, Profile offers one of the card game's
 * own boards at the same rank as the card game, and nothing about the bar tells
 * a reader that pressing Players keeps them inside Yap while pressing Leagues
 * does not. It is a board again, named Players, third in the level-2 strip.
 *
 * LEVEL 2 IS TWO VERBS THEN TWO NOUNS. It was Lineup, Collection, Sets, Board
 * — four things you own or read. It is Compete, Collect, Players, Leaders:
 * what you are there to DO with your own team, then the two boards you go to
 * read about everybody else's.
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
 * route paths, and two of them no longer match their labels: `/fantasy` is the
 * tab captioned Yap, and `/fantasy/players` is the board captioned Players.
 * Both declarations say why the routes were left alone.
 *
 * This file previously declared only the Collection segments while
 * `Sidebar.tsx` kept its own parallel copy of the whole nav — so the comment
 * claiming they could not drift was describing an intention rather than the
 * code, and adding a sub-page meant remembering to edit two files. Every
 * presentation now derives from here, which is what makes that claim true.
 *
 * Order inside Yap is deliberate, and it follows what a week actually looks
 * like: play your team, sort out what you own, see what else is out there, then
 * see where all of that put you. Your two boards first, the league's two after
 * — the pairs are not interleaved.
 *
 * One child of any parent that has several deliberately shares the parent's own
 * href. The nav needs an item for the landing page or there is no way back to
 * it, and the sidebar needs the parent row to stay a live target. Compete and
 * Collect both land on their first; Players lands on its second, and the note
 * there explains why being first was convention rather than mechanism.
 */
import type { ActionIconName } from "@/components/shell/ActionBar";
import type { TabIconName } from "@/components/shell/TabIcon";
import type { Measure } from "@/constants/theme";

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
   * the screen had nothing to go back TO, so it hard-coded a return to the
   * players board —
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

/** One of the four boards inside Yap. Level 2. */
export type NavSection = {
  href: string;
  label: string;
  /**
   * Shorter name for a bar where labels share the screen width. Falls back to
   * `label`.
   *
   * NOTHING USES IT TODAY. Leaderboard was the one that did — at 13pt across
   * four items on a 320pt viewport, an iPhone SE, "Leaderboard" wanted more
   * than its quarter and truncated to "Leaderboa…" — and it shortened to
   * "Board", the app's own name for that screen. Renaming the board to
   * "Leaders" on 2026-08-24 made the abbreviation pointless: seven characters
   * fit both bars, so there is one word rather than two.
   *
   * It stays because the constraint has not gone anywhere. Four labels sharing
   * 320pt is tight (see `FantasyTopNav`), and the next long section name will
   * want exactly this rather than a second layout.
   */
  tabLabel?: string;
  /**
   * Drawn by the wide-web rail, which reaches it through `WEB_NAV` rather than
   * by walking this array — see `iconOf`. The narrow top nav is text-only.
   */
  icon: TabIconName;
  /**
   * A field of `PlayerState` that, when true, puts a dot on this item.
   *
   * DECLARED HERE RATHER THAN IN THE STRIP, on the same rule as everything else
   * in this file: a component that hardcoded "Collect is the one with the
   * daily-pack dot" would be the parallel copy of the navigation this file's
   * header warns about, one badge at a time. The strip draws whatever is
   * declared; which board owns which news is a navigation fact.
   *
   * IT NAMES NEWS, NOT A COUNT. A dot says "there is something in here for
   * you"; it never says how much, and nothing that needs a number should use
   * it. The board itself is where a figure belongs.
   */
  badge?: "dailyPack";
  children?: NavChild[];
};

/** One of the four tabs in the bottom bar. Level 1. */
export type NavTab = {
  href: string;
  label: string;
  /** Drawn by the bottom tab bar and the wide-web rail. See TabIcon. */
  icon: TabIconName;
  /**
   * The boards under this tab, if it has any. Only Yap does; Leagues, Scores
   * and Profile are single pages.
   *
   * A tab WITH sections is a nested navigator, and that is the difference the
   * tab layout keys off when deciding whether to pin the tab button to an href.
   */
  sections?: NavSection[];
  /**
   * The tab's own sub-pages, for a tab that is one board rather than several.
   *
   * The same thing a section's `children` are and drawn by the same bar. NO TAB
   * HAS ANY TODAY — Players was the one that did, and it took its three views
   * back up to level 2 when it became a board again. The field stays because
   * `childrenOf` answering at both levels is what stops `SectionNav` needing to
   * know whether it is looking at a tab or a section, and a single-board
   * product added to the bar tomorrow wants exactly this.
   */
  children?: NavChild[];
};

/**
 * Where you go to get more cards, declared once.
 *
 * It is not a peer of anything and it is not a page: a sheet presented over the
 * app, so pressing it pushes `/packs` over whatever you were reading and
 * closing it puts you back on THAT page. See `app/(app)/packs.tsx`.
 *
 * IT APPEARED TWICE AND NOW APPEARS ONCE, which is worth stating plainly
 * because the second door was argued for at length here and then removed.
 *
 * It sat at the end of the lineup's rail as well as the collection's toolbar,
 * on the argument that "I need more cards" is the next thought on both boards.
 * The rail's own reason was narrower than that: it carried the shop because it
 * carried the WALLET — a heart and the contest that takes it, coins and the
 * shop that takes them, on the screen where a player is already deciding.
 *
 * The wallet has moved. The coin balance was always in the masthead and the
 * heart count has gone up to join it, so the rail is the run and the way into a
 * contest, and a shop door on it served a currency the row no longer mentions.
 *
 * ON A PHONE THAT LEAVES EXACTLY ONE DELIBERATE DOOR — this chip, on Collect.
 * The empty-collection state and the one-time auto-open are doors too, and
 * both are for a player who owns nothing; an established player has one. That
 * is a known and deliberately thin position, not an oversight, and if packs is
 * ever to be reachable from everywhere the place for it is the masthead's
 * trailing slot, beside the balances it spends. See `AppHeader`.
 *
 * IT IS NOT A CHILD OF ANY SECTION, and that is the difference between where it
 * sits and where it USED to. As a `detached` child it was drawn by
 * `SectionNav`, which meant a full row of chrome above the page holding one
 * circle and nothing else — the tray beside it had gone empty when Collection
 * stopped being a folder. It became a round button each page drew for itself
 * (`PacksButton`), and it is a `DoorChip` now: `+ Packs`, at the end of the
 * collection's toolbar beside `+ Sets`. The wide rail still draws it as a row
 * of its own, which is why the chip is drawn on narrow only.
 *
 * It stays declared HERE because everything else about it is still navigation:
 * the rail resolves `/packs` to this label and glyph, and `isOverlayPath` reads
 * `takeover` off it to know the sheet is mounted above the tabs.
 */
export const PACKS: NavChild = {
  href: "/packs",
  label: "Packs",
  icon: "shop",
  takeover: true,
  detached: true,
};

/**
 * The lobby, which is a SHEET over the lineup rather than a view beside it.
 *
 * IT WAS A CHILD OF COMPETE and drew a two-item bar — LINEUP | CONTESTS — above
 * every visit to the board. Two of the three rows of chrome on the game's main
 * screen existed to name a pair that are not peers: the lineup is the screen,
 * and the lobby is an errand you run once a week. A permanent bar to switch
 * between them cost ~70pt on every visit and earned it almost never.
 *
 * Worse, it was the only door. A player who never pressed CONTESTS never
 * learned there were any — nothing on the board they actually use said so. The
 * way in is the LAST CARD OF THE CAROUSEL now (`ContestCarousel`), which puts
 * "there are more contests" directly in the path of the one gesture that screen
 * teaches, and the lobby opens over the lineup the way a profile or a set
 * checklist does: something you open, act on, and put down.
 *
 * DECLARED HERE FOR THE SAME REASONS AS `PACKS`, which it now matches exactly:
 * the rail resolves `/contests` to this label and glyph, and `isOverlayPath`
 * reads `takeover` off it to know the sheet is mounted above the tabs. Nothing
 * draws it as a nav item — `detached` says so — because the card that opens it
 * is not a bar item.
 */
export const CONTESTS: NavChild = {
  href: "/fantasy/compete/contests",
  label: "Contests",
  icon: "contests",
  /* NEITHER `takeover` NOR `detached` ANY MORE, and both removals are the
     point. It is a page inside Compete now, so `SectionNav` navigates to it
     with `replace` like any sibling tab rather than pushing a modal, it draws
     as a bar item instead of hiding in the tray, `webSectionOf` folds it into
     the section's heading tabs, and `isOverlayPath` correctly stops calling it
     an overlay. */
};

/**
 * SEARCH, which is the last of the three ways into the card pool still standing
 * as a route of its own.
 *
 * IT WAS A ROW IN A SECTION NAV — `PLAYER_VIEWS`, holding Search, Trend and
 * Top. Trend and Top are gone from this file, and not because they were cut:
 * they were one sort key each on a board all three shared, so they became
 * controls on it. See the head of `players/index.tsx`. A strip of navigation
 * over every visit to the board, offering two orderings of the page underneath
 * it, was the whole cost of keeping them apart.
 *
 * SEARCH DID NOT GO WITH THEM. It is not an ordering — it is a tool you pick up
 * with a name already in mind, use for four seconds and put down, and the case
 * for handing it the entire screen (no chrome, no chips, keyboard up on
 * arrival) is unaffected by what happened to its two neighbours. The board
 * reaches it with a round button on its own controls.
 *
 * SO IT IS DECLARED HERE RATHER THAN IN A `children` ARRAY, which is exactly
 * the shape `PACKS`, `CONTESTS` and `SETS` already have and for the same two
 * reasons: `isOverlayPath` must know it is a takeover mounted above the tab
 * navigator, and the wide rail names it in `also` — while nobody's nav bar
 * draws it, because there is no longer a bar for it to sit in. `detached` says
 * the second part.
 *
 * The path is root-level rather than `/fantasy/players/search`, because a
 * takeover is a sibling of `(tabs)` in the Stack above them — see
 * `app/(app)/search.tsx`.
 */
export const SEARCH: NavChild = {
  href: "/search",
  label: "Search",
  icon: "search",
  takeover: true,
  detached: true,
};

/**
 * Sets, which is a SHEET over your collection rather than a view beside it.
 *
 * IT WAS A CHILD OF COLLECT and drew a two-item bar — COLLECTION | SETS — above
 * every visit to the board, and the note that bar replaced is worth keeping
 * because the argument in it has not changed: a set is where a card GOES, so
 * the inventory and its exits are one loop and must not be two tabs you have to
 * choose between.
 *
 * What changed is that a permanent bar is not the only way to keep them
 * together, and it was the expensive one — a row of chrome on every visit to
 * the board, naming a pair that are not peers. Your collection is the screen;
 * sets are an errand you run against it.
 *
 * SO IT IS A DOOR ON THE BOARD, exactly as `CONTESTS` is on the lineup: a chip
 * at the end of the collection's own toolbar, beside the shop. That puts the
 * exit on the screen holding the cards it is an exit for — closer than the tab
 * ever was — and gives the sheet the one thing the page could not have, which
 * is somewhere to go when you put it down.
 *
 * DECLARED HERE FOR THE SAME REASONS AS `PACKS` AND `CONTESTS`, which it now
 * matches exactly: the rail resolves `/sets` to this label and glyph, and
 * `isOverlayPath` reads `takeover` off it to know the sheet is mounted above
 * the tabs. Nothing draws it as a nav item — `detached` says so.
 */
export const SETS: NavChild = {
  href: "/fantasy/collect/sets",
  label: "Sets",
  icon: "sets",
  /* A page under Collect, on the same terms as `CONTESTS` above — see the note
     there for what dropping `takeover` and `detached` each buys. The
     collection's toolbar chip still reads `SETS.href`, so it followed the route
     without being told. */
};

export const FANTASY_SECTIONS: NavSection[] = [
  /* COMPETE, which was Lineup. Renaming it is not a tidy-up — a lobby means
     there is no longer *a* lineup to name the board after. The section is
     where your entries live, and the free contest's lineup is its index. */
  {
    href: "/fantasy/compete",
    label: "Compete",
    icon: "lineup",
    /* TWO PAGES AGAIN, AND THIS TIME THERE ARE TWO.
       Compete carried a bar until 5cbdf44 took it off, and the argument was
       sound: the lobby had become a sheet, which left ONE page under the row.
       A switcher offering a single destination is a permanent row of chrome
       that can only ever return you to where you already are.
       What changed is not the argument but the count. Contests is a page again
       (see `CONTESTS`), so the row now switches between two real screens — the
       lineup you are filling and the contests you can enter it into — which is
       the thing a bar is for. The cost is the same row it always was, and it is
       paid for now.
       THE INDEX IS THE FIRST CHILD, listed explicitly rather than implied.
       `SectionNav` highlights on `pathname === child.href`, so the section's
       own index has to appear here or landing on Compete would draw a bar with
       nothing lit — a switcher that claims you are nowhere. It is called
       Lineups, plural, for the reason the section stopped being called Lineup:
       with a lobby you have one per contest. */
    children: [
      { href: "/fantasy/compete", label: "Lineups", icon: "lineup" },
      CONTESTS,
      /* THE SAME ERRAND, ON THE OTHER BOARD. Packs is declared `detached` (see
         its own note under Collect) so it draws as the round button after the
         tray rather than as a third place.
         It belongs on both strips for the reason it belongs anywhere: the shop
         is where a thin roster gets thicker, and the screen you are on when you
         discover the roster is thin is at least as often the lineup you are
         trying to fill as the inventory you are sorting. A door that only
         exists on one of the two boards is a door you have to remember the
         location of. */
      PACKS,
    ],
    /* NO CHILDREN, and it is the only board with none. Its second view became a
       sheet reached from the carousel — see `CONTESTS` — which leaves one page
       under this row and nothing for a bar to switch between. `SectionNav`
       draws nothing for an empty section and `webSectionOf` folds no tabs, so
       both presentations answer correctly without being told. */
  },
  /* COLLECT: the cards you own.
     NO CHILDREN, which makes it the second board with none. Sets was the other
     view and is a sheet now — see `SETS` — so there is one page under this row
     and nothing for a bar to switch between. Same shape as Compete, and the
     same three presentations answer correctly without being told: `SectionNav`
     draws nothing, `webSectionOf` folds no tabs, and the rail keeps the board
     as one row. */
  {
    href: "/fantasy/collect",
    label: "Collect",
    icon: "collection",
    /* The same two-real-destinations argument as Compete above, arriving at the
       same answer one commit later. a48b419 made Sets a sheet on the reasoning
       that the exit belongs on the board holding the cards it is an exit for —
       which is still true, and is why the toolbar chip stays. What it does not
       settle is where Sets LIVES: a chip is a shortcut, and a shortcut is not a
       reason for the destination to be homeless.
       Inventory rather than Collection, because the section is already called
       Collect and a tab repeating its parent's word says nothing. */
    children: [
      { href: "/fantasy/collect", label: "Inventory", icon: "inventory" },
      SETS,
      /* PACKS RIDES THE STRIP AS A ROUND BUTTON, not as a third tab, and
         `detached` is what says so — `ActionBar` splits it out of the tray and
         draws it after, filled in the accent, at `ActionDiameter`.
         The distinction it encodes is the one this section kept running into:
         the tray is a set of PLACES, each somewhere you can be, and the
         highlight says which one you are on. Packs is an errand — you open it,
         spend in it, and put it down — so as a cell it would be a third board
         you navigate to, and it would have no highlight of its own to show once
         you were "on" it. Round, outside the tray, is the shape the app already
         uses for that everywhere else.
         `takeover` keeps it a sheet: `SectionNav` pushes it rather than
         replacing, so the board underneath survives and closing puts you back
         on it. And `detached` keeps it out of `webSectionOf`, so the wide
         heading folds Inventory and Sets only — Packs has its own rail row
         there, which is where a desktop puts an errand. */
      PACKS,
    ],
    /* COLLECT CARRIES THE DAILY-PACK DOT, because Collect carries the shop —
       see `PACKS`, which is a chip on this board's toolbar and, on a phone,
       the only deliberate door to it.
       
       That thinness is exactly what the dot is for. The free daily comes back
       every UTC day and NOTHING said so: a player had to open a board they had
       no other reason to visit, on the chance that something was waiting. The
       door stays where the intent forms; the NEWS travels, which is the half
       that was missing. The dot is the cheapest thing that can travel — six
       points, drawn over the label rather than beside it, so the strip's
       spacing and its touch slop are untouched. */
    badge: "dailyPack",
  },
  /* PLAYERS, which was a bottom TAB for three days and is a board again.
   *
   * IT CAME BACK, and the argument that sent it down to the bottom bar was not
   * wrong so much as overtaken. That argument was: the pool of every player in
   * the league is not a view of your own team, so it is an errand of the same
   * kind as checking the scores. True — but the bottom bar is the APP's
   * navigation now, and the app has a second product in it. A bar holding Yap,
   * Leagues, Players, Scores and Profile puts one of the game's own boards at
   * the same rank as the game, which is the level confusion the bar was
   * reorganised to remove.
   *
   * THIRD, NOT SECOND, and the order is the week rather than the grammar: play
   * your team, sort out what you own, see what else is out there, then see
   * where all of that put you. It sat second for one commit, between Compete
   * and Collect, which split the two boards that are about YOUR team with one
   * that is about everybody's. The two pairs read better whole — your side of
   * the game first, the rest of it after — and it puts Players next to Leaders,
   * which is where the other two outward-looking boards belong.
   *
   * "PLAYERS" RATHER THAN "ALL CARDS", which reverses the rename of 2026-08-24.
   *
   * The argument for All Cards was that every row on these three views is a
   * card TEMPLATE — what it costs to pull, what it has scored, what tier your
   * copy is — so Players named the person on the front of the card rather than
   * the thing you can own. That is accurate and it is not what the word has to
   * do here. This is a NAVIGATION LABEL, and the job of one is to tell a reader
   * where they will land before they press it. Players does that in a word
   * everyone already has; All Cards was a more precise name for a distinction
   * the reader has not been given a reason to care about yet, and precision
   * bought at the cost of recognition is a bad trade in a bar.
   *
   * It also settled a collision the strip had been working around. The board's
   * own views were Search, Trend and Top — all three about players — under a
   * heading that insisted they were about cards. Two of the three are
   * orderings of one board now and the strip is gone, which retires the
   * collision rather than settling it.
   *
   * ROUTE UNCHANGED, as it was through the last rename too: `/fantasy/players`
   * is what every deep link, both `dismissTo` fallbacks and the whole
   * `components/players` tree already say. The route now agrees with the label
   * again, which is a small bonus rather than the reason.
   *
   * THE STRIP FITS, and this direction is the safe one. `20260824` measured the
   * level-2 row at 320pt with four labels totalling 28 characters, and noted
   * there was no room for more. ALL CARDS to PLAYERS gives two back — 30 down
   * to 28, exactly the width the layout was measured against. */
  {
    href: "/fantasy/players",
    label: "Players",
    icon: "players",
    /* NO CHILDREN, which makes it the third board with none — Compete and
       Collect above it went the same way for the same reason. Its other two
       views, Trend and Top, were one sort key each on the board they shared
       and are controls on it now; Search is the takeover declared above. So
       there is one page under this row and nothing for a bar to switch
       between, and all three presentations answer correctly without being
       told: `SectionNav` draws nothing, `webSectionOf` folds no tabs, and the
       rail keeps the board as one row. */
  },
  /* LEADERS, which was Leaderboard-shortened-to-Board. One word in both bars
     now, so the `tabLabel` that existed to keep "Leaderboard" from truncating
     to "Leaderboa…" at 13pt is gone with it.

     IT OWNS THE WORD. Players had a sub-page called Leaders for one commit,
     which put the same word in two bars one row apart pointing at two different
     rankings; that page is called Top now. This is the board that ranks
     MANAGERS, and it is the one people mean by "the leaderboard" — see the note
     on `SEARCH` for why the rename went there rather than here, and for what
     became of the page that took it.

     It has no children, and it is the only section without any. It had two —
     STANDINGS and SCORING — and the strip they produced cost every phone screen
     a permanent row of navigation to offer one board and one reference page you
     read once. The board itself now carries a six-way switcher, so that strip
     sat directly above another strip; two rows of chrome before a single row of
     data. Scoring moved to `/scoring`, reached from Profile -> Settings.

     IT IS LAST, and it is the end of the sentence the strip tells: play your
     team, sort out what you own, see what else is out there, then see where all
     of that put you. */
  {
    href: "/fantasy/leaderboard",
    label: "Leaders",
    icon: "leaderboard",
  },
];

export const NAV_TABS: NavTab[] = [
  /* YAP. The house game takes the house name, and the label is one word because
     the bar has room for one — "Yap Fantasy" is eleven characters against a
     10pt label in a bar of fixed height, and "Fantasy" alone was already the
     one that clipped (see `tabLabel` in the tabs layout). The product is Yap
     Fantasy everywhere it has room to be; down here it is Yap.
   *
   * IT ONLY WORKS BECAUSE LEAGUES IS NEXT TO IT. On its own "Yap" names no
   * contents — it says ours and nothing else, which is not what a tab is for.
   * The pair is what carries the meaning: our game, your league. If Leagues is
   * ever removed, this label has to be reconsidered rather than left standing.
   *
   * THE ROUTE IS STILL `/fantasy`. A label is a word and a route is an address
   * with deep links, `dismissTo` targets and a directory on disk behind it;
   * renaming the second to agree with the first buys the reader nothing. */
  {
    href: "/fantasy",
    label: "Yap",
    icon: "fantasy",
    sections: FANTASY_SECTIONS,
  },
  /* LEAGUES: private leagues, and a placeholder until they exist.
   *
   * It ships empty on purpose rather than waiting to ship full. The bar is the
   * one place the app states what it is, and a bar that says only Yap is a bar
   * that says this is a card game — the second product has to be visible from
   * the first day for the first to read as one half of something.
   *
   * Second, not last: it is the only other PRODUCT here. Scores and Profile are
   * a reference page and an account, so the two games sit together at the front
   * and the furniture follows them. */
  { href: "/leagues", label: "Leagues", icon: "leagues" },
  /* The league's own week, rather than yours. It was a band across the top of
     the lineup until it had somewhere better to be; a page can hold the week
     picker and the per-game leaders that the band had no room for. */
  { href: "/scores", label: "Scores", icon: "scores" },
  { href: "/profile", label: "Profile", icon: "profile" },
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
  return tab.href.replace(/^\//, "");
}

/**
 * A section's or a tab's sub-pages, in order. `SectionNav` turns these into bar
 * items.
 *
 * Both are asked because the bar is drawn the same way at either level — a
 * section and a tab each hand it an href and get their own children back, and
 * neither has to know which list it lives in. Only sections have children
 * today; see `NavTab.children` for why the tab branch stays.
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
 * `PACKS` is the reason for the last four terms, and `CONTESTS`, `SETS` and
 * `SEARCH` joined it: all four are destinations the rail lists and takeovers
 * `isOverlayPath` must know about, and all four are drawn by a page rather
 * than by anybody's nav — so they appear in no `children` array and walking the
 * tree alone would miss them.
 *
 * `SEARCH` is the newest and arrived by a different road: it USED to be a
 * child of Players, and stopped being one when that section's other two views
 * became sort keys on the board and left no bar behind them.
 */
function allChildren(): NavChild[] {
  return [
    ...FANTASY_SECTIONS.flatMap((s) => s.children ?? []),
    ...NAV_TABS.flatMap((t) => t.children ?? []),
    PACKS,
    CONTESTS,
    SETS,
    SEARCH,
  ];
}

/* ------------------------------------------------------------------------- *
 * LEVEL 0: WIDE WEB
 *
 * A browser window is not a phone with more pixels, and the three-level tree
 * above is the shape a phone forced on us. Fifteen rows of indented rail was
 * the app's own file structure printed down the side of the window: to reach
 * Top you read "Fantasy", then "Players", then "Leaders" — three words to name
 * one board, two of which are not places you can be. (Those were the labels at
 * the time; the board is Players and the view is Top now.) `/fantasy` is a
 * redirect and `/fantasy/players` was itself a label rather than a page, so
 * two of the rail's ranks were pretending to be destinations.
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
 *   to put the shop on the street, and burying the one screen that spends coins
 *   two levels down was costing it every impression.
 *
 * AND SECTIONS FOLD RATHER THAN SPLIT. Inventory/Sets and Search/Trend/
 * Leaders are not four and three destinations — they are two boards each with
 * a couple of views, and the phone only made them routes because a phone has
 * nowhere to put a view switcher. Players has since taken that argument all
 * the way: its views are controls on one board, on every platform. On web the row is the board and the views
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
  { set: "tab"; name: TabIconName } | { set: "action"; name: ActionIconName };

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
  /* FOLDED BOARDS. Each is one row on the rail with its views as page tabs
     — the same fold Collection/Sets had before they were split apart, restored
     because they are genuinely one board again, and now matched by Compete.
     The rail was never the thing that wanted them separate; a phone was. */
  { href: "/fantasy/compete", section: "/fantasy/compete", measure: "form" },
  /* THE LOBBY AND SETS ARE NOT ROWS ANY MORE. Each had one here while it was a
     sheet — the treatment `/packs` still gets below, on the argument that a
     sheet is not a view of the board and a rail has room to name it outright.
     Both are pages under their sections now, so `webSectionOf` folds them into
     that section's heading tabs, and leaving the rows in would list each screen
     twice on a desktop: once as a peer of the board it lives in, and again as a
     tab inside it. The fold is what a wide screen has instead of the phone's
     strip, and it is fed by the same `children` — declare the page once, and
     both presentations pick it up. */
  { href: "/fantasy/collect", section: "/fantasy/collect", measure: "table" },
  /* Directly under the board that makes you want more cards, which is the
     question it answers. It is still the sheet it is on a phone (see
     `(app)/_layout`), opened over the app rather than navigated to; a rail row
     that opens a sheet is the same bargain as a toolbar button that does, and
     the alternative — a second, desktop-only packs PAGE — would be two
     implementations of one shop. */
  { href: "/packs" },
  /* NO LONGER FOLDED, and it is the one row that unfolded rather than the rail
     changing its mind. Players had three views and now has one page: Trend and
     Top became orderings on it, so there are no tabs left to hang in the
     heading — `webSectionOf` returns null for a board with fewer than two, and
     the page keeps its own heading and its own `measure`.
 
     `section` IS GONE WITH THEM, deliberately, rather than left pointing at an
     empty array. A fold declared for a board that cannot fold is a claim the
     next reader has to disprove, and `measure` only ever applied through it.
 
     `also` STAYS AND IS NOW THE WHOLE REASON THIS ROW KNOWS ABOUT SEARCH. The
     takeover is mounted above the tab navigator at a root-level `/search`, so
     nothing about the path says Players — without this line the rail would go
     dark the moment a reader opened search from the board. Its place in the
     list is the phone strip's order with Packs spliced in after the board that
     sells it. */
  { href: "/fantasy/players", also: ["/search"] },
  { href: "/fantasy/leaderboard" },
  /* THE OTHER PRODUCT, and the break above it is the one place the flat rail
     still says "different kind of thing". Everything above is a board of the
     card game; these two are not. */
  { href: "/leagues", spacedAbove: true },
  /* Last, because it is the only row that is not about you: the others are your
     lineup, your cards, your packs, your rank and your leagues, and this is the
     league's own week. */
  { href: "/scores" },
];

/**
 * The name and glyph a rail row takes from the tree above.
 *
 * NOTHING ABOVE IS RETYPED IN `WEB_NAV_SPEC`, and that is the whole point of
 * the lookup. The first version spelled out all six labels and all six icons,
 * which is precisely the parallel copy this file's header warns about — rename
 * "Leaders" in FANTASY_SECTIONS and the rail would quietly keep the old word —
 * which is not hypothetical: that section has been renamed twice. Every row's key already appears in the tree exactly once, so the tree
 * can simply be asked.
 *
 * WHICH ARRAY ANSWERS ALSO SAYS WHICH GLYPH SET IT IS. Sections and tabs carry
 * a `TabIconName`, children carry an `ActionIconName`, so the tag falls out of
 * the lookup with no casts and nothing to declare beside the href. Packs is the
 * only row that resolves to a child, and the only row needing the verb set.
 *
 * PARENTS BEFORE CHILDREN, and the order is load-bearing. It was Players that
 * proved it: `/fantasy/players` was both the SECTION and the href of its Trend
 * child, and the rail row had to be captioned with the board's name rather
 * than the view's. That collision went with the child; the ordering stays,
 * because it is the rule and the next folded board will need it.
 */
function resolveRow(key: string): { label: string; icon: WebNavIcon } {
  const section = FANTASY_SECTIONS.find((s) => s.href === key);
  if (section)
    return { label: section.label, icon: { set: "tab", name: section.icon } };

  const tab = NAV_TABS.find((t) => t.href === key);
  if (tab) return { label: tab.label, icon: { set: "tab", name: tab.icon } };

  const child = allChildren().find((c) => c.href === key);
  if (child)
    return { label: child.label, icon: { set: "action", name: child.icon } };

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
 * the route: opening Packs from a folded board re-titled the page behind the
 * dialog with the name of the view rather than the board, and dropped its tab
 * row, then put both back when you closed it. The rail is the opposite case and is correct as it is —
 * Packs IS a rail row, and it should light while its sheet is open. The two
 * genuinely want different answers, which is why this is a separate question
 * rather than a fix to the matcher.
 *
 * Two sources, and both are named because neither can be derived from the
 * other: the takeovers are declared in the tree above (`/packs` under two
 * sections, `/search` under Players), and the profile sheets are
 * declared as `Stack.Screen`s in `(app)/_layout.tsx` and appear nowhere in this
 * file's tree. If a fourth sheet is added there, add it here.
 */
const SHEET_PREFIXES = ["/player/", "/card/", "/set/", "/contest/"] as const;

/**
 * The SHEETS ONLY — the half of `isOverlayPath` that every surface agrees on.
 *
 * It exists because the rail does not agree about the other half. The note
 * above argues that Packs IS a rail row and should light while its sheet is
 * open, so `Sidebar` must not freeze on a takeover the way `Screen` does — but
 * it must freeze on `/card/abc`, which belongs to no row at all and otherwise
 * leaves the rail with nothing marked. One predicate could not say both, and
 * the disagreement is real rather than an oversight, so it is named.
 */
export function isSheetPath(pathname: string): boolean {
  return SHEET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isOverlayPath(pathname: string): boolean {
  const takeovers = allChildren().filter((c) => c.takeover);
  if (takeovers.some((c) => c.href === pathname)) return true;
  return isSheetPath(pathname);
}
