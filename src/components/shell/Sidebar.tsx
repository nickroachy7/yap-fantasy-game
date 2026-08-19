/**
 * Web navigation. Replaces the bottom tab bar on a wide window.
 *
 * The point of the rail is that it can show the sub-pages as real destinations
 * — Players and Shop are separate rows here, where on mobile they collapse into
 * a segmented control because there is no room for eight targets.
 */
import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Gem, initialsOf } from '@/components/shell/AppHeader';
import { NAV_SECTIONS } from '@/components/shell/sections';
import { RailWidth, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';

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
            <View key={item.href}>
              <NavRow href={item.href} label={item.label} active={active} accent={accent} />
              {/* A section's first child shares the section's own href — the
                  mobile segmented control needs a segment for the landing page.
                  The rail does not: the parent row IS that link and already
                  shows its active state, so rendering the child too puts two
                  rows pointing at one destination directly under each other. */}
              {item.children && active
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
  active,
  accent,
  nested,
}: {
  href: string;
  label: string;
  /** e.g. "Soon" on Sets — the same signal the mobile segmented control gives. */
  badge?: string;
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
  nav: { gap: 2, paddingHorizontal: 10, flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 9,
    minHeight: 40,
  },
  nestedRow: { paddingVertical: 7, paddingLeft: 22, minHeight: 32 },
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
