/**
 * Web navigation. Replaces the bottom tab bar on a wide window.
 *
 * ONE RANK, NOT THREE. The rail used to draw the whole navigation tree — three
 * levels, fifteen rows, indented — on the argument that being able to read the
 * entire app at once is most of what a sidebar is for. Half of that argument
 * was right and the other half was the mistake: what a reader wants to see at
 * once is every PLACE, and two of those three ranks were not places. `/fantasy`
 * is a redirect, `/fantasy/players` opens straight onto Trend, and neither row
 * could ever be the page you were on — so the rail spent two of its levels
 * naming folders, and reaching the Top view meant reading three words to arrive
 * at one board.
 *
 * Flattened it is seven rows, every one a destination, every one one click away,
 * and the indent that carried the hierarchy is gone because there is no longer
 * a hierarchy for it to carry. What the fold cost — the ability to see from the
 * rail that Collection has a Sets view — is paid back in the page's own
 * heading, where the views sit as tabs beside the board's name. That is a
 * better place for them anyway: a view switcher belongs with the thing it
 * switches, not in the furniture down the side.
 *
 * The list itself is `WEB_NAV`, which is where the two editorial calls in it —
 * Profile out, Packs promoted — are argued.
 *
 * PROFILE IS THE FOOT OF THE RAIL AND NOTHING ELSE. It was a row in the list
 * AND the account block at the bottom, which is two doors into one room with
 * the more useful of the two (the one showing who you are signed in as) placed
 * further from the eye.
 *
 * THE GROUP RULE: the five rows at the top are the card game — your lineup,
 * every card there is, your collection, the shop, the board — and the two below
 * the gap are not: Leagues is the other product and Scores is the league's own
 * week. The gap is the only structure left in the rail, and it is doing work the
 * indent used to do badly.
 */
