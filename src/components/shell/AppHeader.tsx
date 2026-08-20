/**
 * The app header: the wordmark, and the gem balance. That is all of it.
 *
 * NO BAND. It used to paint itself `#0E0F12` — a shade off the page, plus a
 * gold bloom in the corner — so the chrome read as a fixed branded strip
 * regardless of the device setting. That argument died when the app went
 * dark-only (see `use-color-scheme`): against a black page, a near-black band
 * is not "branded chrome", it is a rectangle of very slightly different black
 * with a visible seam under it, and the seam was the only thing it actually
 * communicated. Drawing on the page background makes the top of the screen the
 * top of the screen, and gives the wordmark and the balance back the quiet they
 * were fighting.
 *
 * NO ACCOUNT BUTTON. Profile is the fifth bottom tab now (see `NAV_SECTIONS`),
 * so the avatar up here was a second door to a room that already has one — and
 * the more expensive of the two, since it cost the header its only interactive
 * element and the reader a decision about which way in to use.
 *
 * NO PAGE TITLE EITHER. It used to carry a `context` line under the wordmark —
 * "Packs & pulls", "Deferred to Week 3 · nothing tracked" — which made the
 * chrome say something different on every tab and turned a fixed one-line
 * masthead into a two-line block of varying height. The bottom tab bar already
 * names the screen you are on, and the screens that carry live week state say
 * it themselves in a place you can act on: the lineup's score band leads with
 * PRE WK 3. `Screen` still takes `context` and still renders it on WIDE, under
 * the page heading, where there is a heading for it to qualify.
 *
 * THE BALANCE IS A NUMBER, NOT A WIDGET. The pill it used to sit in — border,
 * inset fill, a 8pt "GEMS" label above the figure — was three pieces of
 * decoration around one fact, stacked into two lines to fit. The gem glyph
 * already says what the number counts, so the label was reading it out twice.
 *
 * The gem is a rotated square rather than an icon font so it stays crisp
 * everywhere and costs no dependency. It is exported: the shop, the collection
 * summary and the card profile all price things in gems and must use this
 * exact mark.
 */
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Tabular figures stop the balance jittering as it changes. */
const NUMERIC = { fontVariant: ['tabular-nums' as const] };

/**
 * First letter of each of the first two word-ish parts. Splitting on separators
 * matters: "a_very_long_name" was rendering as "A_", which looks broken.
 *
 * Still exported, and still used — by the sidebar, the profile page and the
 * contest card. The header stopped drawing an avatar; the monogram itself is
 * not the header's idea.
 */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Gem({ size = 11, color }: { size?: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
        borderRadius: 1.5,
      }}
    />
  );
}

export function AppHeader() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;
  const top = useSafeAreaInsets().top;
  const { gems, loading } = usePlayer();

  return (
    <View style={[styles.base, { paddingTop: top, backgroundColor: c.background }]}>
      <View style={styles.row}>
        <Text style={[styles.wordmark, { color: c.text }]}>YAP FANTASY</Text>

        <View style={styles.balance}>
          <Gem size={12} color={accent} />
          <Text style={[styles.figure, NUMERIC, { color: c.text }]}>
            {loading ? '—' : gems.toLocaleString()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    /* The masthead is one line now, so this padding IS its height. The band's
       own edges used to do the separating; with nothing drawn, the space is
       the only thing telling the page where the chrome stops, and 12 left the
       wordmark reading as a caption stuck to the notch. */
    paddingVertical: 14,
    gap: Spacing.three,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.8,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: 'inherit' }, default: {} }),
  },
  /* `flexShrink: 0` so a long context line truncates rather than squeezing the
     balance — the figure is the reason the right side exists. */
  balance: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  figure: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
});
