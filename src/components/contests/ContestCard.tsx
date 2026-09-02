/**
 * A contest. One card, drawn identically wherever it appears, at one FIXED
 * SIZE, in every state it can be in.
 *
 * ---------------------------------------------------------------------------
 * THREE ZONES: A LIT PLANE WITH A WELL CUT INTO IT
 * ---------------------------------------------------------------------------
 *
 *     ┌──────────────────────────────────────────────────┐
 *     │ ▤ WR Room │ Top 3 of 24 win   24 entries │ LIVE  │  HEAD   34pt  plane
 *     ├──────────────────────────────────────────────────┤
 *     │ YOU [6TH]              VS         [3RD] TO BEAT  │  SCORE  90pt  well
 *     │ 88.1                  −9.4                 97.5  │
 *     │ PROJ —                                    PROJ — │
 *     │ ▬▬▬▬▬▬▬(6)▬▬▬┊▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  │
 *     ├──────────────────────────────────────────────────┤
 *     │ RISK  ◆40  ♥1        │        ◆120  ♥+1  ▣1  WIN │  FOOT   29pt  plane
 *     └──────────────────────────────────────────────────┘
 *
 * Each zone answers exactly one question, and that is the organising idea of
 * the 2026-08-31 rework:
 *
 *   HEAD    which contest is this, how is it won, how full is it, what state
 *           is it in — the contest's own facts, none of them about scoring.
 *   SCORE   nothing but scoring. Your total, the total you have to beat, and
 *           where the two sit on one scale.
 *   FOOT    the trade. What you put up, what you take.
 *
 * The card's structure is drawn in MATERIAL rather than in hairlines: three
 * near-invisible dividers on one flat fill was what made the previous card read
 * as six loose rows — see the surface note on `ContestCard` below.
 *
 * WHICH BAND IS THE LIT ONE WAS THE OTHER WAY ROUND, and turning it over is
 * what made the card read as a raised object rather than a drawn box.
 *
 * The middle used to be the light one, on the argument that the band a reader
 * came for should be the lit one. That is a true thing to want and it was being
 * paid for in the wrong currency, because the head and foot are the card's
 * SILHOUETTE — the first and last 34 and 29 points of it, the edge the eye uses
 * to separate the card from the page. Keeping them at `surface` meant the
 * outline of the card was its darkest part, only fifteen points off the page,
 * with the light band buried in the middle where no edge could use it. The card
 * sat IN the page instead of ON it.
 *
 * So the head and foot take `backgroundElement` and the score band takes
 * `surface`: a lit plane with a well cut into it. The scoring band still reads
 * as its own thing — it is a step of material either way, and a recessed well
 * is if anything the more literal shape for a figure you are reading OUT of the
 * card. What changed is that the lift is now on the edge, where it does work.
 *
 * Together with the outline — a full point of `borderRaised`, one colour on all
 * four sides — that is the whole of the card's elevation. There is no shadow
 * and no lit top edge; `Colors.dark.borderRaised` explains why neither of the
 * two obvious ways to raise a dark panel works on this one, and `styles.card`
 * explains why the outline is not a hairline.
 *
 * ---------------------------------------------------------------------------
 * SEPARATORS HAVE A VOCABULARY, AND IT HAS TWO WORDS
 * ---------------------------------------------------------------------------
 *
 *   SOLID hairline — two things that sit side by side. The contest's name from
 *                    its win condition; the risk from the win.
 *   DASHED line    — the line you have to cross. Appears exactly once on the
 *                    card, on the pace bar, and never anywhere else.
 *
 * That rule is why `Rule` and `Dashes` are separate components rather than one
 * with a prop. A dashed divider anywhere else would spend the only mark this
 * card has for "this is the threshold".
 *
 * ---------------------------------------------------------------------------
 * THE HEIGHT IS A CONTRACT, ENFORCED IN PIXELS
 * ---------------------------------------------------------------------------
 *
 * Every zone declares an explicit height and every row inside it is sized from
 * `Type`'s own line heights, which are fixed. Not "tends to come out the same"
 * — the same, always, in every state.
 *
 * That is not neatness. These cards are the pages of a horizontal carousel and
 * the lineup board underneath them is the rest of the screen: a card eleven
 * points taller than its neighbour makes the whole board jump on every swipe,
 * and a card that grows when the first score lands moves the board out from
 * under a reader mid-tap.
 *
 * The two rules that follow, and they are load-bearing:
 *
 *   NOTHING WRAPS. Every text is `numberOfLines={1}`. A string that needs two
 *   lines is a string that must be shortened at the source.
 *
 *   ABSENCE RESERVES ITS ROW. The projected line draws a dash rather than
 *   collapsing, and the pace bar draws an empty rail rather than disappearing.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE REWORK CHANGED, AND WHY
 * ---------------------------------------------------------------------------
 *
 * THE WIN CONDITION IS THE DASHED LINE. Not the median — the median is only
 * what it happens to be under one format. `beatSource` names where the number
 * comes from and `opponentOf` produces it, so a `top_n` contest marks the score
 * at the cut and a duel marks the opponent's total. The card never learns which
 * format it is in: it is handed a scale, your value, and the line.
 *
 * BOTH TOTALS ARE THE SAME SIZE. An earlier pass ranked yours above theirs on
 * the argument that theirs is a benchmark. It is not — it is the number you are
 * being judged against, so it is half of one comparison and the two halves are
 * peers. `VS` sits between them and the margin sits under the `VS`, which is
 * where the comparison actually happens.
 *
 * RANK IS SAID TWICE, ON PURPOSE. A chip beside `YOU` says sixth; the pip on
 * the bar says where sixth sits relative to the line. Those are different facts
 * wearing the same number — one is a standing, the other is a distance — and
 * the second is the one that answers "am I on pace" without totalling a lineup.
 *
 * THE MIDDLE BAND CAN BE LEFT OUT, AND THE LOBBY IS WHY. A contest you have
 * not entered has nothing to put in the scoring band — no total of yours, no
 * standing, no pace — so it drew a well containing the words NOT ENTERED and
 * ninety points of reserved air, which on a list of four is most of the list.
 * `scoring={false}` omits the band and NOTHING ELSE: same head, same foot, same
 * material, same gutters, same fixed heights. The card goes from 153pt to 64.
 *
 * That does not weaken the height contract, it narrows what it covers. The
 * contract is that a card never changes size UNDERNEATH A READER, and the two
 * surfaces are different lists — the lobby draws every card at 64, the carousel
 * draws every card at 153. What is forbidden is one list holding both, and the
 * prop is fixed per surface rather than derived from `entry`, so a contest
 * cannot grow a band the moment its first point lands.
 *
 * THE FOOT IS TOKENS, NOT SENTENCES. See `Token` in `contest-model`: a glyph
 * and a number is four characters where the sentence was seventeen, so a stake
 * can grow to five parts without the row breaking or the card growing a second
 * one.
 *
 * NO WIN PROBABILITY, AND NO INVENTED PROJECTION. `Entry.projected` is the slot
 * a real pregame number will land in when there is one — the provider sells
 * none today, so it is null and the row draws a dash under `PROJ`. A dash in a
 * labelled slot is an honest "not yet". A modelled number would be the app's
 * first lie, told in its own reserved row.
 */
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { formatFlex3, formatRoster, formatWr, coin, packStandard } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import { Heart } from '@/components/runs/Hearts';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { FieldWeek } from '@/components/lineup/field';
import { MIN_ENTRANTS } from '@/components/lineup/field';
import { countdownLabel } from '@/components/lineup/model';
import {
  beatSource,
  fillLine,
  opponentOf,
  riskTokens,
  stakedTokens,
  winLabel,
  winLine,
  winTokens,
  wonTokens,
  type ContestTerms,
  type Duel,
  type Settlement,
  type Token,
} from './contest-model';

