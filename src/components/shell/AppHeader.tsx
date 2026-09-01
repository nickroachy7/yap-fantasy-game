/**
 * The app header — and it is a TEMPLATE now, not a masthead.
 *
 * ---------------------------------------------------------------------------
 * THREE SLOTS, FILLED DIFFERENTLY BY TWO PRODUCTS
 * ---------------------------------------------------------------------------
 *
 * Yap Fantasy is one global board every user shares. Private leagues are the
 * same game, configured by whoever made the league, and the header is MOSTLY
 * uniform between them — which is the whole reason this file stopped being a
 * layout and became a set of slots:
 *
 *              LEADING            IDENTITY                    TRAILING
 *   Yap main   (reserved, empty)  bot mark + YAP FANTASY       hearts · coins · gear
 *   League     back chevron       league logo + league name    (configurable) · gear
 *
 * THE LEADING SLOT IS RESERVED ON YAP MAIN, and that is the least obvious line
 * in this file. Yap main has nowhere to go back TO — it is the product, not a
 * page inside something — so it draws no chevron. But if the slot only existed
 * where the chevron does, the logo would sit 32pt further left on Yap main
 * than in a league, and the two headers would not agree on the one position
 * that matters most. So the gutter is always there and sometimes empty. It
 * costs a strip of black nobody will ever notice, and it buys the promise that
 * the identity never moves between the two experiences.
 *
 * THE TRAILING SLOT IS ANCHORED BY THE GEAR, for the same class of reason.
 * A league can switch hearts and coins off independently, so the right side
 * has four possible widths. Something has to hold the right edge or the whole
 * cluster slides about between leagues; the gear is always present, so it is
 * that thing. It is also why the gear is worth having up here at all beyond
 * the obvious — settings had a home already, as a tab inside Profile.
 *
 * ---------------------------------------------------------------------------
 * TWO PILLS, NOT ONE CAPSULE
 * ---------------------------------------------------------------------------
 *
 * These were bare figures on the page, then briefly one divided capsule, and
 * are now a pill each. The capsule was arguing that hearts and coins are one
 * fact — a wallet — and the configuration is what killed that: a league can
 * run coins without hearts, so the capsule had to grow rules about when its
 * divider exists and which corners round, and a container whose shape depends
 * on config is a container the eye cannot learn.
 *
 * A pill each has no such state. Hearts off removes a pill. Both off removes
 * both, and the gear is left holding the edge, which is exactly what it is for.
 * The two currencies are also spent in different places — coins buy cards from
 * every screen, a heart is only ever risked by a contest — so drawing them as
 * one purse was overstating the relationship anyway.
 *
 * ---------------------------------------------------------------------------
 * WHY THE HEARTS CAME BACK UP HERE
 * ---------------------------------------------------------------------------
 *
 * They lived in the contest carousel's foot for a while, on the argument that
 * a heart is only ever risked by ONE object and belongs beside it. That still
 * holds for the RUN — what is staked, what is lost — and `RunRail` still draws
 * it there. What it could not do is answer "how many do I have" from any other
 * screen, which is a balance question, and balances belong to the chrome.
 *
 * ONE GLYPH AND A NUMBER, exactly as the coin is. Not a rack: five pips in a
 * masthead would out-weigh the wordmark beside them.
 *
 * ---------------------------------------------------------------------------
 * THE LEAGUE NAME IS THE PART THAT WILL BREAK
 * ---------------------------------------------------------------------------
 *
 * "YAP FANTASY" is eleven characters we chose. A league name is whatever
 * somebody typed, and the identity box is ~186pt on a 393pt phone — around
 * 22 characters at 15pt.
 *
 * Three things keep that from clipping, in the order they fire:
 *
 *  1. A 24-character cap at league creation (see `LEAGUE_NAME_MAX`, which the
 *     create form imports so the two cannot drift). The person naming the
 *     league solves it in the one moment they are thinking about the name.
 *  2. `adjustsFontSizeToFit` down to a 12pt floor — `NAME_MIN_SCALE` is that
 *     floor expressed as the ratio RN wants. A long name at 24 characters on a
 *     320pt SE gets quieter type rather than an ellipsis, and the header's
 *     height never moves.
 *  3. Truncation, which after the first two should effectively never be seen.
 *
 * SENTENCE CASE FOR THEIRS, LETTERSPACED CAPS FOR OURS. Caps are the Yap
 * wordmark's voice and run about a third wider per character, which spends the
 * budget on styling a name we did not choose. Two settings in one slot still
 * reads as one template, and it quietly says whose house you are in.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS STILL DELIBERATELY ABSENT
 * ---------------------------------------------------------------------------
 *
 * NO BAND. It used to paint itself `#0E0F12` — a shade off the page, plus a
 * gold bloom in the corner. Against a black page a near-black band is not
 * branded chrome, it is a rectangle of very slightly different black with a
 * visible seam under it, and the seam was the only thing it communicated.
 *
 * NO ACCOUNT BUTTON. Profile is a bottom tab, so an avatar here was a second
 * door to a room that already has one.
 *
 * NO PAGE TITLE. It used to carry a `context` line under the wordmark, which
 * made a fixed one-line masthead into a two-line block of varying height. The
 * tab bar names the screen; `Screen` still renders `context` on WIDE, under
 * the page heading, where there is a heading for it to qualify.
 *
 * ---------------------------------------------------------------------------
 * `attached` IS ABOUT THE GAP BELOW. It says another row of chrome sits
 * directly under this one, so the masthead gives up most of its bottom
 * padding. Without it the header's 14 and the row's own top padding both claim
 * the same joint and you get 27pt of nothing between a wordmark and a tab
 * label — measured, on the Fantasy tab, which is where it was found.
 *
 * ---------------------------------------------------------------------------
 * THE COIN. Drawn from two Views rather than an icon font or an SVG, which is
 * the rule `Icon.tsx` sets out: that set is faceted and earns `react-native-svg`,
 * while a circle does not. A disc and a concentric rim are a circle twice.
 *
 * IT IS DRAWN FOR 8pt, NOT FOR 12. The header shows it at 12, the set
 * checklist and the collection summary at 8, and a mark that only survives at
 * its largest use is the wrong mark. So the rim is struck at a fixed FRACTION
 * of the size rather than a fixed width: it thins with the coin instead of
 * swallowing it, and at 8pt it lands on a hairline and reads as one disc.
 *
 * The rim is a translucent black, so it reads on the gold the balance uses and
 * on the grey a spent milestone uses, and disappears into the near-black coin
 * the claim chips put on a gold plate — which is the correct failure. It goes
 * quiet; it never goes wrong.
 *
 * It is exported: the shop, the collection summary and the card profile all
 * price things in coins and must use this exact mark.
 */
