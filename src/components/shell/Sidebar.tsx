/**
 * Web navigation. Replaces the bottom tab bar on a wide window.
 *
 * The point of the rail is that it can show the sub-pages as real destinations
 * — Players and Shop are separate rows here, where on mobile they collapse into
 * a segmented control because there is no room for eight targets.
 *
 * EVERY sub-page is drawn, not just the ones inside the section you are in.
 * The rail used to expand only the active section, which meant the shortest
 * path from Inventory to Trend was two clicks with a guess in the middle: you
 * could not see that Trend existed until you were already in Cards. Eleven rows
 * fit a browser window comfortably, and being able to read the whole app at
 * once is most of what a sidebar is for. The active section keeps its filled
 * row and accent marker, so "where am I" is still answered at a glance.
 *
 * Section rows carry the same glyphs as the bottom tab bar, from the same
 * `icon` field on NAV_SECTIONS. Without them the two presentations of one
 * navigation shared no visual vocabulary at all, so moving between a phone and
 * a desktop meant relearning the app by its labels. Sub-page rows stay
 * text-only: they are children of a row that is already marked, and five more
 * glyphs would flatten the hierarchy the indent exists to show.
 */
import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem, initialsOf } from '@/components/shell/AppHeader';
import { NAV_SECTIONS } from '@/components/shell/sections';
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
        {NAV_SECTIONS.map((item) => {
          // A parent is active when the path is inside it, so /cards/shop keeps
          // Cards lit as well as Shop.
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <View key={item.href} style={styles.group}>
              <NavRow
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                accent={accent}
              />
              {/* A section's first child shares the section's own href — the
                  mobile segmented control needs a segment for the landing page.
                  The rail does not: the parent row IS that link and already
                  shows its active state, so rendering the child too puts two
                  rows pointing at one destination directly under each other. */}
              {item.children
                ? item.children
                    .filter((child) => child.href !== item.href)
                    .map((child) => (
                      <NavRow
                        key={child.href}
                        href={child.href}
                        label={child.label}
                        badge={child.badge}
                        active={pathname === child.href}
                        accent={accent}
                        nested
                      />
                    ))
                : null}
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

function NavRow({
  href,
  label,
  badge,
  icon,
  active,
  accent,
  nested,
}: {
  href: string;
  label: string;
  /** e.g. "Soon" on Sets — the same signal the mobile segmented control gives. */
  badge?: string;
  /** Section rows only. Sub-pages are text, see the header. */
  icon?: TabIconName;
  active: boolean;
  accent: string;
  nested?: boolean;
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
              nested && styles.nestedRow,
              active && !nested && styles.activeRow,
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
                size={18}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                nested ? styles.nestedLabel : styles.label,
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
  /* Indented past the marker and the icon column, so a sub-page sits visibly
     INSIDE its parent rather than aligning with it. Aligning the two labels
     exactly reads as two peers, which is the relationship this row is not in. */
  nestedRow: { paddingVertical: 7, paddingLeft: 40, minHeight: 32 },
  marker: { width: 3, height: 14, borderRadius: 2, backgroundColor: 'transparent' },
  activeRow: { backgroundColor: 'rgba(255,255,255,0.07)' },
  hoveredRow: { backgroundColor: 'rgba(255,255,255,0.035)' },
  label: { fontSize: 14, fontWeight: '600' },
  nestedLabel: { fontSize: 13, fontWeight: '500' },
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
