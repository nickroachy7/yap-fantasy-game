/**
 * A contest. One card, drawn identically wherever it appears — and now at one
 * FIXED SIZE, in every state it can be in.
 *
 * ---------------------------------------------------------------------------
 * THREE BANDS. THEY NEVER CHANGE, AND NEITHER DOES THE HEIGHT.
 * ---------------------------------------------------------------------------
 *
 *     ┌──────────────────────────────────────────────┐
 *     │ Flex Three                  NEXT LOCK 7h 13m │  HEAD    51pt
 *     │ TO WIN Beat the median            12 entries │
 *     ├──────────────────────────────────────────────┤
 *     │ YOU · 3RD OF 12          COMMUNITY     +22.2 │  SCORE   57pt
 *     │ 118.4                                   96.2 │
 *     │ ▬▬▬▬▬▬▬▬▬▬▬▬▬|▬▬▬▬▬▬▬                       │
 *     ├──────────────────────────────────────────────┤
 *     │ RISK                    │ REWARD             │  TRADE   56pt
 *     │ 40 gems                 │ Share of 20 gems   │
 *     │ ♥ 1 heart               │                    │
 *     └──────────────────────────────────────────────┘
 *
 * THE THIRD BAND CHANGES TENSE WHEN THE WEEK IS OVER, and nothing else does:
 *
 *     │ STAKED                  │ EARNED             │  TRADE   56pt
 *     │ 40 gems                 │ Won 120 gems       │
 *     │ ♥ 1 heart kept          │ +1 heart           │
 *
 * Same columns, same labels' position, same reserved rows, same height. That
 * is the card's FINISHED STATE — a band that has stopped asking for a decision
 * — and it is what retired the bordered note the recap board used to carry
 * between this card and the lineup under it. See `settled` and `stakeLines`.
 *
 * ---------------------------------------------------------------------------
 * THE 2026-08-27 REWORK
 * ---------------------------------------------------------------------------
 *
 * The card before this one was a head, an OPTIONAL middle, and a trade. Three
 * things were wrong with it, and they were all the same thing: the card was
 * arranged around what it happened to know rather than around what a reader
 * asks of it.
 *
 * 1. IT SPENT ITS BEST ROW ON THE LINEUP COUNT. `1 SLOT TO FILL` / `LINEUP
 *    FILED` sat in the middle band, and `7/8` had the head's figure slot
 *    whenever the week was locked and unplayed. Directly beneath the card the
 *    board's own heading says `Starting lineup · 3/3 FILLED`, in the section
 *    those slots are actually in and next to the rows you would fix it from.
 *    The card was answering a question the next line answers better, twice.
 *    Both are gone; the card never mentions lineup fill again.
 *
 * 2. SCORING WAS CONDITIONAL, so the card had two heights and swapped between
 *    them at the exact moment a reader was trying to hold it still. It is a
 *    permanent band now, and it is a band that RANKS ITS OWN STATE rather than
 *    blanking: projected before kickoff, live during, final after, and "not
 *    entered" in the lobby. Same three rows and the same two stat columns in
 *    all four, so the passage of the week is a change of MEANING at a fixed
 *    position rather than a change of layout.
 *
 * 3. THE TRADE HAD NO HEADINGS. An arrow between the columns was doing the work
 *    of `RISK` and `REWARD`, on the argument that the direction of a trade says
 *    which side is which. It does — once you already know it is a trade. Two
 *    9pt words and a hairline say it without being decoded, and the hairline is
 *    the divider the arrow was standing in for.
 *
 * ---------------------------------------------------------------------------
 * THE HEIGHT IS A CONTRACT, AND IT IS ENFORCED IN PIXELS
 * ---------------------------------------------------------------------------
 *
 * Every band declares an explicit height (`HEAD_H`, `SCORE_H`, `TRADE_H`) and
 * every row inside it is sized from `Type`'s own line heights, which are fixed.
 * Not "tends to come out the same" — the same, always, on every card and in
 * every state.
 *
 * That is not neatness. These cards are the pages of a horizontal carousel and
 * the board underneath them is the rest of the screen: a card that is eleven
 * points taller than its neighbour makes the whole lineup jump on every swipe,
 * and a card that grows when the first score lands moves the board out from
 * under a reader mid-tap. It also means the states can be COMPARED — the eye
 * learns where the score lives once, and finds it there on all five.
 *
 * The two rules that follow from it, and they are load-bearing:
 *
 *   NOTHING WRAPS. Every text is `numberOfLines={1}`. A string that needs two
 *   lines is a string that must be shortened at the source — see the note on
 *   `rewardLines`, where "Gem pool, once entries start" became "Share of the
 *   pool" for exactly this reason.
 *
 *   ABSENCE RESERVES ITS ROW. The trade columns pad to `TRADE_LINES` with
 *   blank rows rather than collapsing; a contest that risks no hearts is a
 *   shorter LIST, not a shorter card.
 *
 * ---------------------------------------------------------------------------
 * WHAT SURVIVED FROM THE OLD CARD, BECAUSE IT WAS EARNED
 * ---------------------------------------------------------------------------
 *
 * THE MARK IS NOT ALWAYS THE MEDIAN. This card drew the median on every
 * contest and labelled it MEDIAN, including on a `top_n` contest where the
 * median decides nothing — a player in the WR Room could sit comfortably above
 * the middle of a field that pays three, read the bar as winning, and be sixth.
 * `markOf` decides it from the contest's own win condition.
 *
 * THE FIELD IS NOT A PERSON. The first version of the scoring band was a
 * head-to-head: two avatars, two scores, a margin between them. A circle and a
 * name opposite your own reads as another manager, and this game deliberately
 * has none — no pairings, no schedule, no opponent. So it is a DISTRIBUTION:
 * the bar runs from the field's worst score to its best, the line you are
 * judged against is a mark on it, and your own total is the fill.
 *
 * NO WIN PROBABILITY, AND NO INVENTED PROJECTION. `Entry.projected` is the slot
 * a real pregame number will land in when there is one to land — the provider
 * sells none today, so it is null and the band draws a dash under `PROJECTED`.
 * A dash in a labelled slot is an honest "not yet". A modelled number in it
 * would be the app's first lie, told in its largest type.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { formatFlex3, formatRoster, formatWr } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import { Heart } from '@/components/runs/Hearts';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { FieldWeek } from '@/components/lineup/field';
import { MIN_ENTRANTS } from '@/components/lineup/field';
import { countdownLabel } from '@/components/lineup/model';
import {
  fillLine,
  opponentOf,
  rewardLines,
  riskLines,
  winLine,
  type ContestTerms,
  type Duel,
  type TradeLine,
  stakeLines,
  takeLines,
  type Settlement,
} from './contest-model';

/** Dash rather than a nought: no number yet is not the same as no points. */
const DASH = '—';

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : n.toFixed(1);