/** Dash rather than a nought: no number yet is not the same as no points. */
const DASH = '—';

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : n.toFixed(1);

/* ================================================================ metrics */

/**
 * THE THREE ZONE HEIGHTS. Change one and every contest card in the app changes
 * with it — which is the point, and why they are constants rather than padding
 * that happens to add up.
 *
 *   HEAD   20 name row                                   = 20 + 14 = 34
 *   SCORE  12 label + 2 + 23 total + 2 + 11 proj         = 50
 *          + 8 gap + 18 bar slot                         = 76 + 14 = 90
 *   FOOT   15 token row                                  = 15 + 14 = 29
 *
 * 153 in total, against the 164 this replaces — and the saving is small and not
 * the point. The head costs what a head costs. What changed is that the middle
 * is one comparison instead of two stacked stat pairs, and the foot is one row
 * of tokens instead of two columns each reserving a blank line.
 */
const HEAD_H = 34;
const SCORE_H = 90;
const FOOT_H = 29;

/** The air inside every zone, top and bottom. One constant, one decision. */
const ZONE_PAD = Spacing.one + 3;

/** The two totals. Peers, so one size — see the header. */
const FIGURE_SIZE = 19;
const FIGURE_LINE = 23;

/**
 * The pace bar, where every part is sized against every other part.
 *
 * THE RAIL IS AS THIN AS IT CAN BE. At 4pt it is a line rather than a widget,
 * which is what lets the pip and the dashes be the two things the eye finds. A
 * fatter bar competes with the marks riding on it.
 *
 * THE DASHES MUST OVERHANG THE PIP, and this measurement is a bug fix rather
 * than taste. At 11pt against a 14pt pip, a score sitting exactly on the line
 * hid the line completely — the single moment the card most needs to be
 * unambiguous. 18 against 14 leaves 2pt of dash showing above and below the pip
 * at every position.
 */
const BAR_H = 4;
const PIP = 14;
const MARK_H = 18;
const SLOT_H = 18;

/**
 * How far the pip is allowed to travel.
 *
 * It is centred on its value, so at 0% or 100% half of it would hang off the
 * rail's rounded end. First place is the common case rather than an edge case,
 * so this is not defensive coding — it is the layout for a card that is
 * winning.
 */
const PIP_MIN = 5;
const PIP_MAX = 95;

/** The dashes only have to stay on the rail — see `markAt`. */
const MARK_MIN = 2;
const MARK_MAX = 98;

/** The margin's column. Fixed, so `VS` and `−9.4` share one centre line. */
const VS_W = 44;

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
 * DATA, NOT A NODE. The card owns all three zones — its height is a contract,
 * and a caller handing in a node is a caller who can hand in a two-line one.
 */
export type Entry = {
  /** Your total, or null before anybody in the field has played. */
  myPoints: number | null;
  /**
   * The PREGAME projection, and it is null on every contest today.
   *
   * The slot exists rather than the branch being absent, because the projected
   * row has to draw something and the honest choice is between a dash and a
   * lie. When the provider (or our own model) produces a real number it arrives
   * here, and the row already knows where to put it.
   */
  projected: number | null;
  /**
   * The line to beat, projected to the final whistle. Null, always, today.
   *
   * A SEPARATE FIELD rather than a second use of `projected`, because the two
   * come from different places the day they exist: yours is your lineup's
   * remaining players, theirs is the field's. Reserving one slot and filling it
   * from two sources is how a card ends up claiming a projection it does not
   * have.
   */
  projectedBeat?: number | null;
  /** This contest's distribution. Null while it loads. */
  field: FieldWeek | null;
  /** The paying cut under `top_n`. Null under `median`, where the median is it. */
  cut: number | null;
  /**
   * The other manager, on a format that has one.
   *
   * NULL EVERYWHERE TODAY. No head-to-head contest exists — see `opponentOf` —
   * so only the kit's fixtures construct one. It is a field rather than an
   * absence because the scoring band's whole argument is that the format is a
   * source for one number, and a card that cannot be handed a person is a card
   * that will have to be rebuilt to accept one.
   */
  opponent?: Duel | null;
};

