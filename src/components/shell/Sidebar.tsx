/**
 * Web navigation. Replaces the bottom tab bar on a wide window.
 *
 * The point of the rail is that it can show the sub-pages as real destinations
 * — Players and Shop are separate rows here, where on mobile they collapse into
 * a segmented control because there is no room for eight targets.
 */
import { Link, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Gem, initialsOf } from '@/components/shell/AppHeader';
import { Colors, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };
const BAND = '#0E0F12';

type Item = { href: string; label: string; children?: { href: string; label: string }[] };

const NAV: Item[] = [
  { href: '/lineup', label: 'Lineup' },
  { href: '/leaderboard', label: 'Leaderboard' },
  {
    href: '/cards',
    label: 'Cards',
    children: [
      { href: '/cards/players', label: 'Players' },
      { href: '/cards/shop', label: 'Shop' },
    ],
  },
  {
    href: '/collection',
    label: 'Collection',
    children: [
      { href: '/collection/inventory', label: 'Inventory' },
      { href: '/collection/sets', label: 'Sets' },
    ],
  },
  { href: '/profile', label: 'Profile' },
];

export function Sidebar() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const accent = TierColors[scheme].gold.accent;
  const pathname = usePathname();
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
        {NAV.map((item) => {
          // A parent is active when the path is inside it, so /cards/shop keeps
          // Cards lit as well as Shop.
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <View key={item.href}>
              <NavRow href={item.href} label={item.label} active={active} accent={accent} />
              {item.children && active
                ? item.children.map((child) => (
                    <NavRow
                      key={child.href}
                      href={child.href}
                      label={child.label}
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

      <Link href="/profile" asChild>
        <Pressable style={({ pressed }) => [styles.account, pressed && styles.pressed]}>
          <View style={[styles.avatar, { borderColor: accent }]}>
            <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
          </View>
          <Text style={styles.accountName} numberOfLines={1}>
            {displayName}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

function NavRow({
  href,
  label,
  active,
  accent,
  nested,
}: {
  href: string;
  label: string;
  active: boolean;
  accent: string;
  nested?: boolean;
}) {
  return (
    <Link href={href as never} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.row,
          nested && styles.nestedRow,
          active && !nested && { backgroundColor: 'rgba(255,255,255,0.07)' },
          pressed && styles.pressed,
        ]}>
        {active ? <View style={[styles.marker, { backgroundColor: accent }]} /> : null}
        <Text
          numberOfLines={1}
          style={[
            nested ? styles.nestedLabel : styles.label,
            { color: active ? '#FFFFFF' : 'rgba(255,255,255,0.62)' },
          ]}>
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  rail: { width: 236, paddingVertical: 20, justifyContent: 'flex-start' },
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
  marker: { width: 3, height: 14, borderRadius: 2 },
  label: { fontSize: 14, fontWeight: '600' },
  nestedLabel: { fontSize: 13, fontWeight: '500' },
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