/* ================================================================ metrics */

/**
 * THE THREE BAND HEIGHTS. Change one and every contest card in the app changes
 * with it — which is the point, and why they are constants rather than padding
 * that happens to add up.
 *
 * Each is its rows' line heights plus `BAND_PAD` top and bottom:
 *
 *   HEAD   20 name  + 4 + 17 objective                      = 41 + 10 = 51
 *   SCORE  12 names + 2 + 21 totals + 4 + 8 rail            = 47 + 10 = 57
 *   TRADE  12 label + 2 + 15 + 2 + 15 two reserved lines    = 46 + 10 = 56
 *
 * ---------------------------------------------------------------------------
 * IT WAS 189 AND IT IS 164, WHICH IS THE SAME CARD WITH LESS AIR IN IT
 * ---------------------------------------------------------------------------
 *
 * A lineup row underneath is 62pt. At 189 the card was three of them tall to
 * carry eleven short facts, and it read as bulky because it WAS: forty-two of
 * those points were band padding, twelve were a slot sized for a sentence it
 * did not need, and the trade set its values one step LARGER than the win
 * condition above them — a card whose least urgent band had its loudest body
 * type. Nothing was removed to get to 164. Four things were resized:
 *
 *   the padding    7 a side to 5, across all three bands. Six edges at two
 *                  points each is twelve of the twenty-five.
 *   the slot       12 back to the rail's own 8 — see `SLOT_H`.
 *   the hero       20/24 to 18/21, which is where it was before the scoreboard
 *                  needed two of them and is still one step above the lineup
 *                  rows' 15pt player total.
 *   the trade      `body` to `fine`, correcting a rank inversion as well as
 *                  saving two points: the win condition is the line on this
 *                  card that must not be skimmed, and it was set smaller than
 *                  "40 gems".
 *
 * THE HEAD'S TWO ROWS SIT ON `Spacing.one` RATHER THAN THE 2 THE OTHER BANDS
 * USE. Two points is the gap between LINES OF ONE BLOCK, which is what the
 * trade's columns and the scoring band's stat are; the name and the terms under
 * it are two blocks, and at 2 they read as a single four-line paragraph with no
 * way in. Four is the smallest gap that separates them, and it is the only
 * point of air added anywhere in this rework.
 *
 * THE HEAD LOST A ROW. It carried the fill count on a line of its own with the
 * season record squared off against it, and both were wrong in the same way:
 * the head is where you learn WHICH contest this is, and neither answers that.
 * The season went entirely — it is one contest's property, drawn on every card,
 * and nothing on this screen is about the season. The fill moved up to sit
 * under the countdown, where it joins the other fact about the contest's
 * CLOCK — how long you have, and whether enough people have turned up.
 */
const HEAD_H = 51;
const SCORE_H = 57;
const TRADE_H = 56;

/**
 * How many rows each trade column reserves, filled or not.
 *
 * Two, because two is the most either side can carry: gems and a heart on the
 * risk, a pool and a heal on the reward. A contest that uses one of them gets a
 * blank row rather than a shorter card.
 *
 * ---------------------------------------------------------------------------
 * THIS ROW IS WHY THE BAND IS 62 AND NOT 44, AND IT IS NOT NEGOTIABLE
 * ---------------------------------------------------------------------------
 *
 * The band looks half empty on the free contest — one heart against one line of
 * gems — and the obvious saving is to stop reserving the second row and let the
 * column stack what it has. It cannot: a paid contest with a heal really does
 * carry `40 gems / ♥ 1 heart` against `Up to 120 gems / ♥ +1 heart`, so the row
 * that looks wasted on one card is load-bearing on the next, and the height has
 * to be the taller of them everywhere or the carousel jumps.
 *
 * THE OTHER WAY TO GET IT BACK IS TO MERGE THE TWO ONTO ONE LINE — "40 gems ·
 * ♥ 1 heart" — which fits the risk column with room to spare and does NOT fit
 * the reward column: "Up to 120 gems · ♥ +1 heart" measures within a few points
 * of the half-width it has, and nothing here wraps. Two strings have already
 * been clipped on this card by exactly that kind of estimate (see `fillLine`),
 * and a clipped reward is the worst one to lose.
 *
 * So the band is at its floor with the labels and both rows kept. What DID come
 * out was the air: the column stacked on a 4pt gap inside a box sized for 2, so
 * it was overflowing its own padding by two points and the arithmetic above did
 * not add up. It is 2 throughout now — the same gap the scoring band puts
 * between a figure and its label, which is what a label and its list is.
 */
const TRADE_LINES = 2;

/**
 * The air inside every band, top and bottom.
 *
 * ONE CONSTANT BECAUSE IT IS ONE DECISION. It was `Spacing.two - 1` written out
 * three times, which is how a card ends up with three near-equal paddings
 * nobody chose. At 5 the bands are tight against their hairlines and the card
 * is a third shorter than a stack of lineup rows carrying the same amount of
 * text — which is the right relationship, since the card is a summary of the
 * board and not another row of it.
 */
const BAND_PAD = Spacing.one + 1;

/** The scoring band's hero. One step above the lineup rows' 15pt player total. */
const FIGURE_SIZE = 18;
const FIGURE_LINE = 21;