/* ================================================================== atoms */

/** Two things side by side. See the separator vocabulary in the header. */
function Rule({ tall = false }: { tall?: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <View style={[styles.rule, tall && styles.ruleTall, { backgroundColor: c.borderStrong }]} />;
}

/**
 * The line you have to cross. Three segments rather than a dashed border.
 *
 * `borderStyle: 'dashed'` on a single side is unreliable across platforms and
 * renders solid on some Android builds, which would silently collapse the one
 * distinction the card's separator vocabulary rests on. Three views cannot fall
 * back to anything.
 */
function Dashes({ left, color }: { left: DimensionValue; color: string }) {
  return (
    <View style={[styles.mark, { left }]} pointerEvents="none">
      <View style={[styles.markSeg, { backgroundColor: color }]} />
      <View style={[styles.markSeg, { backgroundColor: color }]} />
      <View style={[styles.markSeg, { backgroundColor: color }]} />
    </View>
  );
}

/** A small filled well: the rank, and whose score the line belongs to. */
function Badge({ text, strong = false }: { text: string; strong?: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.badge, { backgroundColor: c.backgroundSelected }]}>
      <Text
        numberOfLines={1}
        style={[styles.badgeText, { color: strong ? c.text : c.textSecondary }]}>
        {text}
      </Text>
    </View>
  );
}

/* =================================================================== head */

/**
 * Contest format to glyph.
 *
 * KEYED ON THE DISPLAY NAME, WHICH IS DEBT. `contest_formats` has a `code`
 * column — main, flex3, wr_room — and that is what this should key off; the
 * model carries only `formatName`, so matching today means matching on a string
 * a copy edit could change. The lookup normalises case and spacing to blunt
 * that, and an unknown name renders no mark rather than the wrong one, but the
 * durable fix is to carry `format_code` through `use-contests.ts` into
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

/**
 * WHICH contest, HOW IT IS WON, HOW FULL IT IS, and WHAT STATE IT IS IN — one
 * row, four facts, two fields either side of the card.
 *
 * IT WAS TWO ROWS AND THE FIRST WAS HALF EMPTY: a name on the left and a chip
 * on the right, with the objective and the entry count crowding each other on
 * the line below. One row fits — the heaviest contest measures about 410 of the
 * 460 points available — so the second row was buying nothing.
 *
 * THE OBJECTIVE IS QUIET, AND THAT REVERSES AN EARLIER CALL. It used to be the
 * line on this card a reader must not skim: first at 13pt semibold in the
 * primary colour, then labelled `TO WIN` to calm it down. It sits at tertiary
 * now, level with the entry count, because the head's job is identity and the
 * name is the only thing in it that should be loud.
 *
 * That is safe for a specific reason rather than out of optimism: the scoring
 * band restates it. `TO BEAT` over a `MEDIAN` or `3RD` chip is the same fact
 * expressed as the number you are chasing, sitting directly above the number
 * you are chasing. The head no longer carries it alone.
 *
 * THE GIVE-ORDER IS THE OLD LESSON, KEPT. If the row runs out of width the
 * contest's NAME and the ENTRY COUNT truncate; the objective never does. The
 * previous card learned this the hard way and rendered `Full Roster · 8 cards ·
 * Beat the med…` on every entered card before lock.
 */
