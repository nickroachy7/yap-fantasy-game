/**
 * The shop, as a round button on a page rather than a cell in a bar.
 *
 * WHY IT IS A COMPONENT AND NOT A PROP. Both boards that draw it — the
 * collection and the sets list — want the same object, the same glyph, the same
 * push and the same rule about when to hide, and the one thing neither page
 * should have to know is which of those is which. It reads `PACKS` from
 * `sections.ts`, so the label and the glyph still come from the navigation
 * model even though no bar draws it any more.
 *
 * NOTHING ON WIDE. The rail carries Packs as a row of its own there, and a
 * second door two inches to the right of the first is the same duplication the
 * rail's own notes talk it out of. This is the rule `ActionBar` applied when
 * the button was a nav item; keeping it means the move did not quietly add a
 * control to the desktop layout.
 *
 * PUSH, NOT REPLACE — `/packs` is a sheet presented over the app, so the page
 * you opened it from has to still be underneath when you close it.
 */
import { useRouter } from 'expo-router';

import { DetachedAction } from '@/components/shell/ActionBar';
import { PACKS } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';

export function PacksButton() {
  const router = useRouter();
  const wide = useIsWide();

  if (wide) return null;

  return (
    <DetachedAction
      action={{
        key: PACKS.href,
        label: PACKS.label,
        icon: PACKS.icon,
        onPress: () => router.push(PACKS.href as never),
      }}
    />
  );
}