/**
 * The graphic under the scoreboard.
 *
 * 8pt — the rail's own height, and back down from the 12 it briefly took to
 * hold a line of type. That line said `NO SCORES YET` under a dimmed 0–0 and
 * `NOT ENTERED` on a card whose head is showing an ENTER chip, which is to say
 * it spent four points of every card restating what the two totals and the
 * head had already said. What is left in those states is an empty rail, which
 * is honest — the scale is there and nothing is on it yet — and the one case
 * that really did need words keeps them where they belong: a contest with
 * nobody else in it names its opponent `NO FIELD YET`, in the column whose job
 * is to say who you are playing.
 */
const SLOT_H = 8;

/* ================================================================== types */

/**
 * The week's deadline, as the card needs it: when, and whether it has passed.
 *
 * A SHAPE RATHER THAN THREE PROPS, because it is one fact with three parts and
 * every part is meaningless without the others. `now` travels with it so the
 * countdown ticks off the CALLER's clock — the board already owns a `now` that
 * drives the whole screen, and a second timer inside the card would drift
 * against the lineup rows it sits above.
 */
export type Lock = { at: string | null; locked: boolean; now: number };

/**
 * YOUR entry in this contest, or null where there is not one.
 *
 * DATA, NOT A NODE. The middle used to arrive as a `React.ReactNode` so that
 * the lobby and the board could not grow per-variant conditions inside the
 * card. That guard is unnecessary now and actively harmful: with the band
 * permanent and its height fixed, a caller handing in a node is a caller who
 * can hand in a two-line one and break the only invariant this card has. The
 * card owns all three bands; callers hand it facts.
 */
export type Entry = {
  /** Your total, or null before anybody in the field has played. */
  myPoints: number | null;
  /**
   * The PREGAME projection, and it is null on every contest today.
   *
   * The slot exists rather than the branch being absent, because the pregame
   * state has to draw something in the figure's position and the honest choice
   * is between a dash and a lie. When the provider (or our own model) produces
   * a real number, it arrives here and the band already knows where to put it.
   */
  projected: number | null;
  /** This contest's distribution. Null while it loads. */
  field: FieldWeek | null;
  /** The paying cut under `top_n`. Null under `median`, where the median is it. */
  cut: number | null;
  /**
   * The other manager, on a format that has one.
   *
   * NULL EVERYWHERE TODAY. No head-to-head contest exists — see `opponentOf` —
   * so only the kit's fixtures construct one. It is a field rather than an
   * absence because the scoreboard's whole argument is that a format is a noun
   * on the right-hand side and nothing else, and a card that cannot be handed a
   * person is a card that will have to be rebuilt to accept one.
   */
  opponent?: Duel | null;
};

/**
 * What the card is sitting ON, which decides how light its fill is.
 *
 * ---------------------------------------------------------------------------
 * THE BOARD'S CARD WAS A THIRD GREY ON A SCREEN THAT ONLY HAS ROOM FOR TWO
 * ---------------------------------------------------------------------------
 *
 * On the lineup board the page is #000, the tab bar across the bottom is
 * `surfaceSheet`, and this card was `surface` — one step lighter than the bar,
 * for no reason a reader could name. Two pieces of furniture at the top and
 * bottom of one screen, both raised off the same black, in two different
 * greys: the card did not look wrong so much as slightly out of tune, which is
 * the failure mode that survives review longest.
 *
 * It is not a matter of picking the darker value everywhere, and that is why
 * this is a prop rather than an edit. The lobby draws these cards INSIDE a
 * sheet, and a sheet is already `surfaceSheet` — a card at the same value there
 * is an invisible card with a hairline round it, which is precisely the bug the
 * token's own note in `theme.ts` warns about. The ramp has to keep stacking
 * wherever the card lands:
 *
 *     on the page    #000 page  →  #0E1013 card, level with the tab bar
 *     on a sheet     #0E1013 sheet  →  #17191E card, a step above it
 *
 * So the answer is a property of the SURFACE the card is placed on, which only
 * the caller knows. `sheet` is the default because it is the conservative one:
 * a caller that says nothing gets the fill every caller had before this
 * existed.
 */
export type CardLevel = 'page' | 'sheet';

/* ================================================================== zones */

/**
 * WHO this contest is, HOW IT IS WON, and HOW FULL IT IS — in that order.
 *
 * ---------------------------------------------------------------------------
 * THE OBJECTIVE BELONGS DIRECTLY UNDER THE NAME
 * ---------------------------------------------------------------------------
 *
 * "Beat the median" and "Top 3 of 6 win" led the TRADE band before this, one
 * rank down, because that is where they stopped being truncated. That fixed the
 * clipping and left the rank wrong: the win condition is not a term of the
 * trade, it is what the contest IS. A player scanning a carousel reads the name
 * and then wants one sentence saying what they are being asked to do, and every
 * figure lower down — the mark on the rail, the share of the pool — is
 * conditional on it. It reads first because it is read first.
 *
 * IT IS NAMED RATHER THAN EMPHASISED. The first version of this line was 13pt
 * semibold in the primary colour, which made it the second-loudest thing on the
 * card and put it in an argument with the contest's own name eleven points
 * above. `WIN CONDITION` in front of it does the same job better: a reader who
 * does not know what "Top 3 of 6 win" is a statement ABOUT cannot be told by
 * making it bolder, only by labelling it. Same micro-label-then-value shape as
 * `NEXT LOCK 7h 13m` beside it and `MEDIAN 96.2` below.
 *
 * WHAT THE HEAD NO LONGER SAYS. `Full Roster · 8 cards` went with it. How many
 * cards a contest asks for and which positions they must be is spelled out by
 * the slot board directly beneath the card and by the contest's own page; a
 * head repeating it was spending its second-best line on scenery.
 *
 * THE COUNTDOWN IS ONE SMALL ROW NOW, not a stacked 18pt figure. It was the
 * card's hero for the days before kickoff, which over-ranked it: a deadline is
 * something you check, not something you watch. It keeps the far right of the
 * name's own line, at the size of a label, and it doubles as the phase — see
 * `LockTag`.
 *
 * AND THE FILL COUNT SITS UNDER IT. It had a row of its own, with the season
 * record squared off against it — two facts that were not about which contest
 * this is, taking a third of the head to say so. Under the countdown it is in
 * the right company: both of them are the contest's CLOCK. One says how long
 * you have; the other says whether enough people have turned up for the week to
 * be scoreable at all.
 */