function Head({
  name,
  terms,
  period,
  right,
  duel,
}: {
  name: string;
  terms: ContestTerms;
  /** Replaces the objective once the week is over — see the `period` prop. */
  period?: string;
  /** The row's far right: the card's own status, or a caller's chip. */
  right: React.ReactNode;
  /** So the objective can name the opponent the scoring band names. */
  duel?: Duel | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const formatMark = formatGlyphOf(terms.formatName);

  return (
    <View style={[styles.zone, styles.head, { backgroundColor: c.backgroundElement }]}>
      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          {formatMark ? (
            <Icon glyph={formatMark} color={c.textSecondary} size={16} focused />
          ) : null}
          <Text numberOfLines={1} style={[Type.section, styles.headName, { color: c.text }]}>
            {name}
          </Text>
          <Rule />
          <Text numberOfLines={1} style={[Type.fine, styles.headHold, { color: c.textTertiary }]}>
            {period ?? winLine(terms, duel)}
          </Text>
        </View>
        <View style={styles.headRight}>
          <Text numberOfLines={1} style={[Type.fine, styles.headGive, { color: c.textTertiary }]}>
            {fillLine(terms)}
          </Text>
          {/* THE STATE NEVER GIVES. A caller's word can be as long as "40 COINS
              SHORT", and a truncated status is the one string here that becomes
              actively wrong when it is clipped — `NOT ENOUGH G…` reads as a
              different sentence. The entry count is what shortens.

              AND THE RULE GOES WITH IT WHEN THERE IS NO STATE. A divider is a
              mark between two things; drawn against nothing it is a tick
              hanging off the end of the entry count. The lobby is where that
              started mattering — it passes `status={null}` now that the ENTER
              chip is gone — and `right` is null there rather than an element
              that renders null, which is what lets this test work at all. */}
          {right !== null ? (
            <>
              <Rule />
              <View style={styles.status}>{right}</View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The week's state, in one word or one countdown, in the colour that word means.
 *
 * ---------------------------------------------------------------------------
 * ONE SLOT, ALWAYS THE MOST URGENT FACT
 * ---------------------------------------------------------------------------
 *
 *   before lock   the countdown, in secondary grey. `OPEN` was a word that told
 *                 a reader what `9D 5H` already implies, so the deadline takes
 *                 the slot instead — it is the only thing anybody wants from a
 *                 contest that has not started.
 *   locked        `LOCKED`, tertiary. Locked, and nobody has played yet.
 *   live          `LIVE`, in `live` blue.
 *   settled       `WON` / `LOST` / `TIE`, in the colour of the outcome.
 *
 * IT IS NOT A PILL ANY MORE. A filled chip is a second object on a card that is
 * trying to have one lit band, and colour alone is enough to find a single word
 * at the end of a row. Dropping it cost nothing in height: the row was already
 * sized by the contest's name.
 *
 * BLUE IS A FOURTH SEMANTIC HUE AND IT IS DELIBERATE. Gold is taken twice
 * within a hundred points of this card — `selectionAccent` marks the focused
 * heart and fills the Contests button under the carousel — and red is taken by
 * losing. See the `live` note in `theme.ts`.
 */
export function StatusMark({
  lock,
  field,
  settled,
}: {
  lock: Lock | null;
  field?: FieldWeek | null;
  settled?: Settlement | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* THE HONEST TEST OF "HAS ANYBODY PLAYED" IS THE FIELD'S BEST SCORE.
     `score_week` stamps `scored_at` and writes `total_points = 0` whether or
     not a ball has been thrown, so keying off that put a confident FINAL on a
     week that had not started. */
  const played = field != null && field.high > 0;

  if (settled && settled.result !== null) {
    const word = settled.result === 'W' ? 'WON' : settled.result === 'L' ? 'LOST' : 'TIE';
    const tint =
      settled.result === 'W' ? c.positive : settled.result === 'L' ? c.negative : c.textSecondary;
    return <StatusWord text={word} color={tint} />;
  }
  if (played && field.final) return <StatusWord text="FINAL" color={c.textSecondary} />;
  if (played) return <StatusWord text="LIVE" color={c.live} />;
  if (lock !== null && !lock.locked && lock.at !== null) {
    return (
      <StatusWord
        text={countdownLabel(new Date(lock.at).getTime() - lock.now).toUpperCase()}
        color={c.textSecondary}
        numeric
      />
    );
  }
  if (lock?.locked) return <StatusWord text="LOCKED" color={c.textTertiary} />;
  return null;
}

/**
 * The head's right-hand slot, as one word in the colour that word means.
 *
 * EXPORTED BECAUSE THE LOBBY HAS ITS OWN WORD TO SAY. A caller that overrides
 * the status with a chip is drawing a second kind of object in a corner sized
 * for a word; a caller that has a fact rather than a state — "40 COINS SHORT" —
 * should say it in the same voice the card says LIVE and LOCKED in.
 */
export function StatusWord({
  text,
  color,
  numeric = false,
}: {
  text: string;
  color: string;
  numeric?: boolean;
}) {
  return (
    <Text numberOfLines={1} style={[Type.micro, numeric && NUMERIC, { color }]}>
      {text}
    </Text>
  );
}

/* ================================================================== score */

/**
 * THE ONLY BAND ABOUT SCORING: your total, the total you have to beat, and one
 * scale carrying both.
 *
 * ---------------------------------------------------------------------------
 * `TO BEAT` IS A CONSTANT AND THE FORMAT IS A CHIP
 * ---------------------------------------------------------------------------
 *
 * The right-hand column used to be named after where its number came from —
 * `COMMUNITY`, `THE CUT · 3RD`, a handle. Three different words for one idea,
 * and not one of them said "beat this". The win condition is the same sentence
 * in every format: there is a number, and you have to be above it. So the label
 * is constant and `beatSource` puts the provenance in a chip beside it.
 *
 * ---------------------------------------------------------------------------
 * THE PACE BAR IS THE POINT OF THE WHOLE CARD
 * ---------------------------------------------------------------------------
 *
 * A player should be able to tell whether they are on course without adding up
 * eight players' scores. The rail runs from the field's worst total to its
 * best, the fill ends at yours, and the dashed line is the win condition. Above
 * the dashes is winning, below is losing, and the gap between the pip and the
 * dashes IS the deficit.
 *
 * IT TAKES THREE INPUTS AND KNOWS NOTHING ELSE — a scale, your value, and the
 * line. That is why it is format-agnostic for free: median, cut and an
 * opponent's total are three sources for one mark, and none of them changes the
 * graphic. It is also what retired the `TugBar` a duel used to need.
 */
function Score({
  terms,
  entry,
  settled,
}: {
  terms: ContestTerms;
  entry: Entry | null;
  settled: Settlement | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const field = entry?.field ?? null;
  const played = field !== null && field.high > 0;
  const final = settled !== null || (played && field.final);

  const them = opponentOf(terms, {
    median: field?.median ?? 0,
    cut: entry?.cut ?? null,
    duel: entry?.opponent ?? null,
  });

  /**
   * IS THERE ANYBODY TO PLAY? — which is not the same question as whether the
   * week has started, and conflating them was a real bug.
   *
   * A field of ONE is its own low, median and high, so `opponentOf` dutifully
   * returns your own total and the band drew a tie against yourself. Two
   * entrants is the floor for a middle to be on one side of, and it is the same
   * floor `median_record` enforces. A duel is exempt: it has an opponent rather
   * than a field, and two people is all one ever needs.
   */
  const comparable =
    played && (them.shape === 'duel' || (field !== null && field.entrants >= MIN_ENTRANTS));

  /* RANK IS WITHHELD WHILE THE WHOLE FIELD IS TIED. Before kickoff every lineup
     sits on a stored nought and `rank()` hands EVERYONE first place, so the test
     is whether the field has SPREAD rather than whether it has played. A field
     of one is exempt: its rank is unambiguous. */
  const rank =
    played && field.myRank !== null && (field.entrants === 1 || field.high > field.low)
      ? field.myRank
      : null;

  const beat = comparable ? them.value : null;
  const margin =
    entry !== null && entry.myPoints !== null && beat !== null ? entry.myPoints - beat : null;

  /* 0.0 ONCE THERE IS AN ENTRY, a dash where there is not. The difference is
     real: an entered week has a total that happens to be nought, and a contest
     you are not in has no total at all. The line to beat stays a dash until
     there is a field to derive it from — the median of an unplayed field is a
     stored nought, not a threshold. */
  const mine = entry === null ? DASH : played ? fmt(entry.myPoints) : (0).toFixed(1);
  const theirs = beat === null ? DASH : fmt(beat);

  /* A NOUGHT NOBODY HAS EARNED IS NOT LIT LIKE A SCORE, and a settled total is
     lit brighter than a running one — a result has stopped moving, which is
     exactly what makes it worth reading. */
  const totalTint = !played ? c.textTertiary : final ? c.text : c.textSecondary;

  const beating = entry?.myPoints != null && beat !== null && entry.myPoints >= beat;

  /**
   * THE FILL IS NEUTRAL WHILE THE WEEK IS LIVE, AND RED ONLY ONCE IT IS OVER.
   *
   * Green while you are past the line is honest — you are clearing it right
   * now. Red while you are behind is not the same claim, because being behind
   * at eleven on a Sunday with four players yet to take a snap means nothing at
   * all, and the app already uses that red for a heart you have LOST. A card
   * that looks like a defeat on Sunday morning and then wins is a card that
   * cried wolf. Once it is final, red is simply true.
   */
  const fillTint = beating ? c.positive : final ? c.negative : c.textSecondary;

  /**
   * THE SCALE'S FLOOR IS NOT ALWAYS THE FIELD'S WORST SCORE.
   *
   * On a real field, running the rail from the worst total to the best is what
   * gives it resolution: twenty-four scores spread across the whole width, and
   * the line to beat somewhere in the middle of them.
   *
   * ON A FIELD OF TWO IT IS DEGENERATE, and that is not an edge case — it is
   * every head-to-head contest. The low IS the loser's total and the high IS
   * the winner's, so the leader always fills the rail completely, the trailer
   * always fills none of it, and the mark always sits on one end or the other.
   * The bar would say "you are winning" or "you are losing" and nothing about
   * by how much, which is the one question it exists to answer. This is what
   * `TugBar` used to be for.
   *
   * Anchoring at nought instead makes the rail a share of the leader's own
   * total, which is the only unit that means anything without a field to
   * normalise against: ten points clear of forty is a long gap and ten clear of
   * two hundred is a short one.
   *
   * A field where everybody has the same score has no width at all; dividing by
   * it would put every mark at NaN%.
   */
  const floor = field === null || field.entrants <= 2 ? 0 : field.low;
  const span = field === null ? 0 : field.high - floor;
  const at = (v: number) =>
    field === null || span <= 0 ? 0 : Math.min(1, Math.max(0, (v - floor) / span)) * 100;

  /* A FINISHED WEEK HAS NOTHING LEFT TO PROJECT. The row keeps its height —
     see ABSENCE RESERVES ITS ROW — and says what it now is instead. */
  const projMine = final ? 'FINAL' : `PROJ ${fmt(entry?.projected)}`;
  const projBeat = final ? 'FINAL' : `PROJ ${fmt(entry?.projectedBeat)}`;

  const pipAt =
    entry?.myPoints == null ? 0 : Math.min(PIP_MAX, Math.max(PIP_MIN, at(entry.myPoints)));
  /* THE DASHES ARE CLAMPED TOO, AND BY LESS. The pip is a 14pt disc and has to
     stay clear of the rail's rounded ends; the mark is 2pt wide and only has to
     stay ON the rail. Two points either side is under half a percent of a
     phone's card width, so the line is still drawn where it is — but it is the
     difference between a visible threshold and a sliver clipped by the radius
     when the leader IS the line, which is every duel. */
  const markAt = beat === null ? 0 : Math.min(MARK_MAX, Math.max(MARK_MIN, at(beat)));

  return (
    <View style={[styles.zone, styles.score, { backgroundColor: c.surface }]}>
      <View style={styles.cmp}>
        <Side
          label="YOU"
          badge={rank === null ? null : ordinalOf(rank)}
          badgeStrong
          value={mine}
          tint={totalTint}
          proj={projMine}
        />
        <View style={styles.vs}>
          <Text numberOfLines={1} style={[Type.micro, styles.vsText, { color: c.textTertiary }]}>
            VS
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.margin,
              NUMERIC,
              styles.vsText,
              { color: margin === null ? c.textTertiary : margin >= 0 ? c.positive : c.negative },
            ]}>
            {margin === null ? DASH : `${margin >= 0 ? '+' : '−'}${Math.abs(margin).toFixed(1)}`}
          </Text>
        </View>
        <Side
          align="right"
          label="TO BEAT"
          badge={beatSource(terms, entry?.opponent)}
          value={theirs}
          tint={beat === null ? c.textTertiary : totalTint}
          proj={projBeat}
        />
      </View>

      <View style={styles.slot}>
        <View style={[styles.bar, { backgroundColor: c.backgroundSelected }]}>
          {entry?.myPoints != null && comparable ? (
            <View
              style={[styles.fill, { width: `${at(entry.myPoints)}%`, backgroundColor: fillTint }]}
            />
          ) : null}
        </View>
        {beat === null ? null : <Dashes left={`${markAt}%`} color={c.text} />}
        {rank === null || !comparable || entry?.myPoints == null ? null : (
          <View
            style={[styles.pip, { left: `${pipAt}%`, backgroundColor: final ? fillTint : c.text }]}>
            <Text numberOfLines={1} style={[styles.pipText, NUMERIC, { color: c.background }]}>
              {rank}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'TH';
  switch (n % 10) {
    case 1:
      return 'ST';
    case 2:
      return 'ND';
    case 3:
      return 'RD';
    default:
      return 'TH';
  }
}

/**
 * The rank chip's text.
 *
 * IT DROPPED `OF 24`, and that is not compression for its own sake — the head
 * states the pool size six points above, as `Full · 24 entries`. Saying it
 * twice on one card cost the chip enough width to unbalance the two sides of
 * the comparison.
 */
function ordinalOf(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}

/**
 * One side of the comparison: who, what they have, and what they are heading
 * for.
 *
 * BOTH SIDES ARE DRAWN BY THIS, at one size, which is the band's whole
 * argument. The number you have to beat is not a footnote on your own score; it
 * is the other half of one comparison.
 */
function Side({
  label,
  badge,
  badgeStrong = false,
  value,
  tint,
  proj,
  align = 'left',
}: {
  label: string;
  badge: string | null;
  badgeStrong?: boolean;
  value: string;
  tint: string;
  proj: string;
  align?: 'left' | 'right';
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const right = align === 'right';

  return (
    <View style={[styles.side, right && styles.sideRight]}>
      {/* LABELS OUTBOARD, CHIPS INBOARD. The two labels sit at the card's outer
          edges and the two chips flank the `VS`, so the row reads outward from
          the middle and the two chips can be compared without crossing a label. */}
      <View style={[styles.sideHead, right && styles.rowReverse]}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {label}
        </Text>
        {badge === null ? null : <Badge text={badge} strong={badgeStrong} />}
      </View>
      <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: tint }]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={[styles.proj, NUMERIC, { color: c.textTertiary }]}>
        {proj}
      </Text>
    </View>
  );
}

/* =================================================================== foot */

/**
 * THE TRADE: what you put up on the left, what you take on the right, and a
 * solid rule between them.
 *
 * ---------------------------------------------------------------------------
 * ONE ROW, BECAUSE TOKENS ARE FOUR CHARACTERS AND SENTENCES WERE SEVENTEEN
 * ---------------------------------------------------------------------------
 *
 * The band this replaces was two columns, each reserving two blank rows so the
 * card's height could not move. It reserved them because "Up to 120 coins · ♥ +1
 * heart" does not fit in half a card's width — and it fits easily as `◆120 ♥+1`
 * alongside a third token, on one line. See `Token` in `contest-model`.
 *
 * BOTH LABELS LEAD THEIR OWN SIDE, so each half reads left to right in the same
 * order: what it is, then what it costs. An earlier pass put the labels at the
 * outer edges with the tokens inboard, which read outward from the rule and
 * made the right-hand side read backwards.
 *
 * THE LABELS ARE CONSTANT. `RISK` and `WIN` while the offer stands, `STAKED`
 * and `WON` once it is settled. The modality that used to live here — `UP TO`,
 * `SHARE`, `EARNS`, `PER PT` — is gone, which costs the "up to" on a capped top
 * prize. That is a real loss and it is noted at `winTokens`.
 *
 * THE RULE IS SOLID. The dashed line means one thing on this card and it is on
 * the bar above — see the separator vocabulary in the header.
 */
function Foot({
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

  return (
    <View style={[styles.zone, styles.foot, { backgroundColor: c.backgroundElement }]}>
      <TokenRow
        label={settled ? 'STAKED' : 'RISK'}
        tokens={settled ? stakedTokens(terms, settled) : riskTokens(terms)}
        side="risk"
      />
      <Rule tall />
      <TokenRow
        label={winLabel(terms, settled !== null)}
        tokens={settled ? wonTokens(terms, settled, prize) : winTokens(terms, prize)}
        side="win"
      />
    </View>
  );
}

/**
 * One half of the trade: a label, then its tokens.
 *
 * THE UNIT WORD IS ELASTIC. A side carrying one token has room to print it —
 * `♥ 1 heart`, `◆ 1.5 a point` — and a side carrying two or three does not, so
 * it drops to bare numbers. The free contest is one token a side, and it is
 * both the contest every new player meets first and the one with the most room,
 * so the card teaches its glyphs in words before it asks anybody to read them
 * cold. See `Token`.
 *
 * THE GLYPHS CARRY THE HUE, NOT THE NUMBERS. A green `120` reads as coins you
 * already hold; a green coin beside a white `120` reads as a promise denominated
 * in coins, which is what it is. On the risk side the heart is `negative`
 * because losing one is the actual damage, while a fee is `textSecondary` —
 * full red on a 40-coin entry price reads as an error.
 */
function TokenRow({
  label,
  tokens,
  side,
}: {
  label: string;
  tokens: Token[];
  side: 'risk' | 'win';
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  /* One token has room for its unit spelled out; a crowded side does not — see
     `Token`. `keepUnit` is the exception, and it exists for rates alone: a bare
     `◆ 1.5` reads as a coin and a half rather than as a rate. */
  const withUnits = tokens.length === 1;

  return (
    <View style={styles.half}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <View style={styles.tokens}>
        {tokens.map((t) => (
          <View key={`${t.kind}-${t.value}`} style={styles.token}>
            <Mark token={t} side={side} />
            <Text
              numberOfLines={1}
              style={[
                Type.fine,
                styles.tokenText,
                {
                  color:
                    t.tone === 'positive'
                      ? c.positive
                      : t.tone === 'negative'
                        ? c.negative
                        : t.kind === 'none'
                          ? c.textTertiary
                          : c.text,
                },
              ]}>
              {(withUnits || t.keepUnit) && t.unit ? `${t.value} ${t.unit}` : t.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One currency's mark. `none` draws nothing — it is a word, not a quantity. */
function Mark({ token, side }: { token: Token; side: 'risk' | 'win' }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tint = side === 'win' ? c.positive : c.textSecondary;

  if (token.kind === 'heart') {
    /* A HEART THAT WAS TAKEN IS DRAWN AS TAKEN. `Hearts` already owns the two
       shapes — whole and torn — that tell those apart on the rack under the
       carousel. Drawing a lost heart whole here would be the one place in the
       app where the glyph and the word beside it disagree. */
    return (
      <Heart
        size={11}
        state={token.killed ? 'killed' : 'free'}
        color={token.killed ? undefined : side === 'win' ? c.positive : c.negative}
      />
    );
  }
  if (token.kind === 'coin') return <Icon glyph={coin} color={tint} size={11} focused />;
  if (token.kind === 'pack') return <Icon glyph={packStandard} color={tint} size={11} focused />;
  return null;
}

/* =================================================================== card */

/**
 * The frame. Head, scoring, trade — always all three, always the same height.
 *
 * ---------------------------------------------------------------------------
 * THE SURFACES, AND WHY `level` IS GONE
 * ---------------------------------------------------------------------------
 *
 * This card used to take a `level` prop, because it drew as one flat fill and
 * that fill had to be chosen against whatever it was placed on: `surfaceSheet`
 * on the board, `surface` inside a sheet, so the ramp kept stacking either way.
 *
 * It does not draw as one fill any more. The head and foot are
 * `backgroundElement` and the middle is `surface`, which is a ramp that works
 * on both grounds without being told which one it is on:
 *
 *     on the page    #080808 → #212121 head/foot → #171717 well
 *     on a sheet     #101010 → #212121 head/foot → #171717 well
 *
 * Every step is positive from either ground, which is the property that made
 * `level` unnecessary: the well is still 15 points above the page and 7 above a
 * sheet, so the middle never sinks INTO whatever the card is lying on.
 *
 * It also fixes a real inversion. On the lineup board the hearts tray under the
 * carousel is `surface`, and the card was `surfaceSheet` — one step DARKER — so
 * the accessory was brighter than the object it serves. The card is the top of
 * the stack on that screen now, and the tray was not touched to get there.
 */
export function ContestCard({
  name,
  terms,
  lock = null,
  status,
  period,
  entry = null,
  prize = null,
  scoring = true,
  settled = null,
  onPress,
}: {
  name: string;
  terms: ContestTerms;
  /** The week's deadline, drawn at the head's right end. */
  lock?: Lock | null;
  /**
   * Overrides the card's own status word. `null` says the corner is EMPTY.
   *
   * Three values, and the difference between two of them is load-bearing.
   * `undefined` is "you decide", and the card draws its own `StatusMark` — the
   * countdown, LIVE, LOCKED, the outcome. A node replaces that. `null` says
   * there is nothing to report and takes the divider with it, which is what the
   * lobby passes on a contest you can afford: the whole card is the button, so
   * a word saying ENTER was labelling the door with the word "door".
   *
   * The head reserves exactly 20pt for whatever lands here, so a caller's node
   * has to be a word or a chip, not a stack.
   */
  status?: React.ReactNode;
  /**
   * Replaces the win condition in the head, once it has been answered.
   *
   * A settled card does not need to be told how it is won, and the carousel
   * needs somewhere to say WHICH week it is: lobby contests are named after
   * their format, so once last week's entries stayed on the board it could hold
   * two cards both titled "Flex Three", and swiping between them was genuinely
   * confusing. This is that slot, and it costs nothing on a live card.
   */
  period?: string;
  /** Your entry, or null in the lobby. */
  entry?: Entry | null;
  /** What you were paid out of the pool, once the week is settled. */
  prize?: number | null;
  /**
   * Draw the scoring band. False in the lobby, where there is no score.
   *
   * A PROPERTY OF THE SURFACE, NOT OF THE DATA — see the header. Every card in
   * a list must pass the same value, or the list changes height as entries and
   * scores arrive.
   */
  scoring?: boolean;
  /**
   * THE WEEK IS OVER AND THIS IS WHAT IT DID. Null while it is still an offer.
   *
   * It turns the foot's tense over — `STAKED` and `WON` in place of `RISK` and
   * `WIN` — and it is what the status word reads its outcome from.
   */
  settled?: Settlement | null;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const body = (
    <>
      <Head
        name={name}
        terms={terms}
        period={period}
        duel={entry?.opponent}
        /* `??` would have swallowed the empty corner: a caller passing null
           means it, and only an absent prop asks the card to decide. */
        right={
          status !== undefined ? (
            status
          ) : (
            <StatusMark lock={lock} field={entry?.field ?? null} settled={settled} />
          )
        }
      />
      {scoring ? <Score terms={terms} entry={entry} settled={settled} /> : null}
      <Foot terms={terms} prize={prize} settled={settled} />
    </>
  );

  /**
   * THE EDGE, on both branches.
   *
   * ONE COLOUR ON ALL FOUR SIDES, and that is a constraint rather than a
   * preference. A brighter top edge is the standard way to make a dark panel
   * look lit from above, it was tried, and iOS draws a mixed-colour border by
   * hand and mitres it across the corners — which is what made them look
   * chewed. `Colors.dark.borderRaised` has the whole account.
   */
  const edge = {
    borderColor: c.borderRaised,
    /**
     * THE CARD'S OWN FILL, under three zones that already paint their own.
     *
     * It is not redundant, and the corners are why. `overflow: 'hidden'` clips
     * the zones to the rounded outline, and a clip is antialiased — so along
     * each corner's curve the fill fades out over about a pixel while the
     * border is drawn at full strength on top of it. Between the two there was
     * a hair of TRANSPARENCY, and what showed through it was the page: four
     * corners with a dark bite taken out of the material just inside the line.
     * Barely visible at rest, and obvious the moment the card moved.
     *
     * One opaque fill behind the whole card and there is nothing to show
     * through. It is `backgroundElement` because that is what the head and foot
     * are — the corners belong to them — so nothing changes anywhere else.
     */
    backgroundColor: c.backgroundElement,
  };

  if (!onPress) {
    return <View style={[styles.card, edge]}>{body}</View>;
  }

  /* `Pressable` around the whole card rather than a control on it. The card is
     a dense thing and any button placed inside would be competing with the
     terms for a corner that is already saying something. */
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, edge, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * THE FILL IS SET WHERE THIS IS RENDERED, not here, because it is the same
   * colour as two of the three zones and belongs next to them. What lives here
   * is the geometry: every zone still paints its own fill, and the card is a
   * border and a clip — which is what lets the middle read as a WELL rather
   * than as a panel with a stripe on it.
   *
   * ---------------------------------------------------------------------------
   * A WHOLE POINT, NOT A HAIRLINE, AND IT IS NOT ONLY A TASTE CALL
   * ---------------------------------------------------------------------------
   *
   * `StyleSheet.hairlineWidth` is one PHYSICAL pixel — a third of a point on a
   * 3x phone. That is the right width for a divider between two rows, which is
   * a line you are meant to stop noticing. It is the wrong width for the one
   * line that states the shape of the card.
   *
   * It also could not survive the carousel. Pages recede as they leave (see
   * `ContestCarousel.Page`), and a 0.33pt border under a 0.94 scale lands at
   * 0.31 — sub-pixel, so it flickers in and out along the edge as the card
   * moves. That was reported as the border "glitching" on a swipe, and it is
   * the same defect as it being too faint: there was not enough line there to
   * draw. A whole point scales to 0.94pt, which is three physical pixels on a
   * 3x screen and two on a 2x — enough for the compositor to antialias rather
   * than to guess.
   */
  card: { borderWidth: 1, borderRadius: Radius.panel, overflow: 'hidden' },
  pressed: { opacity: 0.7 },

  /* EVERY ZONE, ONE GEOMETRY. The gutter is `Spacing.three`, which is the lineup
     rows' own and the section headings' own: a card whose left edge is two
     points inside the board it heads reads as a mistake. */
  zone: {
    paddingHorizontal: Spacing.three,
    paddingVertical: ZONE_PAD,
    justifyContent: 'center',
  },

  head: { height: HEAD_H },
  /* Fixed at the name's own line height, so a `StatusChip` (17pt) and a status
     word (12pt) both land on the name's line without moving the zone. */
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: Type.section.lineHeight,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, minWidth: 0 },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    minWidth: 0,
    flexShrink: 1,
  },
  /* `minWidth: 0` is what lets a long name truncate instead of shoving the
     objective off the card. */
  headName: { flexShrink: 1, minWidth: 0 },
  /* The one string on this row that never gives. See the give-order note. */
  headHold: { flexShrink: 0 },
  headGive: { flexShrink: 1, minWidth: 0 },
  status: { flexShrink: 0 },

  /* A hairline between two fields. The tall variant stretches the foot's full
     content box rather than declaring a height of its own. */
  rule: { width: StyleSheet.hairlineWidth, height: 10, flexShrink: 0 },
  ruleTall: { height: undefined, alignSelf: 'stretch', marginHorizontal: Spacing.two + 2 },

  badge: {
    height: 13,
    borderRadius: 4,
    paddingHorizontal: Spacing.one,
    justifyContent: 'center',
    flexShrink: 0,
    maxWidth: 88,
  },
  badgeText: { fontSize: 8, lineHeight: 11, fontWeight: '700', letterSpacing: 0.4 },

  score: { height: SCORE_H, gap: Spacing.two },
  cmp: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, minWidth: 0, gap: 2 },
  sideRight: { alignItems: 'flex-end' },
  sideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    height: Type.micro.lineHeight,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  figure: {
    fontSize: FIGURE_SIZE,
    lineHeight: FIGURE_LINE,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  /* Smaller than `micro`, and off the type scale on purpose: it is a second,
     softer claim about the same team, and at 9pt it read as a peer of the label
     above the total rather than as a footnote under it. */
  proj: { fontSize: 8, lineHeight: 11, fontWeight: '700', letterSpacing: 0.6 },

  /* A FIXED COLUMN, so `VS` and the margin share one centre line whatever the
     sign and however many digits. At `auto` the margin's leading − dragged it
     visibly off centre. */
  vs: { width: VS_W, flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  vsText: { width: '100%', textAlign: 'center' },
  margin: { fontSize: 11, lineHeight: 14, fontWeight: '700' },

  slot: { height: SLOT_H, justifyContent: 'center' },
  /* `overflow: hidden` so the fill's square end is clipped to the rail's radius
     rather than poking out of it at 100%. */
  bar: { height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },

  /* Centred on its value rather than starting at it: a 2pt line drawn FROM the
     mark's position sits entirely to the right of it, which at the top of the
     range would read as a threshold nobody could reach. */
  mark: {
    position: 'absolute',
    width: 2,
    height: MARK_H,
    marginLeft: -1,
    top: (SLOT_H - MARK_H) / 2,
    justifyContent: 'space-between',
  },
  markSeg: { height: 4, borderRadius: 1 },

  pip: {
    position: 'absolute',
    width: PIP,
    height: PIP,
    borderRadius: PIP / 2,
    marginLeft: -PIP / 2,
    top: (SLOT_H - PIP) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipText: { fontSize: 9, lineHeight: 11, fontWeight: '800' },

  foot: { height: FOOT_H, flexDirection: 'row', alignItems: 'stretch' },
  half: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: Type.fine.lineHeight,
  },
  /* The gap BETWEEN tokens is four times the gap inside one. Below about three
     to one the eye stops reading them as pairs and sees a single run of glyphs
     and digits. */
  tokens: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three - 4, minWidth: 0 },
  token: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  tokenText: { flexShrink: 1, minWidth: 0 },
});
