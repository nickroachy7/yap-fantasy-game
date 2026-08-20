/**
 * Web navigation. Replaces the bottom tab bar on a wide window.
 *
 * The point of the rail is that it can show every level of the navigation as
 * real destinations at once — Fantasy, its four boards, and their sub-pages are
 * separate rows here, where on a phone they are three stacked strips (bottom
 * bar, top nav, action bar) because there is no room for fifteen targets.
 *
 * THREE LEVELS, DRAWN IN FULL, and none of them collapse. The rail used to
 * expand only the active section, which meant the shortest path from Inventory
 * to Trend was two clicks with a guess in the middle: you could not see that
 * Trend existed until you were already in Cards. Fifteen rows fit a browser
 * window comfortably, and being able to read the whole app at once is most of
 * what a sidebar is for. The active row keeps its fill and accent marker, so
 * "where am I" is still answered at a glance.
 *
 * INDENT IS THE ONLY THING THAT SAYS "INSIDE". Tab and board rows carry the
 * glyphs the bottom bar and the top nav use, from the same `icon` fields on
 * NAV_TABS and FANTASY_SECTIONS — without them the presentations of one
 * navigation shared no visual vocabulary at all, so moving between a phone and
 * a desktop meant relearning the app by its labels. Sub-page rows stay
 * text-only: they are children of a row that is already marked, and six more
 * glyphs would flatten the hierarchy the indent exists to show.
 */
import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem, initialsOf } from '@/components/shell/AppHeader';
import { NAV_TABS } from '@/components/shell/sections';
import { TabIcon, type TabIconName } from '@/components/shell/TabIcon';
import { RailWidth, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };
const BAND = '#0E0F12';

/**
 * @param pathnameOverride Dev galleries only. The rail's active and nested
 * states are the part most likely to be wrong, and they are unreachable from a
 * gallery route because the real pathname never matches a nav href — so they
 * went unseen. Product code passes nothing and uses the real router.
 */