/**
 * Contest format to glyph.
 *
 * KEYED ON THE DISPLAY NAME, WHICH IS DEBT. `contest_formats` has a `code`
 * column — main, flex3, wr_room — and that is what this should key off; the
 * model carries only `formatName`, so wiring the mark today means matching on
 * a string a copy edit could change. The lookup normalises case and spacing to
 * blunt that, and an unknown name renders no mark rather than the wrong one,
 * but the durable fix is to carry `format_code` through `use-contests.ts` into
 * `ContestTerms` and rekey this on it.
 */
const FORMAT_GLYPHS: Record<string, Glyph | undefined> = {
  fullroster: formatRoster,
  flexthree: formatFlex3,
  wrroom: formatWr,
};

function formatGlyphOf(formatName: string): Glyph | undefined {
  return FORMAT_GLYPHS[formatName.toLowerCase().replace(/[^a-z0-9]/g, '')];
}

function Head({
  name,
  terms,
  right,
  duel,
}: {
  name: string;
  terms: ContestTerms;
  /** The name's right-hand end: a lock tag on the board, a chip in the lobby. */
  right: React.ReactNode;
  /** So the objective can name the opponent the scoreboard names. */
  duel?: Duel | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const formatMark = formatGlyphOf(terms.formatName);

  return (
    <View style={[styles.band, styles.head, { borderColor: c.border }]}>
      <View style={styles.headTop}>
        {formatMark ? (
          <Icon glyph={formatMark} color={c.textSecondary} size={18} focused />
        ) : null}
        <Text numberOfLines={1} style={[Type.section, styles.headName, { color: c.text }]}>
          {name}
        </Text>
        {right}
      </View>
      {/* THE ONE LINE ON THE CARD A READER MUST NOT SKIM. At `strong` and in
          the primary colour: "Top 3 of 6 win" and "Beat the median" are the
          same shape of sentence describing offers that are nothing alike. */}
      <View style={styles.headSub}>
        {/* LABELLED, AND QUIETER FOR IT. This was 13pt semibold in the primary
            colour — the second-loudest thing on the card, competing with the
            contest's own name directly above it. A term does not have to shout
            to be read; it has to be NAMED. The label in front of it does the
            work the weight was doing, in the same micro-label-then-value shape
            as `NEXT LOCK 7h 13m` on the line above and `MEDIAN 96.2` in the
            band below — so the head has one loud line, the name, and the card
            reads as three ranks instead of two.

            `TO WIN` RATHER THAN `WIN CONDITION`. Same fact, seven characters
            shorter, and it reads as the first half of the sentence its value
            completes — "to win, beat the median" — where the longer label read
            as a form field. The width matters as much as the grammar: this row
            also carries the entry count, which does not wrap and has already
            been clipped twice by a label that was taking room it did not
            need. */}
        <View style={styles.headWin}>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            TO WIN
          </Text>
          <Text numberOfLines={1} style={[Type.fine, { color: c.text }]}>
            {winLine(terms, duel)}
          </Text>
        </View>
        {/* TERTIARY, WHICH RANKS THE HEAD PROPERLY. Everything else on these
            two rows is either a name or a labelled term — the contest, the
            deadline, how it is won, all of them things a reader acts on. The
            entry count is the one fact here that is nobody's to change, so it
            is the one that recedes. */}
        <Text numberOfLines={1} style={[Type.fine, styles.headFill, { color: c.textTertiary }]}>
          {fillLine(terms)}
        </Text>
      </View>
    </View>
  );
}

/**
 * The deadline, or the phase it has turned into. One row, right of the name.
 *
 * FOUR STATES AND THEY ARE ORDERED BY WHAT IS STILL IN THE READER'S HANDS.
 * A week that is final is final whatever the clock says; a week with a ball in
 * the air is live; a countdown only means anything while the roster can still
 * be changed. `LOCKED` is the tail case — locked, and nobody has played yet.
 *
 * THE COUNTDOWN RUNS TO THE NEXT PLAYER'S KICKOFF, not to the week's first.
 * Players lock one at a time, so this is a deadline that arrives several times
 * and shortens the bench each time rather than ending the week — which is why
 * the label is NEXT LOCK and not simply LOCKS.
 */
export function LockTag({ lock, field }: { lock: Lock | null; field?: FieldWeek | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const played = field != null && field.high > 0;

  if (played && field.final) return <Tag label="FINAL" color={c.textSecondary} />;
  if (played) return <Tag label="LIVE" color={c.negative} />;
  if (lock !== null && !lock.locked && lock.at !== null) {
    return (
      <View style={styles.lockRow}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          NEXT LOCK
        </Text>
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, styles.lockValue, { color: c.text }]}>
          {countdownLabel(new Date(lock.at).getTime() - lock.now)}
        </Text>
      </View>
    );
  }
  if (lock?.locked) return <Tag label="LOCKED" color={c.textTertiary} />;
  return null;
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <Text numberOfLines={1} style={[Type.micro, { color }]}>
      {label}
    </Text>
  );
}

