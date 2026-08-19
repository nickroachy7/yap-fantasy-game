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
 * The current page is INCLUDED, marked active. It is tempting to drop it — you
 * are already there — but on a phone nothing else says which sub-page you are
 * on: the tab bar names the section, and `Screen` only draws a page heading on
 * wide web. The active item is the answer, and it doubles as the way back from
 * a filter you left open.
 *
 * Filters come after, from the screen, because only the screen knows what it
 * can filter by. Order matters and is deliberate: pages first, then facets, so
 * the leftmost items are the ones that change what page you are on.
 *
 * On wide web the pages drop out and only the facets remain — `ActionBar` does
 * that, and the rail is why.
 */
import { usePathname, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { ActionBar, type Action } from '@/components/shell/ActionBar';
import { childrenOf } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';

export function SectionNav({
  section,
  extra,
}: {
  /** The section's own href, e.g. `/collection`. */
  section: string;
  /** The screen's own filter actions, appended after the pages. */
  extra?: Action[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const wide = useIsWide();

  const actions = useMemo<Action[]>(() => {
    const pages = childrenOf(section).map<Action>((child) => ({
      key: child.href,
      label: child.label,
      icon: child.icon,
      badge: child.badge,
      active: pathname === child.href,
      nav: true,
      // replace, not push: these are peers, and pushing would build a back
      // stack of every toggle between them.
      onPress: () => router.replace(child.href as never),
    }));
    return [...pages, ...(extra ?? [])];
  }, [section, pathname, router, extra]);

  return <ActionBar actions={actions} wide={wide} />;
}