export function Sidebar({ pathnameOverride }: { pathnameOverride?: string } = {}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const accent = TierColors[scheme].gold.accent;
  const realPathname = usePathname();
  const pathname = pathnameOverride ?? realPathname;
  const { gems, displayName, loading } = usePlayer();

  return (
    <View style={[styles.rail, { backgroundColor: BAND }]}>
      <View style={styles.brandBlock}>
        <Text style={styles.wordmark}>YAP FANTASY</Text>
        <View style={[styles.gems, { borderColor: accent }]}>
          <Gem color={accent} size={10} />
          <Text style={[styles.balance, NUMERIC]}>{loading ? '—' : gems.toLocaleString()}</Text>
          <Text style={styles.gemsLabel}>gems</Text>
        </View>
      </View>

      <View style={styles.nav}>
        {NAV_TABS.map((tab) => {
          // The whole TRAIL is lit and only the leaf is filled — see `NavRow`.
          // So /fantasy/collection/sets whitens Fantasy, Collection and Sets,
          // and fills Shop alone.
          return (
            <View key={tab.href} style={styles.group}>
              <NavRow
                href={tab.href}
                label={tab.label}
                icon={tab.icon}
                active={isInside(pathname, tab.href)}
                current={pathname === tab.href}
                accent={accent}
              />
              {tab.sections?.map((section) => (
                <View key={section.href}>
                  <NavRow
                    href={section.href}
                    label={section.label}
                    icon={section.icon}
                    active={isInside(pathname, section.href)}
                    current={pathname === section.href}
                    accent={accent}
                    depth={1}
                  />
                  {/* A section's first child shares the section's own href — the
                      phone's action bar needs an item for the landing page. The
                      rail does not: the parent row IS that link, so rendering
                      the child too puts two rows pointing at one destination
                      directly under each other. */}
                  {section.children
                    ?.filter((child) => child.href !== section.href)
                    .map((child) => (
                      <NavRow
                        key={child.href}
                        href={child.href}
                        label={child.label}
                        badge={child.badge}
                        active={pathname === child.href}
                        current={pathname === child.href}
                        accent={accent}
                        depth={2}
                      />
                    ))}
                </View>
              ))}
            </View>
          );
        })}
      </View>

      {/* Same defect as NavRow: the style must not be a function here. */}
      <Link href="/profile" asChild>
        <Pressable>
          {({ pressed }) => (
            <View style={[styles.account, pressed && styles.pressed]}>
              <View style={[styles.avatar, { borderColor: accent }]}>
                <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
              </View>
              <Text style={styles.accountName} numberOfLines={1}>
                {displayName}
              </Text>
            </View>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

/**
 * Is `pathname` at or inside `href`?
 *
 * The boundary check is not decoration: a bare `startsWith` would light
 * `/fantasy/lineup` for a future `/fantasy/lineups`, and a rail that marks the
 * wrong row is worse than one that marks none.
 */
function isInside(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  href,
  label,
  badge,
  icon,
  active,
  current,
  accent,
  depth = 0,
}: {
  href: string;
  label: string;
  /** e.g. "Soon" on Sets — the same signal the mobile action bar gives. */
  badge?: string;
  /** Tab and board rows only. Sub-pages are text, see the header. */
  icon?: TabIconName;
  /**
   * The path is at or inside this row. Lights the label, the glyph and the
   * marker, so the whole trail down to the open page reads as one run.
   */
  active: boolean;
  /**
   * The path IS this row — the leaf of that trail, and the only row that fills.
   *
   * Two flags rather than one because three levels changed what "active" can
   * mean. With a flat rail they were the same question; with a nested one,
   * filling every ancestor gives three highlighted rectangles and three answers
   * to "where am I", while filling only the leaf and leaving the ancestors grey
   * hides which branch you are in. Lighting the trail and filling its end says
   * both at once — and it is the reason the Fantasy row can show anything at
   * all now that `/fantasy` redirects straight through to the lineup and is
   * never a page you are ON.
   */
  current: boolean;
  accent: string;
  /** 0 tab, 1 board, 2 sub-page. Drives the indent and the type. */
  depth?: 0 | 1 | 2;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={href as never} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}>
        {({ pressed }) => (
          /* The visual style lives on this View, NOT on the Pressable.
           *
           * `Link asChild` clones its child into an anchor, and a FUNCTION
           * style — `({pressed}) => [...]` — does not survive that clone. It
           * was silently dropped, so every row in the rail rendered with React
           * Native Web's default View styling: column direction, no padding,
           * no min-height, no active background. The active marker stacked
           * ABOVE its label instead of beside it, the "Soon" badge sat under
           * "Sets", and the account name ran to the full rail width ignoring
           * its padding. Nothing errored; the rail just quietly had no layout.
           *
           * A plain style array on a plain View clones intact. */
          <View
            style={[
              styles.row,
              INDENT[depth],
              current && styles.activeRow,
              hovered && !active && styles.hoveredRow,
              pressed && styles.pressed,
            ]}>
            {/* Reserved whether or not it is drawn, so labels do not shift
                sideways as the active row changes. */}
            <View
              style={[styles.marker, active && { backgroundColor: accent }]}
            />
            {icon ? (
              /* The rail is a fixed dark band in both schemes, so these are
                 the band's own white ramp rather than theme colours — the same
                 two values the label below uses, so icon and text always agree
                 about whether the row is active. */
              <TabIcon
                name={icon}
                color={active ? '#FFFFFF' : 'rgba(255,255,255,0.62)'}
                focused={active}
                size={depth === 0 ? 18 : 16}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                LABEL[depth],
                { color: active ? '#FFFFFF' : 'rgba(255,255,255,0.62)' },
              ]}>
              {label}
            </Text>
            {badge ? <Text style={styles.badge}>{badge}</Text> : null}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  rail: { width: RailWidth, paddingVertical: 20, justifyContent: 'flex-start' },
  brandBlock: { paddingHorizontal: 18, gap: 12, marginBottom: 22 },
  wordmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1.8 },
  gems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  balance: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  gemsLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600' },
  nav: { paddingHorizontal: 10, flex: 1 },
  /* Sections need air between them now that every one is expanded: with a flat
     2pt gap the whole rail read as eleven peers rather than four groups. The
     space goes BELOW each group so the first section still sits tight under
     the wordmark. */
  group: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 9,
    minHeight: 40,
  },
  /* Each rank is indented past the one above it, so a row sits visibly INSIDE
     its parent rather than aligning with it — aligning two labels exactly reads
     as two peers, which is the relationship these rows are not in. The step
     shrinks (16 then 12) because by the third rank the indent is competing with
     the rail's own width for the label. */
  tabRow: {},
  sectionRow: { paddingVertical: 8, paddingLeft: 26, minHeight: 36 },
  childRow: { paddingVertical: 7, paddingLeft: 48, minHeight: 32 },
  marker: { width: 3, height: 14, borderRadius: 2, backgroundColor: 'transparent' },
  activeRow: { backgroundColor: 'rgba(255,255,255,0.07)' },
  hoveredRow: { backgroundColor: 'rgba(255,255,255,0.035)' },
  tabLabel: { fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 13.5, fontWeight: '600' },
  childLabel: { fontSize: 13, fontWeight: '500' },
  badge: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avatarText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  accountName: { color: 'rgba(255,255,255,0.8)', fontSize: 13, flexShrink: 1 },
  pressed: { opacity: 0.7 },
});

/** Indent and type per rank, so `NavRow` reads as one row with three sizes. */
const INDENT = [styles.tabRow, styles.sectionRow, styles.childRow] as const;
const LABEL = [styles.tabLabel, styles.sectionLabel, styles.childLabel] as const;