/**
 * THE SCOREBOARD: your total, THEIR total, and how the gap is going.
 *
 * ---------------------------------------------------------------------------
 * TWO SIDES AND A COMPARISON — WHICH IS EVERY FORMAT THIS GAME CAN HAVE
 * ---------------------------------------------------------------------------
 *
 * The band this replaces was a figure, a mark and an axis: your score at hero
 * size, a threshold beside it, a rail underneath. It read well once the week
 * was live and it had two problems that were really one problem.
 *
 * IT HAD NO SEAT FOR A PERSON. A "mark" is a number on a scale. When a
 * head-to-head format arrives its opponent is a manager with a handle and a
 * lineup, and there was nowhere in that shape to put them — the band would have
 * had to be rebuilt, or a second band invented, which is how this card ended up
 * with two layouts the first time round.
 *
 * IT WAS DEAD FOR FOUR DAYS A WEEK. Before kickoff it drew a dash at hero size,
 * a second dash beside it and an empty rail under both — about sixty per cent
 * reserved space, in the state most people meet FIRST.
 *
 * Both fall out of the same fix, which is to notice that the three formats are
 * one sentence with a different noun in it: you against the community's middle,
 * you against the score at the cut, you against another manager. That is a
 * SCOREBOARD. Name on top, total under it, both sides drawn identically, and
 * the right-hand name is the only thing a format changes — see `opponentOf`,
 * which answers "who am I playing" where `markOf` answered "where do I draw a
 * line".
 *
 * AND A SCOREBOARD BEFORE KICKOFF READS 0–0. That is not a dash and it is not
 * an invention: nobody has scored, which is exactly what nought says. Worth
 * knowing that this reverses an earlier call — the card used to draw 0.0
 * pregame and it was pulled as a bug. It WAS a bug: `score_week` stamps
 * `scored_at` and writes `total_points = 0` whether or not a ball has been
 * thrown, so a stored nought was arriving under a FINAL chip on a week that had
 * not started, and the card was reporting a result. A nought presented as one
 * side of a scoreboard, on a card whose head says the next lock is in six
 * hours, is a different claim made with the same character.
 *
 * ---------------------------------------------------------------------------
 * THE SLOT UNDERNEATH IS CHOSEN BY WHAT THERE IS TO DRAW
 * ---------------------------------------------------------------------------
 *
 *   field, played     the distribution — where you sit between the field's
 *                     worst and best, with the line to beat marked on it. The
 *                     one thing a twenty-six manager contest has that a duel
 *                     does not, which is why it survived the rewrite.
 *   duel, played      a tug-of-war from level. A distribution of two people is
 *                     not a distribution.
 *   nothing yet       an empty rail. The scale is drawn in every state, so the
 *                     first score arrives ON it. A week played in a contest
 *                     with nobody else in it says `NO FIELD YET` in the
 *                     opponent's own column — that one needs words, because a
 *                     real total against a dash is otherwise unexplained.
 *
 * IT DOES NOT REPEAT THE COUNTDOWN. The obvious pregame line is "first kickoff
 * in 6h 20m" and the head is already saying that, forty points above, in larger
 * type. Every regression this card has had has been the same fact stated twice.
 */