import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { YapMark } from '@/components/brand/YapLogo';
import { BackChevron, Gear } from '@/components/icons/Chrome';
import { Heart } from '@/components/runs/Hearts';
import { Colors, Spacing, TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Tabular figures stop the balance jittering as it changes. */
const NUMERIC = { fontVariant: ['tabular-nums' as const] };

/**
 * The reserved leading gutter, in points — see the header. Identical whether a
 * chevron is drawn in it or not.
 *
 * IT IS THE MARK'S WIDTH, NOT THE TOUCH TARGET'S. 20 is exactly the chevron;
 * the tappable area comes from `hitSlop`, which spills outside the layout and
 * costs the row nothing. Reserving 44 here for a finger would have taken the
 * space out of the wordmark instead, and at 375pt there is none to take —
 * see the note on the trailing metal below.
 */
const LEAD = 20;

/** What a league name may be. The create form imports this; do not fork it. */
export const LEAGUE_NAME_MAX = 24;

/** 12pt floor over the 15pt set size — the shrink budget, as RN wants it. */
const NAME_MIN_SCALE = 0.8;

/** The same 12pt floor, over the wordmark's 14. See the wordmark below. */
const WORDMARK_MIN_SCALE = 0.86;

/**
 * First letter of each of the first two word-ish parts. Splitting on separators
 * matters: "a_very_long_name" was rendering as "A_", which looks broken.
 *
 * Used by the sidebar, the profile page, the contest card — and now by the
 * league plate below, which is the same problem with a different subject.
 */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Coin({ size = 11, color }: { size?: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: size * 0.26,
          borderWidth: Math.max(StyleSheet.hairlineWidth, size * 0.07),
          borderColor: 'rgba(0, 0, 0, 0.32)',
        }}
      />
    </View>
  );
}

