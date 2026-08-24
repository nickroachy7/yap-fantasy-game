/**
 * A section's sub-pages, as the first items of the page's action bar.
 *
 * This replaces `SubNav`, which drew them as a segmented control in a row of
 * its own. Two rows of navigation-shaped furniture above every browsing screen
 * — a segmented control, then a bar of icons — was one row too many on a phone,
 * and worse, it split one question into two places: "Shop" was a segment and
 * "Search" was a bar item, when to the reader both are just "take me to the
 * thing I want". They are one control now, in one row, and the segmented
 * control is gone from the app.
 *
 * THERE IS A SECOND ROW ABOVE THIS ONE AGAIN — `FantasyTopNav`, since the
 * bottom bar became the whole app's — and that is not the mistake above coming
 * back. The pair that failed were two takes on the same rank of navigation
 * competing for one job. These are two ranks: the strip above names the BOARD
 * you are on, this one names the PAGE within it. They are allowed to coexist
 * only for as long as they look nothing alike — a word with a rule under it
 * against a glyph with a word beside it. See the note there.
 *
 * The current page is INCLUDED, marked active. It is tempting to drop it — you
 * are already there — but on a phone nothing else says which sub-page you are
 * on: the strip above names the section, not the page, and `Screen` only draws
 * a page heading on wide web. The active item is the answer, and it doubles as
 * the way back from a filter you left open.
 *
 * PAGES ONLY. The screen's filters used to be appended here, which made the
 * bar a different shape on every page of a section — three items on Sets and
 * seven on Inventory — so the tab strip appeared to change under you as you
 * flipped through it. It is a stable strip now: same items, same width, same
 * place, and the only thing that moves is the highlight. Filters live below it
 * as chips.
 *
 * On wide web it renders nothing at all: the rail already lists every sub-page
 * as a row, and `ActionBar` drops items marked `nav`.
 *
 * IT IS RENDERED BY THE SECTION, NOT BY THE PAGE. `SectionFrame` draws it once
 * above the section's navigator, so flipping between sub-pages leaves it
 * untouched — see that file for what went wrong while each page drew its own.
 * The pages themselves no longer mention it.
 *
 * IT OWNS ITS OWN SPACING, all four sides, and that is the fix for the thing
 * that went wrong before.
 *
 * `Screen` pads its content horizontally when it scrolls and NOT when it does
 * not — a `scroll={false}` page hands the gutter to the virtualised list inside
 * it, which needs to bleed. So whether this bar was inset depended on which
 * kind of page it landed on, and every screen was left to make up the
 * difference: Players wrapped it in a 16pt toolbar, Collection and Leaderboard
 * rendered it bare and it ran edge to edge, and `leaderboard/scoring` — the one
 * page that scrolls — had to bleed the outer padding back with a negative
 * margin. The same control looked like three different components depending on
 * which page it landed on.
 *
 * None of that survives the move. Sitting above the navigator it lands on the
 * same surface every time, so the gutter and both vertical gaps are simply
 * fixed here and no page can get them wrong by doing nothing. `paddingTop` is
 * the 16 the content box used to give it; `paddingBottom` is the gap to the
 * filters below. `Screen` gives its content no top padding while framed — see
 * `flush` there — so these numbers are the whole story.
 */
import { usePathname, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionBar, type Action } from '@/components/shell/ActionBar';
import { childrenOf } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';
import { Spacing } from '@/constants/theme';

export function SectionNav({ section }: { /** e.g. `/fantasy/collect`. */ section: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const wide = useIsWide();

  const actions = useMemo<Action[]>(() => {
    const pages = childrenOf(section).map<Action>((child) => ({
      key: child.href,
      label: child.label,
      icon: child.icon,
      active: pathname === child.href,
      nav: true,
      /* Declared per child, NOT derived from `takeover` — Search is a takeover
         and belongs in the tray. See `detached` in `sections.ts`. */
      detached: child.detached,
      /* Replace for the peers — pushing would build a back stack out of every
         toggle between three boards. Push for a takeover, so the page you left
         is still underneath it and closing puts you back on THAT page rather
         than on whichever one the takeover decided to send you to. */
      onPress: () =>
        child.takeover
          ? router.push(child.href as never)
          : router.replace(child.href as never),
    }));
    return pages;
  }, [section, pathname, router]);

  /* Early, before the wrapper. `ActionBar` would render nothing on wide anyway
     — every item here is a nav item and it drops those — but the padded View
     around it would still be in the tree, leaving a band of dead space at the
     top of every wide page.

     Same reason for the second test, which is not hypothetical: Collection and
     Sets declare no children at all now (Packs is drawn by the page, on its
     summary strip), so without it both would reserve a padded row to draw
     nothing in. */
  if (wide || actions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ActionBar actions={actions} wide={wide} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* The same 16 the rows below use, so the bar lines up with the content it
     navigates rather than sitting a few points inside or outside it. */
  wrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
