/**
 * The app header: the wordmark, the hearts, and the gem balance.
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
 * NO ACCOUNT BUTTON. Profile is a bottom tab now (see `NAV_TABS`), so the
 * avatar up here was a second door to a room that already has one — and the
 * more expensive of the two, since it cost the header its only interactive
 * element and the reader a decision about which way in to use.
 *
 * AND STILL NO BACK ARROW. One was added for a Fantasy hub and removed with it:
 * the four boards are peers reached from the strip below, so there is no
 * "up" for an arrow to point at, and a chevron that only ever pops a stack
 * nobody built is furniture. If a screen inside this chrome ever does have a
 * parent, that is the moment to bring it back — not before.
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
 * THE HEARTS ARE GONE FROM HERE, and where they went is the argument.
 *
 * They sat next to the balance on the reasoning that both are "what you have to
 * spend", and that entering a contest costs gems and risks a heart in one
 * action. The first half held; the second is what broke it. The gems are spent
 * from every screen — packs, sets, contests — so the balance belongs to the
 * chrome. A heart is only ever risked by ONE object, the contest, and that
 * object has a card of its own on the board where the risking happens.
 *
 * So the rack now sits under that card, in the carousel's foot, where the pip a
 * particular contest is holding comes forward as you swipe to it — see `Foot`
 * in `ContestCarousel`. What it says there it could never say up here: not "you
 * have two hearts" on a screen full of cards for sale, but "THIS contest is
 * holding this one, and that is what is behind it".
 *
 * The full rack is still read outright in two places, both of which are about
 * the run rather than about a contest: the lobby's run panel, and the death
 * screen. `Hearts` itself is unchanged apart from the focus it grew for the
 * carousel.
 *
 * THE BALANCE IS A NUMBER, NOT A WIDGET. The pill it used to sit in — border,
 * inset fill, a 8pt "GEMS" label above the figure — was three pieces of
 * decoration around one fact, stacked into two lines to fit. The gem glyph
 * already says what the number counts, so the label was reading it out twice.
 *
 * ONE PROP, AND IT IS ABOUT THE GAP BELOW. `attached` says another row of
 * chrome sits directly under this one, so the masthead gives up most of its
 * bottom padding. Without it the header's 14 and the row's own top padding both
 * claim the same joint and you get 27pt of nothing between a wordmark and a tab
 * label — measured, on the Fantasy tab, which is where it was found. The row
 * below owns that space now; this one just stops adding to it.
 *
 * The gem is a rotated square rather than an icon font so it stays crisp
 * everywhere and costs no dependency. It is exported: the shop, the collection
 * summary and the card profile all price things in gems and must use this
 * exact mark.
 */
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { YapMark } from '@/components/brand/YapLogo';
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

export function AppHeader({
  /** Another row of chrome follows immediately. See the header. */
  attached = false,
}: { attached?: boolean } = {}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;
  const top = useSafeAreaInsets().top;
  const { gems, loading } = usePlayer();

  return (
    <View style={[styles.base, { paddingTop: top, backgroundColor: c.background }]}>
      <View style={[styles.row, attached && styles.rowAttached]}>
        {/* Mark plus wordmark, not the stacked lockup. The lockup is two lines
            tall and this masthead is one line by design (see the header) —
            dropping it in would have doubled the height of the chrome on every
            screen to say the same word. `ink` is the page, because that is what
            the bot's face slots are showing through to. */}
        <View style={styles.brand}>
          <YapMark height={19} ink={c.background} />
          <Text style={[styles.wordmark, { color: c.text }]}>YAP FANTASY</Text>
        </View>

        <View style={styles.right}>
          <View style={styles.balance}>
            <Gem size={12} color={accent} />
            <Text style={[styles.figure, NUMERIC, { color: c.text }]}>
              {loading ? '—' : gems.toLocaleString()}
            </Text>
          </View>
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
  /* Not zero: the two rows should read as stacked, not as one squashed block,
     and 4 is enough to keep the wordmark off the labels below while letting the
     row underneath set the actual gap. */
  rowAttached: { paddingBottom: 4 },
  /* `flexShrink: 1` lives on the wordmark, not here, so the text truncates
     before the mark does — a clipped logo looks broken, clipped type does not. */
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  wordmark: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.8,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: 'inherit' }, default: {} }),
  },
  /* `flexShrink: 0` so a long wordmark truncates rather than squeezing the
     balance — the figure is the reason the right side exists. One child now
     that the rack has moved to the contest card; the row stays because the
     right side is a place, and the next thing that earns a spot beside the
     balance should land in it rather than inventing its own. */
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexShrink: 0 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  figure: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
});