/**
 * WHO THIS HEADER BELONGS TO. Omitted means Yap Fantasy itself; supplying one
 * puts a private league in the identity slot without moving anything else.
 */
export type HeaderIdentity = {
  /** As typed by whoever made the league. Capped at `LEAGUE_NAME_MAX`. */
  name: string;
  /** The plate's fill and the initials over it. Falls back to the page ramp. */
  tint?: string;
  onTint?: string;
  /** An uploaded crest, once leagues can have one. Replaces the initials. */
  logo?: ReactNode;
};

/** Which currencies this league runs. Both, unless a league says otherwise. */
export type HeaderCurrencies = { hearts?: boolean; coins?: boolean };

/** One balance: a mark, a figure, and nothing else. See the header on pills. */
function Pill({
  mark,
  value,
  color,
  surface,
}: {
  mark: ReactNode;
  value: string;
  color: string;
  surface: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: surface }]}>
      {mark}
      <Text style={[styles.figure, NUMERIC, { color }]}>{value}</Text>
    </View>
  );
}

export function AppHeader({
  /** Another row of chrome follows immediately. See the header. */
  attached = false,
  /** A private league. Omitted draws the Yap lockup. */
  identity,
  /**
   * Where back goes. Omitted keeps the gutter reserved and empty, which is
   * what Yap main wants — see the header.
   */
  back,
  /** Per-league switches. Hearts additionally require a run to exist. */
  currencies,
  /** Where the gear goes. Defaults to this account's own settings. */
  settingsHref = '/profile?tab=settings',
}: {
  attached?: boolean;
  identity?: HeaderIdentity;
  back?: { href: string; label?: string };
  currencies?: HeaderCurrencies;
  settingsHref?: string;
} = {}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;
  const top = useSafeAreaInsets().top;
  const { coins, run, loading } = usePlayer();

  const showHearts = currencies?.hearts !== false && !!run;
  const showCoins = currencies?.coins !== false;

  return (
    <View style={[styles.base, { paddingTop: top, backgroundColor: c.background }]}>
      <View style={[styles.row, attached && styles.rowAttached]}>
        {/* LEADING — reserved whether or not it draws anything. */}
        <View style={styles.lead}>
          {back ? (
            <Link href={back.href as never} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={back.label ?? 'Back'}
                hitSlop={10}>
                <BackChevron size={20} color={c.text} />
              </Pressable>
            </Link>
          ) : null}
        </View>

        {/* IDENTITY — the one thing that must not move between products. */}
        {identity ? (
          <View style={styles.brand}>
            {identity.logo ?? (
              <View
                style={[
                  styles.plate,
                  { backgroundColor: identity.tint ?? c.backgroundElement },
                ]}>
                <Text style={[styles.plateText, { color: identity.onTint ?? c.text }]}>
                  {initialsOf(identity.name)}
                </Text>
              </View>
            )}
            {/* Sentence case, and allowed to shrink before it clips. See the
                header — this is somebody else's name, not our wordmark. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={NAME_MIN_SCALE}
              style={[styles.leagueName, { color: c.text }]}>
              {identity.name}
            </Text>
          </View>
        ) : (
          /* Mark plus wordmark, not the stacked lockup. The lockup is two lines
             tall and this masthead is one line by design — dropping it in would
             have doubled the height of the chrome on every screen to say the
             same word. `ink` is the page, because that is what the bot's face
             slots are showing through to. */
          <View style={styles.brand}>
            <YapMark height={19} ink={c.background} />
            {/* `numberOfLines` is load-bearing now that the identity slot is
                the flex child that gives — without it the wordmark answers a
                tight row by WRAPPING to "YAP / FANTASY" and silently doubles
                the height of the chrome on every screen. Found at 375pt.

                AND THE WORDMARK SHRINKS TOO, which took some arguing.

                Measured, in the iOS system face at 14/800/1.8: "YAP FANTASY"
                needs 118.3pt. After the metal was tightened as far as it goes
                (see the row's note) a 375pt phone leaves it 114.1 — four short.
                375 is the SE 2/3 and the 13 mini, not an edge case.

                The alternative was cutting letterspacing to 1.3 for everyone,
                which pays for two narrow handsets by making the wordmark
                slightly wrong on every wide one. This way 393 and up render it
                exactly as drawn and the small phones step down a point or so,
                invisible unless you hold two devices side by side.

                The floor is 12pt — the same floor the league name gets, for
                the same reason, which is the point of a template.

                RN Web ignores `adjustsFontSizeToFit` and will truncate instead.
                That is survivable and not the interesting bug on that surface:
                the wordmark resolves to TIMES there, because `fontFamily:
                'inherit'` finds nothing to inherit from and lands on the UA
                default rather than on `--font-display`. Worth fixing, but as
                its own change — it is a brand bug, not a layout one. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={WORDMARK_MIN_SCALE}
              style={[styles.wordmark, { color: c.text }]}>
              YAP FANTASY
            </Text>
          </View>
        )}

        {/* TRAILING — variable width, right edge held by the gear. */}
        <View style={styles.right}>
          {showHearts ? (
            <Pill
              mark={<Heart size={12} state="free" />}
              value={loading ? '—' : String(run!.hearts)}
              color={c.text}
              surface={c.surface}
            />
          ) : null}
          {showCoins ? (
            <Pill
              mark={<Coin size={12} color={accent} />}
              value={loading ? '—' : coins.toLocaleString()}
              color={c.text}
              surface={c.surface}
            />
          ) : null}
          <Link href={settingsHref as never} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10}>
              <Gear size={19} color={c.textSecondary} />
            </Pressable>
          </Link>
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
    paddingHorizontal: Spacing.three,
    /* The masthead is one line, so this padding IS its height. The band's own
       edges used to do the separating; with nothing drawn, the space is the
       only thing telling the page where the chrome stops, and 12 left the
       wordmark reading as a caption stuck to the notch. */
    paddingVertical: 14,
    /* ---------------------------------------------------------------------
       THE METAL IS TIGHT ON PURPOSE, and this is the measurement that set it.
       The gutter and the gear together cost the row ~47pt that the old
       two-figure masthead did not spend. At 375pt — SE 2/3, 13 mini, and not
       a rare phone — that left the wordmark 102pt to say something that needs
       118 in the iOS system face, so it truncated to "YAP FANT…".
       Eighteen points came back out of the spacing rather than the type: this
       gap, `LEAD`, the pill padding and the trailing gap. Cutting the wordmark
       instead would have shrunk the brand on the narrow phones and left it
       alone on the wide ones, which is the one inconsistency a masthead cannot
       afford. If anything is ever added to this row, it is these four numbers
       that have already been spent.
       --------------------------------------------------------------------- */
    gap: 8,
  },
  /* Not zero: the two rows should read as stacked, not as one squashed block,
     and 4 is enough to keep the wordmark off the labels below while letting the
     row underneath set the actual gap. */
  rowAttached: { paddingBottom: 4 },
  /* Fixed and never shrinking — the gutter is the promise. See the header. */
  lead: { width: LEAD, flexShrink: 0, alignItems: 'flex-start', justifyContent: 'center' },
  /* `flex: 1` so the identity is the ONLY thing that gives up width when the
     row is tight: the chevron, the pills and the gear are all fixed, so a long
     league name shrinks its own type rather than squeezing the numbers.
     `minWidth: 0` is what actually lets it — without it a flex child refuses to
     go below its content width and pushes the pills off the edge instead. */
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  wordmark: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.8,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: 'inherit' }, default: {} }),
  },
  /* Sentence case, tighter, and a size up from the wordmark to compensate for
     the caps it is not wearing. See the header. */
  leagueName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: 'inherit' }, default: {} }),
  },
  /* Square with a soft corner, sized to the wordmark's cap height so the two
     identities weigh the same. Not a circle: a circle is an avatar, and a
     league is not a person. */
  plate: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  plateText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  /* `flexShrink: 0` so a long name truncates rather than squeezing the
     balances — the figures are the reason the right side exists. */
  right: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  /* No border. Two bordered pills side by side on a black page is four
     hairlines to read past for two numbers; the fill separates on its own. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  figure: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
});
