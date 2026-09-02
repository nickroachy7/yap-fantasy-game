/**
 * The four boards of the card game, as a strip under the masthead.
 *
 * These were the bottom tab bar until the bar was given to the whole app. What
 * replaced them there is Yap / Leagues / Scores / Profile, so this row is what
 * you see the moment you open Yap — the same relationship a league app draws
 * between "which league am I in" and "draft / team / players / league".
 *
 * FOUR AGAIN, AND IT WAS THREE. Players came back from being a bottom tab on
 * 2026-08-24 when the bar became a list of products; the strip was built for
 * four and had been carrying three since.
 *
 * THE WORDS ARE BACK TO THE WIDTH THE LAYOUT WAS MEASURED ON. COMPETE /
 * COLLECT / PLAYERS / LEADERS is 28 characters, the same as the LINEUP /
 * COLLECTION / PLAYERS / BOARD this was built against. It went to 30 for a day
 * when the third board was called All Cards, which closed the even gaps at
 * 320pt from ~17 to 13 and forced the touch slop down with them; renaming it
 * back to Players returns both. Re-measured rather than assumed: 320pt, gaps of
 * 16/17/16, nothing truncated. See `hitSlop` — the slop stays at six, because
 * six works at either width and a number that only just fits is a number that
 * breaks on the next rename.
 *
 * IT IS ON EVERY SCREEN OF THE TAB, with nothing in front of it. A hub page
 * listing these same four was built and cut first; see `fantasy/index.tsx`.
 *
 * TEXT ONLY, AND UNDERLINED. Deliberately not the `ActionBar` treatment the
 * sub-pages get one row below, and deliberately not the icon-over-label cells
 * the bottom bar uses.
 *
 * Two rows of navigation stacked on one screen is the thing this app has
 * already been burned by — see `SectionNav`, which exists because a segmented
 * control plus a bar of icons above every browsing page was one row too many.
 * The rows can only coexist now because they do not look alike: this one is a
 * word with a rule under it, the one below is a glyph with a word beside it.
 * If they ever converge on the same treatment, the page grows two identical
 * strips again and the reader has to work out which is which by trying them.
 *
 * It also buys the height back. Icon over label is ~46pt; this row is 35, and
 * it appears on every single Fantasy screen.
 *
 * THE ITEMS ARE SIZED TO THEIR WORDS AND SPACED EVENLY, not given an equal
 * quarter each and not pushed to the gutters. Both of those were tried and both
 * were wrong, in ways that only showed once measured:
 *
 *  - EQUAL QUARTERS stretched the rule to the CELL. Under "LINEUP" that was an
 *    89pt underline beneath a 47pt word, which reads as a highlighted region
 *    rather than as a mark on the thing it marks. And because the four words are
 *    very different lengths, centring each in its own quarter produced gaps of
 *    28, 23 and 42 — a row that is mechanically even and visually is not.
 *  - `space-between` inside the page gutter put the first label on the
 *    wordmark's left edge and the last on the balance's right edge, which is a
 *    real alignment and still not worth it: every point of slack went into the
 *    three interior gaps, so on a 393pt phone the ends sat 16 from the edge with
 *    42 between them. At 2.6 to 1 the outer two items read as pinned to the
 *    corners and the middle as adrift.
 *
 * `space-evenly` puts the same gap in all five places — before, between and
 * after — so the row has one rhythm at any width: 13pt on a 320pt viewport,
 * 28 on a 393, 38 on a 440, with the labels as they stand today. Four peers should be evenly weighted, and evenly
 * weighted is the one thing neither of the other two layouts could be.
 *
 * THE PRICE IS THE PAGE GUTTER, paid knowingly. The labels no longer start at
 * the 16 the masthead and the content below both use, and their inset now
 * varies with the width of the device. That is the cost of an even rhythm with
 * four items of unequal length, and the strip can afford it: it is chrome, it
 * is fenced off by its own hairline, and its internal spacing is its own
 * business in a way a paragraph's is not.
 *
 * SO THE MASTHEAD ABOVE IS DELIBERATELY OUT OF LINE WITH THIS ROW, and it is to
 * stay that way. "YAP FANTASY" sits at 16 and "COMPETE" at 28-41 depending on
 * the handset, which looks like a bug and is not one — it was measured, discussed
 * and chosen.
 *
 * The two alignments are mathematically incompatible. Even spacing means every
 * gap equals `(width - sum of the four labels) / 5`, a number that MOVES with
 * the viewport; the gutter is a constant. A padding on the masthead picked to
 * match this strip would agree with it at exactly one screen width and be a
 * new, different mismatch at every other one — a bug that only appears on other
 * people's phones, in place of a stagger that is at least consistent.
 *
 * Given that, the gutter keeps the masthead, because 16 is what the wordmark
 * shares with every card, row and filter on the page beneath it, and that is a
 * relationship the reader actually scans down. Do not "fix" this by nudging
 * `AppHeader`.
 *
 * The rule still hugs the word — `alignSelf: 'stretch'` on an item sized by its
 * label — which is the half of the first attempt that was right.
 *
 * WIDE WEB RENDERS NOTHING. The rail lists all four as rows already, the same
 * rule `SectionNav` follows for the same reason.
 */
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FANTASY_SECTIONS, isOverlayPath } from '@/components/shell/sections';
import { useSteadyPathname } from '@/components/shell/use-steady-pathname';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * How wide the row of four is allowed to get before it stops spreading.
 *
 * Not a `ContentMeasure`: those are about how long a line of content should be,
 * and this is about how far apart four words can sit before they stop reading
 * as one control. 440 is the width of the widest iPhone, so on every phone the
 * cap is inert and the labels sit on the page gutters; it only bites on a
 * browser window between that and the 900 where the rail takes over.
 */
