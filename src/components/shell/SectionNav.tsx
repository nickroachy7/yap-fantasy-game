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
 * PAGES ONLY. The screen's filters used to be appended here, which made the
 * bar a different shape on every page of a section — three items on Sets and
 * seven on Inventory — so the tab strip appeared to change under you as you
 * flipped through it. It is a stable strip now: same items, same width, same
 * place, and the only thing that moves is the highlight. Filters live below it
 * as chips.
 *
 * On wide web it renders nothing at all: the rail already lists every sub-page
 * as a row, and `ActionBar` drops items marked `nav`.
 */
import { usePathname, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { ActionBar, type Action } from '@/components/shell/ActionBar';
import { childrenOf } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';

export function SectionNav({ section }: { /** e.g. `/collection`. */ section: string }) {
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
    return pages;
  }, [section, pathname, router]);

  return <ActionBar actions={actions} wide={wide} />;
}