function Score({
  terms,
  entry,
}: {
  terms: ContestTerms;
  entry: Entry | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const field = entry?.field ?? null;
  /* THE HONEST TEST OF "HAS ANYBODY PLAYED" IS THE FIELD'S BEST SCORE.
     `score_week` stamps `scored_at` and writes `total_points = 0` whether or
     not a ball has been thrown, so keying off that put a confident "0.0" and a
     FINAL label on a week that had not started. */
  const played = field !== null && field.high > 0;

  const them = opponentOf(terms, {
    median: field?.median ?? 0,
    cut: entry?.cut ?? null,
    duel: entry?.opponent ?? null,
  });

  /**
   * IS THERE ANYBODY TO PLAY? — which is not the same question as whether the
   * week has started, and conflating them was a real bug.
   *
   * A field of ONE is its own low, median and high. `opponentOf` dutifully
   * returns that median, so the scoreboard drew your own 88.2 in the COMMUNITY
   * column with `+0.0` beside it: a settled week rendered as a tie against
   * yourself, which is both meaningless and the single most misleading thing
   * this band could say. Two entrants is the floor for a middle to be on one
   * side of, and it is the same floor `median_record` enforces.
   *
   * A duel is exempt. It has an opponent rather than a field, and two people is
   * all one ever needs.
   */
  const comparable =
    played && (them.shape === 'duel' || (field !== null && field.entrants >= MIN_ENTRANTS));

  /* THE RANK IS WITHHELD WHILE THE WHOLE FIELD IS TIED. Before kickoff every
     lineup sits on a stored nought and `rank()` hands EVERYONE first place, so
     the test is whether the field has SPREAD rather than whether it has played.
     A field of one is exempt: its rank is unambiguous and `of 1` says exactly
     what it is worth. */
  const rank =
    played && field.myRank !== null && (field.entrants === 1 || field.high > field.low)
      ? field.myRank
      : null;

  /* ALWAYS WITH THE POOL SIZE, never a bare "#1". "#1 of 24" and "#1 of 1" are
     the same rank and nothing like the same achievement. Falls back to the bare
     pronoun where there is no rank worth stating — before kickoff, and on a
     duel, where "of 2" is noise. */
  const myName =
    rank !== null && field !== null && them.shape === 'field'
      ? `YOU · #${rank} OF ${field.entrants}`
      : 'YOU';

  /**
   * NOBODY TO PLAY IS SAID IN THE OPPONENT'S OWN COLUMN, not under the rail.
   *
   * A week that HAS been played in a contest with one entrant has a real total
   * and no one to measure it against — `opponentOf` would hand back your own
   * median, which drew a settled 88.2 as a tie against yourself. The honest
   * answer is that there is no opponent, and the place to say so is the column
   * whose entire job is naming one.
   *
   * The other two states this used to caption are not captioned at all now.
   * `NO SCORES YET` sat under a dimmed 0–0 on a card whose head was counting
   * down to the lock, and `NOT ENTERED` sat under two dashes on a card whose
   * head was showing an ENTER chip; both were the card saying a thing twice,
   * which is the failure mode it has had at every size.
   */
  const theirName = played && !comparable ? 'NO FIELD YET' : them.label;

  /* The median of an unplayed field is a stored nought, not a threshold — and
     the median of a field of one is you. Neither is an opponent. */
  const theirTotal = comparable ? them.value : null;
  const margin =
    entry !== null && entry.myPoints !== null && theirTotal !== null
      ? entry.myPoints - theirTotal
      : null;

  /* 0–0 ONCE THERE IS AN ENTRY, a dash where there is not. The difference is
     real: an entered week has a total that happens to be nought, and a contest
     you are not in has no total at all.

     THE RIGHT-HAND SIDE HAS A THIRD CASE THE LEFT DOES NOT. It can be a nought
     (the week has not started), a real total (there is a field or an opponent),
     or a DASH — a week that HAS been played in a contest with nobody else in
     it. There is no opposing total to draw there, and drawing your own would be
     the tie-against-yourself bug above. */
  const mine = entry === null ? DASH : played ? fmt(entry.myPoints) : (0).toFixed(1);
  const theirs =
    entry === null ? DASH : !played ? (0).toFixed(1) : comparable ? fmt(them.value) : DASH;

  return (
    <View style={[styles.band, styles.score, { borderColor: c.border }]}>
      <View style={styles.scoreRow}>
        <Side name={myName} value={mine} muted={!played} />
        <Side
          align="right"
          name={theirName}
          value={theirs}
          muted={!played}
          after={
            margin === null ? null : (
              <Text
                numberOfLines={1}
                style={[Type.micro, NUMERIC, { color: margin >= 0 ? c.positive : c.negative }]}>
                {margin >= 0 ? '+' : '−'}
                {Math.abs(margin).toFixed(1)}
              </Text>
            )
          }
        />
      </View>
      <View style={styles.slot}>
        {/* AN EMPTY RAIL RATHER THAN A CAPTION where there is nothing to plot.
            The scale is drawn in every state, so the first score appears ON it
            rather than pushing the trade band down to make room for it. */}
        {!comparable || field === null ? (
          <View style={[styles.track, { backgroundColor: c.backgroundElement }]} />
        ) : them.shape === 'duel' ? (
          <TugBar mine={entry?.myPoints ?? 0} theirs={theirTotal ?? 0} />
        ) : (
          <ScaleBar
            low={field.low}
            high={field.high}
            mark={theirTotal}
            mine={entry?.myPoints ?? null}
          />
        )}
      </View>
    </View>
  );
}

/**
 * One side of the scoreboard: who, then how many.
 *
 * NAME OVER TOTAL, WHICH IS THE WAY ROUND EVERY SCOREBOARD IS. The previous
 * version stacked them the other way — figure over a qualifier — because the
 * figure was the band's subject and the label was a footnote on it. With two
 * sides there is no footnote: the label is half the fact, because "97.6" means
 * nothing until you know whether it belongs to the community, the cut or a
 * person. Reading down the column now answers who-then-what-they-have, which is
 * the order a reader asks it in.
 *
 * The column never shrinks, so a five character total replacing a three
 * character one cannot drag its neighbour sideways.
 */
function Side({
  name,
  value,
  align = 'left',
  muted = false,
  after,
}: {
  name: string;
  value: string;
  align?: 'left' | 'right';
  /** Nothing has been played: the totals are true and not yet interesting. */
  muted?: boolean;
  /** Drawn on the name's row, after it. Today: the margin against them. */
  after?: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.side, align === 'right' && styles.sideRight]}>
      <View style={styles.sideName}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {name}
        </Text>
        {after}
      </View>
      {/* A NOUGHT NOBODY HAS EARNED IS NOT LIT LIKE A SCORE. At 20pt in 800
          weight two white noughts are the loudest thing on the card in the
          state where it has least to say; at tertiary they read as the empty
          scoreboard they are, and the first real total arrives in white at
          exactly the position the eye is already on. */}
      <Text
        numberOfLines={1}
        style={[
          styles.figure,
          NUMERIC,
          { color: muted || value === DASH ? c.textTertiary : c.text },
        ]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A duel, drawn from level: the centre is a tie and your bar grows toward
 * whoever is winning.
 *
 * NOT A DISTRIBUTION, because two people are not a field. `ScaleBar` places you
 * between a worst and a best score, and with one opponent those are simply the
 * two totals — so it would draw every duel as a full bar against an empty one
 * whether you were ahead by two points or by ninety.
 *
 * THE SCALE IS THE LEADER'S OWN TOTAL, so the bar answers "by how much" in the
 * only unit that means anything without a field to normalise against: a share
 * of what the leading manager has actually scored. Ten points clear of 40 is a
 * long bar and ten points clear of 200 is a short one, which is the truth of
 * it.
 *
 * NOTHING CONSTRUCTS ONE OF THESE OUTSIDE THE KIT. No head-to-head format
 * exists yet — see `opponentOf`. It is written because the point of the
 * scoreboard is that the format is a branch in the model and a graphic here,
 * and a switch with one case is not a switch.
 */
function TugBar({ mine, theirs }: { mine: number; theirs: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const ahead = mine >= theirs;
  const scale = Math.max(mine, theirs, 1);
  /* Half the track is the whole of one side, so a runaway lead pins rather than
     running off the end. */
  const reach = Math.min(1, Math.abs(mine - theirs) / scale) * 50;

  return (
    <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
      <View
        style={[
          styles.tugLead,
          ahead
            ? { left: '50%', width: `${reach}%`, backgroundColor: c.positive }
            : { left: `${50 - reach}%`, width: `${reach}%`, backgroundColor: c.negative },
        ]}
      />
      {/* Drawn over the lead: level is the reference and it must stay visible
          at any margin, including nought. */}
      <View style={[styles.tugCentre, { backgroundColor: c.text }]} />
    </View>
  );
}

/**
 * THE TRADE: what you put up on the left, what you can take on the right, and a
 * hairline between them.
 *
 * TWO COLUMNS RATHER THAN A SENTENCE, because it is a comparison and a reader
 * is making it. Strung along one line — "40 gems, 1 heart at risk, top 3 win,
 * pool 200" — the two halves interleave and the reader has to sort them before
 * they can weigh them. Side by side, the weighing is the reading.
 *
 * THE LABELS ARE BACK, AND SO IS THE RULE. They were replaced by an arrow
 * between the columns, on the argument that the direction of a trade says which
 * side is which — which it does, to somebody who already knows they are looking
 * at a trade. `RISK` and `REWARD` are two 9pt words that cost one row the band
 * was going to reserve anyway, and they turn a glance into a reading.
 *
 * BOTH COLUMNS READ FROM THE LEFT. The reward used to be right-aligned, on the
 * old logic that a trade runs outward from the middle and the two columns
 * should mirror each other about the divider. In practice it gave the card two
 * reading edges: the eye starts a line at the divider on one side and at the
 * card's border on the other, so "Share of 20 gems" and "+1 heart" began in two
 * different places and neither lined up with anything above it. Left-aligned,
 * each column has one edge and the whole card has two.
 *
 * THE HEAL SITS IN THE REWARD COLUMN, NEVER BESIDE THE RISK. A contest that
 * takes a heart most weeks and gives one back when it lands is not a harsher
 * version of the even-money contest; it is the only place in the game hearts
 * come FROM. Printed next to the risk it reads as a discount on the damage.
 *
 * THE TERMS STAY ON AN ENTERED CARD, and the gems are the debatable part — they
 * are spent, and an earlier version dropped them on the grounds that a price
 * already paid is not news. But the trade is not over until settlement: the
 * heart is still riding, the pool is still growing, and the reward is still
 * ahead of you.
 */
function Trade({
  terms,
  prize,
  settled,
}: {
  terms: ContestTerms;
  prize: number | null;
  settled: Settlement | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* THE SAME BAND IN THE PAST TENSE — see `stakeLines` in `contest-model`.
     Two columns, two labels, the same fixed rows; only the tense of what is in
     them changes, so the card's height cannot move and a reader who has looked
     at this corner all week finds the answer where the question was. */
  return (
    <View style={[styles.band, styles.trade]}>
      <TradeColumn
        label={settled ? 'STAKED' : 'RISK'}
        lines={settled ? stakeLines(terms, settled) : riskLines(terms)}
      />
      <View style={[styles.tradeRule, { backgroundColor: c.border }]} />
      <TradeColumn
        label={settled ? 'EARNED' : 'REWARD'}
        lines={settled ? takeLines(terms, settled, prize) : rewardLines(terms, prize)}
      />
    </View>
  );
}

/**
 * One side of the trade, always `TRADE_LINES` rows tall.
 *
 * THE PADDING ROWS ARE THE POINT. A contest that risks no hearts has one line
 * where another has two, and left to itself that is a card eighteen points
 * shorter than the one beside it in the carousel. The blanks cost nothing to
 * read and they are what makes the height a constant rather than a tendency.
 */
function TradeColumn({ label, lines }: { label: string; lines: TradeLine[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const shown = lines.slice(0, TRADE_LINES);
  return (
    <View style={styles.tradeCol}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      {shown.map((line) => (
        <View key={line.text} style={styles.tradeLine}>
          {/* A HEART THAT WAS TAKEN IS DRAWN AS TAKEN. Every other heart on
              this card is a heart you still hold, and `Hearts` already owns
              the two shapes — whole and torn — that tell those apart on the
              rail directly beneath the carousel. Drawing a lost heart whole
              here would be the one place in the app where the glyph and the
              word beside it disagree. */}
          {line.heart ? (
            <Heart
              size={10}
              state={line.tone === 'negative' ? 'killed' : 'free'}
              color={line.tone === 'negative' ? undefined : c.negative}
            />
          ) : null}
          {/* `fine`, NOT `body`, AND THAT IS A RANK FIX BEFORE IT IS A SIZE
              ONE. The win condition in the head is the line on this card a
              reader must not skim, and it is set at `fine`; the trade's values
              were a step LARGER, so the least urgent band had the loudest body
              type on the card. */}
          <Text
            numberOfLines={1}
            style={[
              Type.fine,
              styles.tradeText,
              {
                color:
                  line.tone === 'positive'
                    ? c.positive
                    : line.tone === 'negative'
                      ? c.negative
                      : c.text,
              },
            ]}>
            {line.text}
          </Text>
        </View>
      ))}
      {Array.from({ length: TRADE_LINES - shown.length }, (_, i) => (
        <View key={`pad-${i}`} style={styles.tradeLine} />
      ))}
    </View>
  );
}

/**
 * Where you sit between the field's worst and best score, and which side of the
 * line that puts you on.
 *
 * The caller is IN the field, so `low <= mine <= high` holds by construction
 * and the fill can never run off either end. The clamp is belt-and-braces
 * against a stale read pairing this week's score with last week's range
 * mid-refresh, not against the arithmetic.
 *
 * THE MARK IS PASSED IN, not computed here. A bar that decided its own
 * threshold would be the second place in the app that knows how a contest is
 * won, which is exactly the divergence `contest-model` exists to close.
 */
function ScaleBar({
  low,
  high,
  mark,
  mine,
}: {
  low: number;
  high: number;
  mark: number | null;
  mine: number | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* A field where everybody has the same score has no width to place anybody
     in. Dividing by it would put every mark at NaN%, which renders as a bar
     with nothing on it and no clue why. */
  const span = high - low;
  const at = (v: number) => (span <= 0 ? 0 : Math.min(1, Math.max(0, (v - low) / span)) * 100);

  const fill = mine === null ? 0 : at(mine);
  const beating = mine !== null && mark !== null && mine >= mark;

  return (
    <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
      {/* Percentage widths rather than flex, because the mark has to sit at an
          absolute position on the same axis as the fill's end. Two different
          layout systems on one scale would drift apart. */}
      <View
        style={[
          styles.fill,
          { width: `${fill}%`, backgroundColor: beating ? c.positive : c.textSecondary },
        ]}
      />
      {/* Drawn last so it sits ON the fill rather than under it — the whole
          point is seeing whether you have passed it. `marginLeft` of half its
          own width centres the line on the value instead of starting at it. */}
      {mark === null ? null : (
        <View style={[styles.mark, { left: `${at(mark)}%`, backgroundColor: c.text }]} />
      )}
    </View>
  );
}

/* =================================================================== card */

/**
 * The frame. Head, scoring, trade — always all three, always the same height.
 *
 * THE MIDDLE IS NO LONGER OPTIONAL AND NO LONGER A NODE. It arrived as a
 * `React.ReactNode` so that the lobby and the board could not grow per-variant
 * conditions inside the card, which was the right guard for a card with two
 * shapes. There is one shape now, and a node prop would be the one hole left in
 * the height contract — so the card takes `entry` and draws the band itself.
 *
 * THE RUN IS NOT ONE OF THESE BANDS. It was, briefly — see `RunRail` in
 * `ContestCarousel`. Short version: the rack is a property of the RUN, and a
 * run does not change when you swipe, so drawing it inside a card that slides
 * off the screen made it look as though it did.
 */
export function ContestCard({
  name,
  terms,
  lock = null,
  status,
  entry = null,
  prize = null,
  settled = null,
  level = 'sheet',
  onPress,
}: {
  name: string;
  terms: ContestTerms;
  /** The week's deadline, drawn at the head's right end. */
  lock?: Lock | null;
  /**
   * Overrides the lock tag in the head's right corner.
   *
   * The lobby's question is "can I enter this", not "when does it lock", and it
   * answers with a `StatusChip`. Same corner, same rank, same one row — which
   * is the constraint that matters, since the head reserves exactly 20pt for
   * whatever lands here.
   */
  status?: React.ReactNode;
  /** Your entry, or null in the lobby. */
  entry?: Entry | null;
  /** What you were paid out of the pool, once the week is settled. */
  prize?: number | null;
  /**
   * THE WEEK IS OVER AND THIS IS WHAT IT DID. Null while it is still an offer.
   *
   * It turns the trade band's tense over — `STAKED` and `EARNED` in place of
   * `RISK` and `REWARD` — which is the card's finished state and the reason
   * the board underneath no longer carries a note explaining that a recap
   * cannot be edited. See `stakeLines` in `contest-model`.
   */
  settled?: Settlement | null;
  /** What this card is sitting on. See `CardLevel`. */
  level?: CardLevel;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const fill = level === 'page' ? c.surfaceSheet : c.surface;

  const body = (
    <>
      <Head
        name={name}
        terms={terms}
        right={status ?? <LockTag lock={lock} field={entry?.field ?? null} />}
        duel={entry?.opponent}
      />
      <Score terms={terms} entry={entry} />
      <Trade terms={terms} prize={prize} settled={settled} />
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, { backgroundColor: fill, borderColor: c.border }]}>{body}</View>
    );
  }

  /* `Pressable` around the whole card rather than a control on it. The card is
     a dense thing and any button placed inside would be competing with the
     terms for a corner that is already saying something. */
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: fill, borderColor: c.border },
        pressed && styles.pressed,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },
  pressed: { opacity: 0.7 },

  /**
   * EVERY BAND, ONE GEOMETRY. The gutter is `Spacing.three`, which is the
   * lineup rows' own and the section headings' own: a card whose left edge is
   * two points inside the board it heads reads as a mistake. The 2pt gap is the
   * gap BETWEEN LINES OF ONE BLOCK, which is what a band is.
   *
   * The height comes from the band's own style below. `justifyContent: center`
   * so that a band whose rows come out a point under its declared height keeps
   * its air even top and bottom rather than collecting it at the bottom.
   */
  band: {
    paddingHorizontal: Spacing.three,
    paddingVertical: BAND_PAD,
    gap: 2,
    justifyContent: 'center',
  },

  /* `gap: Spacing.one`, overriding the band's 2. The name and the terms under
     it are two blocks rather than two lines of one — see the note on HEAD_H. */
  head: { height: HEAD_H, gap: Spacing.one, borderBottomWidth: StyleSheet.hairlineWidth },
  /* Fixed at the name's own line height, so a `StatusChip` (17pt) and a lock
     tag (12pt) both land on the name's line without moving the two rows under
     them by a point. */
  headTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: Type.section.lineHeight,
  },
  /* Takes the room the tag does not. `minWidth: 0` is what lets a long name
     truncate instead of shoving the tag off the card. */
  headName: { flex: 1, minWidth: 0 },
  /* The objective on the left, the fill under the countdown on the right, and
     THE FILL IS THE ONE THAT GIVES WAY. It is not always the short string it
     looks like — "No entries yet · 2 more to play" is thirty-one characters —
     and the line it would otherwise crowd is the one line on the card a reader
     must not skim. So the objective never shrinks and the fill truncates into
     whatever is left, which is the right way round: losing the tail of a seat
     count costs a detail, losing the tail of "Top 3 of 24 win" costs the terms. */
  headSub: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: Type.strong.lineHeight,
  },
  headWin: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  headFill: { flexShrink: 1, minWidth: 0 },

  /* The label and the value on one line, which is the whole brief for this
     corner: smaller than the figure it replaced, and never two rows tall. */
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  lockValue: { fontWeight: '700' },

  score: { height: SCORE_H, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  side: { minWidth: 0, flexShrink: 1, gap: 2 },
  sideRight: { alignItems: 'flex-end' },
  sideName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    height: Type.micro.lineHeight,
  },
  /* Fixed at `SLOT_H` and centred, so a rail (8) and a line of micro type (12)
     occupy the same strip and the band's height does not know which it got. */
  slot: { height: SLOT_H, justifyContent: 'center' },
  /* Grows out of the centre rather than out of an end — see `TugBar`. */
  tugLead: { position: 'absolute', top: 0, bottom: 0 },
  tugCentre: { position: 'absolute', width: 2, top: 0, bottom: 0, left: '50%', marginLeft: -1 },
  figure: {
    fontSize: FIGURE_SIZE,
    lineHeight: FIGURE_LINE,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  /* Equal halves with a hairline between them. `flex: 1` on both rather than a
     measured split, so the longest reward line truncates inside its own column
     instead of pushing the risk column off the card. */
  trade: { height: TRADE_H, flexDirection: 'row', alignItems: 'stretch', gap: Spacing.three },
  /* 2, not `Spacing.one`. A label and the lines under it are ONE block, and the
     card's gap between lines of one block is 2 — the same one the scoring band
     puts between a figure and its qualifier. At 4 this column stacked to 52
     inside a 50pt content box and quietly ate its own padding. */
  tradeCol: { flex: 1, minWidth: 0, gap: 2 },
  /* The divider Nick asked for and the arrow used to stand in for. Full height
     of the band's content box, hairline, `border` — subtle enough that it
     separates without becoming a third column. */
  tradeRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  /* Fixed at the body type's line height, filled or blank — see `TradeColumn`. */
  tradeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    height: Type.fine.lineHeight,
  },
  tradeText: { flexShrink: 1, minWidth: 0 },

  /* `overflow: hidden` so the fill's square end is clipped to the track's
     radius rather than poking out of it at 100%. */
  track: { height: 8, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  /* Centred on its value rather than starting at it: a 2pt line drawn from the
     mark's position sits entirely to the right of it, which at the top of the
     range would read as a threshold nobody could reach. */
  mark: { position: 'absolute', width: 2, top: 0, bottom: 0, marginLeft: -1 },
});