const STRIP_MEASURE = 440;

export function FantasyTopNav({
  /**
   * Dev galleries only, and the twin of `Sidebar`'s. The active mark is the
   * part of this strip most likely to be wrong and it is unreachable from a
   * gallery route, because the real pathname never matches a nav href — so it
   * went unseen. Product code passes nothing and uses the real router.
   */
  pathnameOverride,
}: { pathnameOverride?: string } = {}) {
  const router = useRouter();
  const realPathname = usePathname();
  /**
   * FROZEN WHILE A SHEET IS OVER THE PAGE, or the strip goes dark behind it.
   *
   * `usePathname` reports the top of the stack for every component in the tree,
   * so opening a player from the Compete board tells this strip it is at
   * `/card/abc` — which matches none of the four sections, so nothing is
   * underlined and nothing is lit. On iOS you see it as the profile is dragged
   * back down and the board reappears underneath with its accent missing; on
   * web the sheet paints nothing at all and the strip is plainly dark the whole
   * time. `Screen` has held its heading steady like this for the same reason;
   * this strip had been left behind. See `useSteadyPathname`.
   */
  const pathname = useSteadyPathname(pathnameOverride ?? realPathname, isOverlayPath);
  const wide = useIsWide();

  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  if (wide) return null;

  return (
    <View style={[styles.bar, { borderBottomColor: c.border }]}>
      <View style={styles.inner}>
        {FANTASY_SECTIONS.map((section) => {
          // A section is active anywhere INSIDE it, not just on its own path,
          // and three of the four have sub-pages: Compete, Players and
          // Collect each hold two or three views that `SectionNav` draws one
          // row below. Without the prefix test the strip would go dark the
          // moment you moved off a board's landing view — press Leaders and
          // PLAYERS would stop being underlined.
          const active =
            pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Pressable
              key={section.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              /* The words are the targets and the space between them is dead,
                 so the touch area claims some of it. SIX a side, and the number
                 is derived rather than chosen: two neighbouring slops must stay
                 clear of each other, or a tap in the gap goes to whichever item
                 happened to render last.

                 It was 8, against gaps of ~17 at the tightest viewport this
                 strip has. Two renames on 2026-08-24 — Board to Leaders, then
                 Players to All Cards — cost four characters between them and
                 closed the gaps to 13 on a 320pt viewport, at which 8 a side
                 overlaps by 3. Six leaves a point of dead space.

                 All Cards went back to Players afterwards and the gaps returned
                 to 16/17/16, re-measured. The slop STAYS at six anyway: eight
                 would exactly touch at that width, and a number that only just
                 fits is one that breaks on the next rename.

                 SO THIS MOVES WITH THE LABELS. Any section renamed longer
                 tightens the gaps again; re-measure rather than assuming the
                 slop still fits. */
              hitSlop={{ left: 6, right: 6, top: 4, bottom: 4 }}
              /* REPLACE, not push. The four are peers you flip between, and
                 pushing would build a back stack out of every flip — press
                 Lineup, Collection, Players, then back three times to get out of
                 the tab. Replacing keeps this navigator one screen deep, which is
                 what makes the strip behave like the tab bar it is standing in
                 for rather than like a trail. */
              onPress={() => router.replace(section.href as never)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <Text
                numberOfLines={1}
                style={[styles.label, { color: active ? c.text : c.textSecondary }]}>
                {(section.tabLabel ?? section.label).toUpperCase()}
              </Text>
              {/* `alignSelf: 'stretch'` on an item sized by its label is what
                  makes the rule exactly as wide as the word. */}
              <View
                style={[styles.rule, { backgroundColor: active ? accent : 'transparent' }]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* A hairline under the whole strip, so the four rules read as marks ON a
     baseline rather than as four floating dashes. Full-bleed: the line is the
     bottom of the chrome and has to reach both edges of the screen, which is
     why the gutter lives on the row inside rather than here. */
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  inner: {
    flexDirection: 'row',
    /* No horizontal padding: `space-evenly` is already putting a margin before
       the first item and after the last, and padding on top of it would make
       those two gaps larger than the three between — the same imbalance this
       layout exists to remove, mirrored. */
    justifyContent: 'space-evenly',
    width: '100%',
    maxWidth: STRIP_MEASURE,
    alignSelf: 'flex-start',
  },
  /* 12 above the word and 8 below it, which with the 4 the masthead leaves puts
     16 between the wordmark and these labels. It was 27 while both rows padded
     the same joint. */
  item: { alignItems: 'center', paddingTop: 12, gap: 8 },
  /* 11.5, not 12: at 12 the four words plus their minimum gaps no longer fit a
     320pt viewport. Uppercase with letter-spacing is what lets it go this small
     and stay a label rather than a caption. */
  label: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.7 },
  rule: { height: 2, alignSelf: 'stretch', borderRadius: 1 },
  pressed: { opacity: 0.6 },
});