import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { YapMark } from '@/components/brand/YapLogo';
import { ActionIcon } from '@/components/shell/ActionBar';
import { Hearts } from '@/components/runs/Hearts';
import { Gem, initialsOf } from '@/components/shell/AppHeader';
import {
  isWebNavActive,
  WEB_NAV,
  type WebNavIcon,
  type WebNavItem,
} from '@/components/shell/sections';
import { TabIcon } from '@/components/shell/TabIcon';
import { ChromeBand, RailWidth, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

/**
 * @param pathnameOverride Dev galleries only. The rail's active state is the
 * part most likely to be wrong, and it is unreachable from a gallery route
 * because the real pathname never matches a nav href — so it went unseen.
 * Product code passes nothing and uses the real router.
 */
export function Sidebar({ pathnameOverride }: { pathnameOverride?: string } = {}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const accent = TierColors[scheme].gold.accent;
  const realPathname = usePathname();
  const pathname = pathnameOverride ?? realPathname;
  const { gems, displayName, run, loading } = usePlayer();

  return (
    <View style={[styles.rail, { backgroundColor: ChromeBand }]}>
      <View style={styles.brandBlock}>
        {/* Same lockup as the phone masthead, and `ink` is ChromeBand here
            rather than the page — the rail paints its own ground, and the
            bot's face slots have to match whatever they sit on. */}
        <View style={styles.brand}>
          <YapMark height={19} ink={ChromeBand} />
          <Text style={styles.wordmark}>YAP FANTASY</Text>
        </View>
        {/* TWO PILLS, NOT ONE, and the hearts get their own because they are a
            different resource with a different failure — running out of gems
            means you cannot buy, running out of hearts means the run is over.
            Sharing a pill would read as one balance with a decorative prefix.

            The rail is the wide-web replacement for `AppHeader`, which is
            suppressed at this breakpoint, so anything the masthead shows has to
            be shown here too or it simply does not exist on desktop. */}
        <View style={styles.resources}>
          <View style={[styles.gems, { borderColor: accent }]}>
            <Gem color={accent} size={10} />
            <Text style={[styles.balance, NUMERIC]}>{loading ? '—' : gems.toLocaleString()}</Text>
            <Text style={styles.gemsLabel}>gems</Text>
          </View>
          {/* Hidden while a death is unanswered, exactly as in the masthead:
              an empty rack repeated on every screen is the death screen's line
              to deliver, not the chrome's. */}
          {!loading && run && !run.awaitingCarry ? (
            <View style={[styles.hearts, { borderColor: 'rgba(255,255,255,0.18)' }]}>
              <Hearts hearts={run.hearts} wagered={0} rack={run.rack} size={12} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.nav}>
        {WEB_NAV.map((item) => (
          <View key={item.href} style={item.spacedAbove ? styles.spacedAbove : undefined}>
            <NavRow item={item} active={isWebNavActive(item, pathname)} accent={accent} />
          </View>
        ))}
      </View>

      {/* Same defect as NavRow: the style must not be a function here. */}
      <Link href="/profile" asChild>
        <Pressable>
          {({ pressed }) => (
            <View style={[styles.account, pressed && styles.pressed]}>
              <View style={[styles.avatar, { borderColor: accent }]}>
                <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
              </View>
              <View style={styles.accountText}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.accountHint} numberOfLines={1}>
                  Profile & settings
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

/** Either of the app's two glyph sets, picked by the row's own tag. */
function RowIcon({ icon, active }: { icon: WebNavIcon; active: boolean }) {
  /* The rail is a fixed dark band in both schemes, so these are the band's own
     white ramp rather than theme colours — the same two values the label uses,
     so glyph and text always agree about whether the row is active. */
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.58)';
  return icon.set === 'tab' ? (
    <TabIcon name={icon.name} color={color} focused={active} size={18} />
  ) : (
    <ActionIcon name={icon.name} color={color} focused={active} size={18} />
  );
}

function NavRow({
  item,
  active,
  accent,
}: {
  item: WebNavItem;
  /** The reader is at or inside this row. One flag now: with the folders gone
   *  there is no longer a trail to light separately from its leaf. */
  active: boolean;
  accent: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={item.href as never} asChild>
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
           * ABOVE its label instead of beside it, and the account name ran to
           * the full rail width ignoring its padding. Nothing errored; the rail
           * just quietly had no layout.
           *
           * A plain style array on a plain View clones intact. */
          <View
            style={[
              styles.row,
              active && styles.activeRow,
              hovered && !active && styles.hoveredRow,
              pressed && styles.pressed,
            ]}>
            {/* Reserved whether or not it is drawn, so labels do not shift
                sideways as the active row changes. */}
            <View style={[styles.marker, active && { backgroundColor: accent }]} />
            <RowIcon icon={item.icon} active={active} />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? '#FFFFFF' : 'rgba(255,255,255,0.58)' },
              ]}>
              {item.label}
            </Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  rail: { width: RailWidth, paddingVertical: 20, justifyContent: 'flex-start' },
  brandBlock: { paddingHorizontal: 18, gap: 12, marginBottom: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1.8 },
  /* Wraps, so a five-heart run on a narrow rail drops to a second line rather
     than squeezing the gem figure. */
  resources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  hearts: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
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
  /* 3pt between rows rather than the 8 the old rail put between GROUPS: six
     peers want one rhythm, and the only break in it is the one `WEB_NAV`
     draws before Scores. */
  nav: { paddingHorizontal: 10, flex: 1, gap: 3 },
  /* One height for every row, because every row is now the same kind of thing.
     40 is what the tab rank used to have and the sub-page rank did not, and it
     is what makes the rail feel like a list of buttons rather than a paragraph
     with some of the lines bolded. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 9,
    minHeight: 40,
  },
  /* On top of the 3pt the list already puts between rows, so the break is
     ~4x a normal gap — enough to read as a division without looking like a
     missing row. A hairline was tried and is too much: six items do not need
     to be fenced from each other, only spaced. */
  spacedAbove: { marginTop: 11 },
  marker: { width: 3, height: 16, borderRadius: 2, backgroundColor: 'transparent' },
  activeRow: { backgroundColor: 'rgba(255,255,255,0.08)' },
  hoveredRow: { backgroundColor: 'rgba(255,255,255,0.04)' },
  label: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
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
  accountText: { flexShrink: 1, gap: 1 },
  accountName: { color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '600' },
  /* The second line is what stops the foot of the rail being a name with no
     verb on it. Profile is a destination now that it is not a row in the list,
     and nothing else on screen said so. */
  accountHint: { color: 'rgba(255,255,255,0.42)', fontSize: 10.5, fontWeight: '500' },
  pressed: { opacity: 0.7 },
});
