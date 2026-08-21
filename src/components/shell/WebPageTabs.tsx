/**
 * The views of a folded board, as tabs in the page's own heading. Wide web
 * only.
 *
 * WHAT IT IS STANDING IN FOR. On a phone Inventory and Sets are two rows of the
 * Collection action bar, and Trend and Leaders two rows of the Players one —
 * because a phone has nowhere else to put a view switcher and every level of
 * navigation has to be a strip. The wide rail used to mirror that, listing all
 * five as indented children, which made the sidebar a printout of the route
 * tree rather than a list of places. The rail is flat now (see `WEB_NAV`) and
 * the views moved here, next to the board they belong to.
 *
 * THEY ARE ROUTES, WHICH IS WHY THIS IS NOT `ui/Tabs`. That component switches
 * what a screen SHOWS and keeps the URL still, which is right for
 * "Season/Career/Splits" on one page. These change the URL, because on a phone
 * they always have and the paths are the app's — folding them into local state
 * on web would give the two platforms different URLs for the same board and
 * break every deep link that already exists.
 *
 * REPLACE, NOT PUSH, for the same reason the phone's own nav does: the views
 * are peers you flip between, and pushing would build a back stack out of every
 * toggle — three clicks around a two-view board and Back has to be pressed
 * three times to leave it. A `takeover` child is the exception and is pushed,
 * because it is something you put down again rather than navigate away from.
 *
 * The active view is INCLUDED and marked, not dropped. You are already there,
 * but with the heading now naming the BOARD rather than the view, this row is
 * the only thing on the page that says which of the two you are looking at.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WebPageTab } from '@/components/shell/sections';
import { Colors, selectionAccent, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function WebPageTabs({
  tabs,
  /**
   * Passed in rather than read from the router, because `Screen` has already
   * resolved it — including the dev-gallery override. Reading it again here
   * would make the active mark the one part of this control that ignores the
   * override, which is the part the override exists to show.
   */
  pathname,
}: {
  tabs: WebPageTab[];
  pathname: string;
}) {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    /* One hairline under the whole row, so the marks read as underlines ON a
       baseline rather than as loose dashes — the same construction
       `FantasyTopNav` uses on a phone, which is deliberate: a reader moving
       between a laptop and a handset should recognise the control. */
    <View style={[styles.row, { borderBottomColor: c.border }]}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() =>
              tab.takeover
                ? router.push(tab.href as never)
                : router.replace(tab.href as never)
            }
            style={({ pressed, hovered }) => [
              styles.tab,
              pressed && styles.pressed,
              // `hovered` is react-native-web's own Pressable state. There is
              // no touch equivalent and none is needed: this control only ever
              // renders on a pointer device.
              hovered && !active && styles.hovered,
            ]}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? c.text : c.textSecondary }]}>
              {tab.label}
            </Text>
            {/* Always drawn, transparent when inactive, so selecting a view
                never changes the row's height and nudges the page under it. */}
            <View
              style={[styles.rule, { backgroundColor: active ? accent : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /* The rule hugs the word — `alignSelf: 'stretch'` on an item sized by its
     label — rather than filling an equal share of the row. An underline wider
     than the thing it underlines reads as a highlighted region. */
  tab: { alignItems: 'center', gap: 7, paddingTop: 2 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  rule: { height: 2, alignSelf: 'stretch', borderRadius: 1 },
  hovered: { opacity: 0.85 },
  pressed: { opacity: 0.6 },
});
