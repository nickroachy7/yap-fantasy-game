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
 *   Yap main   (reserved, empty)  bot mark + YAP FANTASY       coins · gear
 *   League     back chevron       league logo + league name    (configurable) · gear
 *
 * — plus a fourth, empty slot mirroring the leading gutter on the far right,
 * so the row is symmetric in BOTH products rather than only in a league. See
 * `TRAIL`, which is the note on why an invisible gutter still shows.
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
 * A league can switch its coins off, so the right side has two possible
 * widths. Something has to hold the right edge or the cluster slides about
 * between leagues; the gear is always present, so it is that thing. It is also
 * why the gear is worth having up here at all beyond the obvious — settings had
 * a home already, as a tab inside Profile.
 *
 * ---------------------------------------------------------------------------
 * ONE PILL AND ONE BARE MARK, WHICH IS NOT THE SAME AS TWO PILLS
 * ---------------------------------------------------------------------------
 *
 * These were bare figures on the page, then briefly one divided capsule, and
 * then a pill each. The capsule was arguing that hearts and coins are one fact
 * — a wallet — and the configuration is what killed that: a league can run
 * coins without hearts, so the capsule had to grow rules about when its divider
 * exists and which corners round, and a container whose shape depends on config
 * is a container the eye cannot learn.
 *
 * A pill each has no such state, and that is where this has landed: two
 * matching pills, coins over hearts.
 *
 * IT SPENT A WHILE UN-PILLED, and the argument is worth keeping because it is
 * a real one and it was overruled on looks rather than refuted. It ran: a coin
 * is spent and earned back — two-way, a balance — while a heart is staked and
 * lost and never earned, one-way, a life total. Two matched shapes claim they
 * are facts of the same KIND, and the trap is concrete: the coin figure drops
 * when you spend, the heart figure does not drop when you stake, so
 * same-shaped neighbours behave oppositely. A pill reads as a container of
 * something countable; a bare mark and figure reads as a state.
 *
 * That is still true. What it was weighed against is that an un-pilled figure
 * beside a pilled one reads as unfinished — one balance in a container and one
 * loose next to it, on a masthead where they are the only two objects. Nick
 * called it, twice, looking at the real thing on a phone.
 *
 * WHAT ACTUALLY CARRIES THE DISTINCTION NOW is the mark, not the box: a coin
 * and a heart are not confusable glyphs, and the heart's own three states
 * (`Hearts`) say more about one-wayness than a missing fill ever did. If the
 * pairing does turn out to mislead, the lever is the FIGURE — a heart that
 * showed held-of-rack rather than a bare count would state its own direction —
 * rather than taking the box away again.
 *
 * THEY ARE STACKED, AND COINS SIT ON TOP.
 *
 * Side by side, the order was hearts then coins — the rail's rule, order by
 * stake, the risk stated before the balance. That rule was about READING
 * ORDER in a row, and a column does not have one to spend: both balances are
 * inside a glance of each other, so nothing is "stated first" in the way a row
 * states it. What a column has instead is a top line, which is the one the eye
 * lands on when it is not looking for either.
 *
 * That is the coin. Not because money outranks a life — it does not — but
 * because of how often each changes. The balance moves on every pack, sale,
 * entry and payout; the heart figure moves once a week at settlement, if at
 * all. The top of the stack is where a changing number belongs, and parking
 * the static one there would put the quiet figure in the loud position.
 *
 * The stack is right-aligned rather than centred, and the shapes stay
 * different, for the reason the whole note above exists: stacking is exactly
 * where a reader starts to expect a matched pair, so the asymmetry has to keep
 * working harder, not less.
 *
 * ---------------------------------------------------------------------------
 * THE HEART UP HERE IS ALWAYS WHOLE
 * ---------------------------------------------------------------------------
 *
 * It never wears the blade and it never breaks, whatever the run is doing. Two
 * near-misses are worth recording, because both are the obvious thing to reach
 * for and both are wrong.
 *
 * COUNTING DOWN FREE-TO-STAKE, so the figure falls when you enter. That is the
 * wrong number three times over:
 *
 *   IT REPORTS A HEART YOU OWN AS GONE, which is precisely the bug `Hearts` was
 *   rewritten to fix — three held with two staked reading as "I have one left
 *   and I have lost two".
 *
 *   IT RE-TEACHES A LESSON THAT WAS DELETED. Free falls on entry and returns on
 *   a win, so the chrome would say winning gives a heart back — the exact claim
 *   `hearts_on_win` was zeroed to stop making (20260902030000). A price is not
 *   refunded for good play.
 *
 *   IT MAKES DEATH SILENT. Held 3, enter, free 2; lose, held 2 and free stays
 *   2. The figure would not move at the one moment the run actually descends,
 *   which is the whole tension of a run.
 *
 * PUTTING THE BLADE ON THE MARK when something is riding, which fixes all
 * three — the count holds still and the state is what changes. It was built,
 * and it is still the wrong object HERE.
 *
 * A heart is RISKED, not submitted. You have not handed anything over by
 * entering; you have agreed that something could happen to it, and until the
 * week settles it is as whole as it ever was. So the figure at the top of every
 * screen is what you HOLD, drawn whole, because that is what it is.
 *
 * The blade is not deleted, it is LOCATED. It belongs on the rack, where there
 * is one pip per contest and a blade names WHICH heart is on the line and what
 * it is riding on. Up here it could only say "something, somewhere", which is
 * an alarm without an address — and it would put a knife through the app's
 * chrome on every screen for the whole of a normal week.
 *
 * WHAT FOLLOWS, STATED SO IT IS A CHOICE AND NOT A GAP: this figure does not
 * move when you enter a contest. Nothing in the masthead does. Entering is
 * shown where entering happens — the contest sheet draws the full rack beside
 * the stake, and the rail draws it under the card — and the chrome is left
 * saying the one thing it can say from every screen at once.
 *
 * ---------------------------------------------------------------------------
 * THE HEART COUNT CAME BACK UP, AND WHAT CAME WITH IT DID NOT
 * ---------------------------------------------------------------------------
 *
 * This figure has now lived here, moved down to `RunRail`, and come back. The
 * argument that sent it down was that a heart is risked by exactly one object
 * and that object is on the compete board, so up here it sat on Collection and
 * Players — screens where a heart cannot move — with nothing linking it to the
 * contest risking one.
 *
 * That premise has weakened. `/contest/[code]` is a sheet presented OVER any
 * page, and friendly contests mean an invitation can reach a player standing
 * anywhere; a heart is now stakeable from on top of the collection. A count
 * that only exists on one board is a count you have to go and look up.
 *
 * WHAT STAYED DOWN IS THE PART THAT COULD NOT COME. The rail draws a RACK —
 * one pip per card on the board, each carrying free, wagered or killed, and
 * each a link to the contest it rides on. None of that survives at 12pt in a
 * masthead, and it should not try: a rack of five up here beside a coin
 * balance is a page indicator wearing hearts.
 *
 * So the split is by KIND, not by place. The masthead answers "how many do I
 * hold" from everywhere, in one glyph and one figure. The rail answers "which
 * of them are riding, and on what" where the answer can be acted on. Neither
 * says the other, which is the same division the two had when they were one
 * glance apart — only now the first half travels.
 *
 * THE COIN STAYS for the reason it always did: it is spent everywhere. Packs,
 * entries and sells all move it, from wherever you happen to be standing.
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
import { Link } from "expo-router";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { YapMark } from "@/components/brand/YapLogo";
import { BackChevron, Gear } from "@/components/icons/Chrome";
import { Heart } from "@/components/runs/Hearts";
import { Icon } from "@/components/icons/Icon";
import { coin as coinGlyph } from "@/components/icons/glyphs";
import { Colors, Spacing, TierColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

/** Tabular figures stop the balance jittering as it changes. */
const NUMERIC = { fontVariant: ["tabular-nums" as const] };

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

/**
 * The counterweight, and it holds nothing — ever.
 *
 * The leading gutter is invisible on Yap main, so the row read as INDENTED
 * there: the mark started 44pt in while the gear finished 16 from the other
 * edge, and a masthead with a 28pt limp is what you notice instead of the
 * wordmark. Leagues never had the problem, because a chevron fills the slot.
 *
 * Mirroring it costs 20pt of row width and makes both products symmetric —
 * identity in at 36, gear out at 36 — rather than only one of them. The 8pt
 * that used to sit between the gutter and the identity paid for most of it:
 * the chevron's band is narrow inside its 20pt slot, so the two never touch
 * even with the gap gone.
 *
 * If a second trailing action is ever added, this is where it goes, and the
 * symmetry survives.
 */
const TRAIL = 20;

/** What a league name may be. The create form imports this; do not fork it. */
export const LEAGUE_NAME_MAX = 24;

/** 12pt floor over the 15pt set size — the shrink budget, as RN wants it. */
const NAME_MIN_SCALE = 0.8;

/**
 * The wordmark's floor — 0.8 of 14, so about 11pt.
 *
 * A FLOOR, NOT A TARGET, and the distinction is what set the number. iOS picks
 * whatever scale actually fits and stops there; the floor only bites when even
 * that is not enough, and then it truncates instead. So a lower floor costs
 * nothing at any width where the type already fits, and buys the row a margin.
 *
 * Measured after the trailing mirror landed: a 375pt phone leaves the wordmark
 * 104.8pt for something needing 118.3, which is a scale of 0.886 — it renders
 * around 12.4pt there and 14 everywhere from 393 up. At the 0.86 this started
 * at, that was three percent of headroom, and the next thing added to the row
 * would have turned a quiet shrink into "YAP FANT…" with nothing to warn you.
 */
const WORDMARK_MIN_SCALE = 0.8;

/**
 * THE WEB STAND-IN FOR THE SHRINK, because RN Web does not implement
 * `adjustsFontSizeToFit` — it drops the prop and truncates instead.
 *
 * That is fine on a desktop browser, where the wordmark has room to spare, and
 * not fine on a phone browser: the deployed site showed "YAP FANT…" at 375
 * the moment the trailing mirror took its 12pt. iOS was already handling the
 * same width by quietly rendering at ~12.4.
 *
 * So on web, and only on web, the wordmark is SET at that size below the width
 * where it stops fitting rather than scaled down to it. Same outcome, reached
 * the only way this platform can reach it.
 *
 * 393 is the first width where 14 fits outright — the iPhone 14/15/16 and up.
 * Below it every handset is 375 or 390.
 *
 * IT WENT TO 11.5 FOR A DAY, while the heart was a pill BESIDE the coin.
 * Measured in the browser at 375 with both pills up and a five-figure balance,
 * the wordmark rendered at 104.0 into 104.0 of box — fitting exactly, with
 * nothing left, so the next coin digit would have truncated the brand to "YAP
 * FANTAS…" with no warning and on the narrow phones only.
 *
 * THAT ARGUMENT DIED WITH THE STACK, and the heart being a pill again does not
 * revive it. Un-pilling handed back 11 points at the time, but only because the
 * two balances sat side by side and their widths added. Stacked, the column is
 * as wide as the WIDER of them — which is the coin, by a country mile, since it
 * carries four or five figures against the heart's one. So the heart's box now
 * costs the wordmark nothing at all, and the brand stays at 12.5.
 *
 * The wall is unchanged and is still the coin's alone: it moves only when the
 * balance gains a digit.
 *
 * THE WALL IS STILL THERE, further out: seven figures of coin exhausts it, on
 * web by truncating and on native by hitting `WORDMARK_MIN_SCALE`. The fix
 * then is not another half point off the brand — it is a compact balance
 * (`12.4k`), which is a product decision about how a balance reads rather than
 * a layout one.
 */
const WORDMARK_WEB_TIGHT = { below: 393, size: 12.5 } as const;

/**
 * First letter of each of the first two word-ish parts. Splitting on separators
 * matters: "a_very_long_name" was rendering as "A_", which looks broken.
 *
 * Used by the sidebar, the profile page, the contest card — and now by the
 * league plate below, which is the same problem with a different subject.
 */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Coin({ size = 11, color }: { size?: number; color: string }) {
  /* THE DRAWN GLYPH, not two nested Views.
     It was a filled circle with a ring punched in it, hand-built here because
     there was no icon set when the masthead first needed a coin. There is one
     now, `coin` was drawn for exactly this, and nothing was rendering it — the
     app was carrying two coins and showing the improvised one.
     `focused` because a coin is always solid: it is a token, not a state, and
     an outline version would read as a coin you do not have. */
  return <Icon glyph={coinGlyph} size={size} color={color} focused />;
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

/**
 * Which currencies this league runs in its header. Both, unless a league says
 * otherwise.
 *
 * HEARTS ARE A COUNT HERE AND A RACK ON THE BOARD, and switching them off up
 * here does not switch off the rail — a league that hides the masthead figure
 * still draws its pips where a heart can actually move. See the header on why
 * the two halves split by kind rather than by place.
 */
export type HeaderCurrencies = { coins?: boolean; hearts?: boolean };

/** One balance: a mark, a figure, and nothing else. See the header on pills. */
function Pill({
  mark,
  value,
  color,
  surface,
  label,
}: {
  mark: ReactNode;
  value: string;
  color: string;
  surface: string;
  /**
   * What a screen reader says instead of the figure alone.
   *
   * The mark is an SVG with no text in it, so without this a reader hears "3"
   * and has no way to learn it is hearts. The coin pill can go without — its
   * figure is announced inside a header that has already said "coins" nowhere
   * either, which is its own gap, but the heart's is the one that reads as a
   * bare number next to nothing.
   */
  label?: string;
}) {
  return (
    <View
      style={[styles.pill, { backgroundColor: surface }]}
      {...(label ? { accessible: true, accessibilityRole: 'text' as const, accessibilityLabel: label } : null)}
    >
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
  /** Per-league switches. See `HeaderCurrencies`. */
  currencies,
  /** Where the gear goes. Defaults to this account's own settings. */
  settingsHref = "/profile?tab=settings",
}: {
  attached?: boolean;
  identity?: HeaderIdentity;
  back?: { href: string; label?: string };
  currencies?: HeaderCurrencies;
  settingsHref?: string;
} = {}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;
  const top = useSafeAreaInsets().top;
  const { width } = useWindowDimensions();
  const { coins, run, loading } = usePlayer();

  /* See `WORDMARK_WEB_TIGHT`. Native leaves this at the set size and lets
     `adjustsFontSizeToFit` do the work. */
  const wordmarkSize =
    Platform.OS === "web" && width < WORDMARK_WEB_TIGHT.below
      ? WORDMARK_WEB_TIGHT.size
      : undefined;

  const showCoins = currencies?.coins !== false;
  const showHearts = currencies?.hearts !== false;

  /* Hearts HELD — not the rack, and not what is riding. `run` is null only
     before the first `my_run()` lands, which is the same window `loading`
     covers for coins, so both report the same dash rather than one flashing a
     zero the player does not have. */
  const held = Math.max(0, run?.hearts ?? 0);

  return (
    <View
      style={[styles.base, { paddingTop: top, backgroundColor: c.background }]}
    >
      <View style={[styles.row, attached && styles.rowAttached]}>
        {/* LEADING — reserved whether or not it draws anything. */}
        <View style={styles.lead}>
          {back ? (
            <Link href={back.href as never} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={back.label ?? "Back"}
                hitSlop={10}
              >
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
                ]}
              >
                <Text
                  style={[
                    styles.plateText,
                    { color: identity.onTint ?? c.text },
                  ]}
                >
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
              style={[styles.leagueName, { color: c.text }]}
            >
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

                Both this and the league name floor at 0.8 of their set size,
                for the same reason, which is the point of a template.

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
              style={[
                styles.wordmark,
                { color: c.text },
                !!wordmarkSize && { fontSize: wordmarkSize },
              ]}
            >
              YAP FANTASY
            </Text>
          </View>
        )}

        {/* TRAILING — variable width, right edge held by the gear. */}
        <View style={styles.right}>
          {/* THE RUN'S SIZE, NOT ITS SHAPE. One glyph and one figure — see the
              header on why the rack stayed on the rail. The heart is drawn in
              its `free` state at every count because this is what you HOLD;
              a staked heart is still yours, and which of them are staked is a
              question the rail answers. */}
          {/* STACKED, NOT SIDE BY SIDE. The two balances sit one above the
              other and share a right edge against the gear. What that buys is
              horizontal: laid out in a row they cost the masthead the heart,
              a 7pt joint and the coin — and the note on `row` is a record of
              how little there was to spend. Stacked, they cost the width of
              the WIDER one, which hands the wordmark back roughly the whole
              heart. The row's own tightness is unchanged; there is simply less
              in it.

              THE SHAPES CONVERGE NOW, and the header's own note records what
              that gave up — a bare mark used to say "state" where a pill says
              "container of something countable". Overruled on looks: one
              balance in a box beside one loose figure read as unfinished.

              Right-aligned rather than centred, which matters MORE now than it
              did: with two identical shapes a shared centre line would make
              them a single stacked object, while a shared right edge is the
              masthead's own edge and reads as two things ending at it. */}
          <View style={styles.balances}>
            {showCoins ? (
              <Pill
                mark={<Coin size={12} color={accent} />}
                value={loading ? "—" : coins.toLocaleString()}
                color={c.text}
                surface={c.surface}
              />
            ) : null}
            {showHearts ? (
              <Pill
                mark={<Heart size={12} state="free" />}
                value={loading || !run ? "—" : String(held)}
                color={c.text}
                surface={c.surface}
                label={
                  loading || !run
                    ? "Hearts"
                    : held === 1
                      ? "1 heart"
                      : `${held} hearts`
                }
              />
            ) : null}
          </View>
          <Link href={settingsHref as never} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={10}
            >
              <Gear size={19} color={c.textSecondary} />
            </Pressable>
          </Link>
        </View>

        {/* The counterweight for the leading gutter. Empty by design — see
            `TRAIL`. `pointerEvents` off so it cannot eat a tap meant for the
            gear beside it. */}
        <View style={styles.trail} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: "100%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
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

       NO `gap` HERE, deliberately. A gap on the row applies to every joint
       equally, and the two joints are not equal: the one between the gutter
       and the identity must be ZERO for the mirror to balance, while the one
       between the identity and the balances is the only real breathing space
       in the row. `brand` carries the second as a margin instead.
       --------------------------------------------------------------------- */
  },
  /* Not zero: the two rows should read as stacked, not as one squashed block,
     and 4 is enough to keep the wordmark off the labels below while letting the
     row underneath set the actual gap. */
  rowAttached: { paddingBottom: 4 },
  /* Fixed and never shrinking — the gutter is the promise. See the header. */
  lead: {
    width: LEAD,
    flexShrink: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  /* `flex: 1` so the identity is the ONLY thing that gives up width when the
     row is tight: the chevron, the pills and the gear are all fixed, so a long
     league name shrinks its own type rather than squeezing the numbers.
     `minWidth: 0` is what actually lets it — without it a flex child refuses to
     go below its content width and pushes the pills off the edge instead. */
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 0,
    /* The row's only real joint — see the row's note on why there is no
       shared `gap`. Everything left of the identity is structural. */
    marginRight: 8,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.8,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: "inherit" }, default: {} }),
  },
  /* Sentence case, tighter, and a size up from the wordmark to compensate for
     the caps it is not wearing. See the header. */
  leagueName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.1,
    flexShrink: 1,
    ...Platform.select({ web: { fontFamily: "inherit" }, default: {} }),
  },
  /* Square with a soft corner, sized to the wordmark's cap height so the two
     identities weigh the same. Not a circle: a circle is an avatar, and a
     league is not a person. */
  plate: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  plateText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  /* `flexShrink: 0` so a long name truncates rather than squeezing the
     balances — the figures are the reason the right side exists. */
  right: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 },
  /**
   * THE RUN'S SIZE — a bare mark and a figure, with NO PILL under it.
   *
   * ---------------------------------------------------------------------------
   * WHY IT IS NOT THE COIN'S SHAPE
   * ---------------------------------------------------------------------------
   *
   * It was a matching pill for a day, and matching was the bug. A coin and a
   * heart are different grammar: coins are spent and earned back, two-way, a
   * BALANCE. Hearts are staked and lost and never earned — one-way, a LIFE
   * TOTAL. `settle_run_week` is the only writer of `runs.hearts` and its only
   * non-zero delta is negative (20260902030000).
   *
   * Two identical pills side by side assert those are the same kind of thing,
   * which is the argument the divided capsule was killed for, quietly re-made
   * in a softer form. And it sets a concrete trap: the coin figure drops when
   * you spend, the heart figure does NOT drop when you stake. Same shape,
   * adjacent, opposite behaviour, is the one pairing a reader cannot learn.
   *
   * So the fill goes. A pill reads as a container of something countable; a
   * bare mark reads as a state. The figure keeps the pill's type — it is still
   * a number in the chrome and should weigh the same — but nothing boxes it.
   *
   * THE MARGIN IS THE OTHER HALF. `right` spaces its children at 7, which is
   * the coin-to-gear joint; this takes 5 more against the coin so the two do
   * not read as a set. Small, and it is the difference between two objects and
   * a pair.
   */
  /* The stack. Right-aligned so both balances share the edge the gear sits
     against; see the note at the call site for why they are not centred and
     why the two keep different shapes. `paddingRight` replaces the 5pt `life`
     used to carry, holding the whole stack off the gear rather than one of
     its rows. */
  balances: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    paddingRight: 5,
    flexShrink: 0,
  },
  /* Mirrors `lead` exactly, and must keep doing so. See `TRAIL`. */
  trail: { width: TRAIL, flexShrink: 0 },
  /* No border. Two bordered pills side by side on a black page is four
     hairlines to read past for two numbers; the fill separates on its own. */
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  figure: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
});
