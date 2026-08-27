/**
 * A contest. One card, drawn identically wherever it appears.
 *
 * ---------------------------------------------------------------------------
 * ENTERING INSERTS A MIDDLE. IT DOES NOT DRAW A DIFFERENT CARD.
 * ---------------------------------------------------------------------------
 *
 * There used to be two of these — a dense distribution card over the lineup
 * board and a plain text row in the lobby — and unifying them once was not
 * enough, because the first attempt kept two arrangements of the same facts and
 * only shared the vocabulary between them. The lobby card led with the
 * contest's name and its terms; the board card led with a week label and a
 * score and pushed the terms into a one-line rail. Same contest, two layouts,
 * and the moment a player most needs to recognise what they just joined was
 * still the moment it changed shape.
 *
 * So the card is ONE STACK and entering adds a band to the middle of it:
 *
 *     ┌────────────────────────────────────┐
 *     │ name                     1d 19h    │   HEAD    — always
 *     │ format · slots · seats  NEXT LOCK  │
 *     ├────────────────────────────────────┤
 *     │ ▬▬▬▬▬▬▬░                           │   MIDDLE  — only once entered
 *     │ handle · record      1 SLOT TO FILL│
 *     ├────────────────────────────────────┤
 *     │ how it is won                      │   TRADE   — always
 *     │ what you put up  →  what you take  │
 *     └────────────────────────────────────┘
 *
 * Nothing above or below the middle moves when it appears. That is the whole
 * design and the reason the middle and the head's right column arrive as NODES
 * rather than as variant flags: a variant invites the bands to acquire
 * per-variant conditions and drift apart, which is exactly what happened the
 * first time these two surfaces were unified.
 *
 * THERE WAS A FOURTH BAND — the run's heart rack, under the trade. It is a row
 * beneath the whole carousel now (`RunRail`), because a run is not a property
 * of a contest: sliding it off the screen with the card said it was.
 *
 * ---------------------------------------------------------------------------
 * THE 2026-08-26 REWORK: FIVE BANDS OF EQUAL WEIGHT, THREE OF THEM AGREEING
 * ---------------------------------------------------------------------------
 *
 * The card above worked, and then it was looked at rather than read. It stood
 * roughly 230pt tall on a phone — three and a half lineup rows — to carry seven
 * facts, three of which were the same fact. Everything wrong with it was one
 * thing repeated: no rank, and no floor on the air between bands.
 *
 * 1. THE WIN CONDITION WAS THE STRING CHOSEN TO TRUNCATE. The head's second
 *    line carried "Full Roster · 8 cards · Beat the median" beside a seat
 *    count, under a title row that also held a countdown. Before lock — five
 *    days of every seven — there was not room, and what fell off the end was
 *    how the contest is WON. It leads the trade band now, at full width, where
 *    it is the term every figure in the reward column is conditional on.
 *
 * 2. THE HERO WAS A DUPLICATE. Before kickoff the biggest thing on the card was
 *    `7/8` at 22pt in warning gold — the same fact as the slot meter eight
 *    points below it, and the same fact again as the "Starting lineup · 7/8
 *    filled" heading under the card. Meanwhile the COUNTDOWN, the one figure on
 *    the card that is both moving and actionable, sat at 13pt in a corner while
 *    squeezing the line above. `Figure` ranks the slot by usefulness now.
 *
 * 3. THE STAKE WAS PRINTED TWICE, as a heart beside the name and again as
 *    `RISK ♥ 1 heart` thirty points below. The head keeps the identity, the
 *    trade keeps the terms.
 *
 * 4. AND IT WAS BULKY. Five bands, each with its own vertical padding, its own
 *    micro label and its own internal gaps. The fix is not smaller type — the
 *    scale was already right — it is fewer rows carrying more per row, at the
 *    metrics the lineup rows underneath already use: a 16pt gutter, 2pt between
 *    lines of one block, and a figure over a 9pt qualifier rather than a figure
 *    over a reserved blank. Four things went:
 *
 *      the avatar     a 26pt circle of your own initials, on a card that can
 *                     only ever be about you, driving the height of the whole
 *                     middle band. The lineup rows below carry no avatar
 *                     either; dropping it makes this MORE like the table it
 *                     is the top of, not less.
 *      LOWEST/HIGHEST two labels naming the two ends of a bar, which is what
 *                     the two ends of a bar already say. The row they were on
 *                     now carries the handle and the mark — both facts.
 *      RISK/REWARD    two micro labels over two columns that an arrow between
 *                     them says in one glyph and no line at all.
 *      the state chip on the board only. `Final` and `Locked` are already on
 *                     the masthead above, in the week's own context line, and
 *                     the figure's qualifier says which of them applies.
 *
 *    ~230pt to ~160pt, with one more fact on it than before.
 *
 * ---------------------------------------------------------------------------
 * THE MIDDLE: THE FIELD IS NOT A PERSON
 * ---------------------------------------------------------------------------
 *
 * The first version of the middle was a head-to-head: two avatars, two scores,
 * a margin between them. It was wrong, and wrong in a way that only showed once
 * it was drawn — a circle and a name opposite your own reads as another
 * manager, and this game deliberately has none. There are no pairings, no
 * schedule and no opponent to draw; there is a base of managers, and you are
 * somewhere in it. So the community is a DISTRIBUTION: the bar runs from the
 * field's worst score to its best, the line you are judged against is a mark on
 * it, and your own total is the fill.
 *
 * `duel` is deliberately absent rather than stubbed. When a head-to-head format
 * exists its opponent will be a real person with a real lineup, and this card
 * will grow a case for it. Until then there is nobody to draw, and a slot
 * reserved for an avatar is how the first version got built.
 *
 * ---------------------------------------------------------------------------
 * THE MARK IS NOT ALWAYS THE MEDIAN, AND THAT WAS A REAL BUG
 * ---------------------------------------------------------------------------
 *
 * This card drew the median on every contest and labelled it MEDIAN, including
 * on a `top_n` contest where the median decides nothing. A player in the WR
 * Room could sit comfortably above the middle of a field that pays three, read
 * the bar as winning, and be sixth. `markOf` decides it now, from the contest's
 * own win condition: the median where the median is the rule, the CUT — the
 * lowest score still inside the paying places — where it is not.
 *
 * ---------------------------------------------------------------------------
 * AN EMPTY STATE IS NOT THE FULL STATE WITH THE NUMBERS PUNCHED OUT
 * ---------------------------------------------------------------------------
 *
 * Before kickoff there is no score, and the card used to draw one anyway: a
 * dash at hero size, `PROJ —` under it, and an empty rail with three axis
 * labels beneath that — about sixty per cent reserved space, in the state most
 * people meet FIRST. The middle asks a different question until there is a
 * score: not "how am I doing", which has no answer yet, but "is my lineup ready
 * and when does it lock", which is the only thing still in the reader's hands.
 *
 * NO PROJECTION, NO WIN PROBABILITY. The provider sells no projections and we
 * will not invent one. Nothing here is modelled; every figure has happened.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Heart } from '@/components/runs/Hearts';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { FieldWeek } from '@/components/lineup/field';
import { MIN_ENTRANTS } from '@/components/lineup/field';
import { countdownLabel } from '@/components/lineup/model';
import {
  formatLine,
  markOf,
  rewardLines,
  riskLines,
  seatsLine,
  winLine,
  type ContestTerms,
  type TradeLine,
} from './contest-model';

/** Dash rather than a nought: no number yet is not the same as no points. */
const DASH = '—';

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : n.toFixed(1);

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

/* ==================================================================== zones */

/**
 * WHO this contest is, and the one number that matters right now.
 *
 * Two lines on the left reading down from most to least fixed — the name, then
 * what it asks of your roster and how full it is — with the figure squared off
 * against them on the right. That is the lineup row's own shape one rank up,
 * and it is deliberate: this card is the top row of the table underneath it, so
 * it should be built the way those rows are.
 *
 * NEITHER LINE CAN CLIP NOW. With `NEXT LOCK 1d 19h` set inline in this corner
 * the head had about two thirds of the card for two lines of text, and line two
 * carried three facts — so it truncated on every entered card before lock. The
 * countdown is stacked over its own label in the figure column now, which is
 * both larger and narrower, and the third fact has moved to the trade band.
 */
function Head({
  name,
  terms,
  state,
}: {
  name: string;
  terms: ContestTerms;
  /** The head's right column: a figure on the board, a chip in the lobby. */
  state: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const seats = seatsLine(terms);
  const sub = [formatLine(terms, name), seats].filter(Boolean).join(' · ');

  return (
    <View style={[styles.band, styles.head, { borderColor: c.border }]}>
      <View style={styles.headText}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {name}
        </Text>
        {/* ONE STRING, NOT TWO ENDS OF A JUSTIFIED ROW. The seat count used to
            be pushed to the right edge of this line, which put it under the
            figure and read as a caption to it. Joined to the format it is what
            it is: a third clause about what the contest is. */}
        <Text numberOfLines={1} style={[Type.fine, { color: c.textSecondary }]}>
          {sub}
        </Text>
      </View>
      {state}
    </View>
  );
}

/**
 * The one big number — and which fact deserves to be it changes with the week.
 *
 * ---------------------------------------------------------------------------
 * THE HERO WAS A DUPLICATE OF A DUPLICATE
 * ---------------------------------------------------------------------------
 *
 * Before kickoff this drew `7/8` at 22pt in warning gold. That is the same fact
 * as the slot meter below it, and the same fact a third time as the "Starting
 * lineup · 7/8 filled" heading over the board under the card. It was the
 * loudest thing on the screen and it was the thing the screen said most often —
 * louder than 118.4, which is the number the card exists for.
 *
 * Meanwhile the countdown sat at 13pt in the corner of the head. Of everything
 * the card knows before kickoff, the countdown is the only figure that is both
 * MOVING and ACTIONABLE: it is the deadline the whole board is working
 * against, and nothing else on the screen carries it.
 *
 * So the slot is ranked by usefulness rather than by fallback, and the order is
 * the order the week happens in:
 *
 *   score      once anybody in the field has played — the card's real subject
 *   countdown  while the roster can still be changed — the live deadline
 *   filled     once neither is true: locked, unplayed, nothing to count to
 *
 * Same position and the same type scale in all three, so the swap at lock and
 * the swap at kickoff are changes of MEANING rather than changes of layout.
 *
 * THE QUALIFIER UNDER IT IS ALWAYS THE MOST USEFUL ONE AVAILABLE, and it is
 * never blank. It used to be a reserved empty line whenever a field was tied,
 * held open so the card would not change height — a whole row of the card spent
 * on nothing. Ranked instead: your place in the field where there is one, the
 * week's state where there is not.
 *
 * 18pt, down from 22. The lineup rows below set a player's week at 15; a team
 * total is one step up, not two, and at 22 the card's least interesting state
 * was shouting over its most interesting one.
 *
 * `PROJ —` IS GONE FROM THE CARD. The provider sells no projections and never
 * will, so that slot was a permanent dash directly under the largest number on
 * the screen. In the lineup ROWS the column still earns its place — it is one
 * reserved cell across eight rows and it keeps them aligned — but here it was a
 * single dead line in the one spot the card had to say something true.
 */
export function Figure({
  score,
  filled,
  slots,
  rank,
  entrants,
  lock,
  final = false,
}: {
  /** The week's total, or null before anybody has played. */
  score: string | null;
  filled: number;
  slots: number;
  /** Null while the whole field is tied and a rank would be meaningless. */
  rank: number | null;
  entrants: number;
  /** The deadline, while there is still one to count to. */
  lock: Lock | null;
  final?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (score !== null) {
    return (
      <Stat
        value={score}
        label={rank !== null ? `#${rank} OF ${entrants}` : final ? 'FINAL' : 'LIVE'}
        numericLabel={rank !== null}
      />
    );
  }

  /* THE COUNTDOWN RUNS TO THE NEXT PLAYER'S KICKOFF, not to the week's first.
     Players lock one at a time now, so this is a deadline that arrives several
     times and shortens the bench each time rather than ending the week — which
     is why the label is NEXT LOCK and not simply LOCKS. */
  if (lock !== null && !lock.locked && lock.at !== null) {
    return (
      <Stat value={countdownLabel(new Date(lock.at).getTime() - lock.now)} label="NEXT LOCK" />
    );
  }

  /* NO SCORE AND NO DEADLINE. Usually that means locked and not yet kicked
     off, so the count is the only thing the slot can hold — and here it has
     earned the size, because a lineup short at lock is short for good. The
     warning colour is the same one the lobby uses on "5 of 8": one fact about
     one lineup, drawn one way wherever it is noticed.

     The label does not assume the lock, because this branch also catches a
     slate that has not published a kickoff yet. `LOCKED` where it is true, and
     otherwise the same word the count has always carried. */
  const short = filled < slots;
  return (
    <Stat
      value={`${filled}/${slots}`}
      label={lock?.locked ? 'LOCKED' : short ? 'TO FILL' : 'FILLED'}
      tone={short ? c.warning : undefined}
    />
  );
}

/** A figure over its qualifier. The head's right column, in every state. */
function Stat({
  value,
  label,
  tone,
  numericLabel = false,
}: {
  value: string;
  label: string;
  tone?: string;
  numericLabel?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.statCol}>
      <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: tone ?? c.text }]}>
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[Type.micro, numericLabel ? NUMERIC : null, { color: c.textTertiary }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * THE TRADE: what you put up on the left, what you can take on the right, and
 * the condition on all of it across the top.
 *
 * TWO COLUMNS RATHER THAN A SENTENCE, because it is a comparison and a reader
 * is making it. Strung along one line — "40 gems, 1 heart at risk, top 3 win,
 * pool 200" — the two halves interleave and the reader has to sort them before
 * they can weigh them. Side by side, the weighing is the reading.
 *
 * THE ARROW REPLACED TWO LABELS. `RISK` and `REWARD` sat as 9pt headers over
 * the columns and a hairline ran between them, which cost a full line of the
 * card to say what the direction of a trade already says. An arrow in the
 * divider's place says it in one glyph, on the row the values are already on:
 * left is what leaves, right is what arrives. The `+` on a heart gained does
 * the rest.
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
 * ahead of you. Showing three quarters of a live trade is worse than showing a
 * line about money that has moved.
 */
function Trade({ terms, prize }: { terms: ContestTerms; prize: number | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <>
      {/* HOW IT IS WON, LEADING THE BAND AND ON A LINE OF ITS OWN.
 
          It was the tail of the head's format string and it was the half that
          got cut off — see `formatLine`. This is where it belonged all along:
          every figure in the reward column is CONDITIONAL on it, so a reader
          weighing the two columns is already asking the question this sentence
          answers, and reading it here costs no glance of its own.
 
          At `strong`, which makes it the largest text in the band. That is the
          right rank: "Top 3 of 6 win" and "Beat the median" are the same shape
          of sentence describing offers that are nothing alike, and it is the
          one line on the card a reader must not skim. */}
      <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
        {winLine(terms)}
      </Text>
      <View style={styles.trade}>
        <TradeColumn lines={riskLines(terms)} />
        <Text style={[Type.body, styles.arrow, { color: c.textTertiary }]}>→</Text>
        <TradeColumn lines={rewardLines(terms, prize)} align="right" />
      </View>
    </>
  );
}

function TradeColumn({ lines, align = 'left' }: { lines: TradeLine[]; align?: 'left' | 'right' }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.tradeCol, align === 'right' && styles.tradeColRight]}>
      {lines.map((line) => (
        <View key={line.text} style={styles.tradeLine}>
          {line.heart ? <Heart size={10} state="free" color={c.negative} /> : null}
          {/* TWO LINES ALLOWED, NEVER RESERVED. Every line here is two or three
              words except "Gem pool, once entries start" — the state a paid
              contest sits in until somebody enters it — which clipped to "Gem
              pool, once entries s…" and turned a reward column into a shrug.
              The columns are `flex: 1` beside each other and stretch to the
              taller, so a wrap grows the card by a line rather than making the
              two columns argue over width. */}
          <Text
            numberOfLines={2}
            style={[Type.body, { color: line.tone === 'positive' ? c.positive : c.text }]}>
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The rail before there is anything to plot on it: one segment per SLOT.
 *
 * The old ghost rail was twenty identical segments — deliberately meaningless,
 * a shape that said "a scale is coming". That was better than a flat grey bar
 * and still worse than a bar that means something, because it occupied the
 * card's whole width to communicate nothing for four days a week.
 *
 * SAME PIXELS, HONEST PROGRESS. Eight segments for eight slots, solid where a
 * card is filed. It is the same 8pt rail in the same place, so the swap at
 * kickoff is a change of meaning rather than a change of layout — and both
 * meanings are the same question, which is how far along this entry is.
 *
 * THE EMPTY SEGMENT IS A HOLE, NOT A DIMMER FILL, and that is a legibility fix
 * rather than a preference. It was `backgroundElement` — #212225 against a
 * #17191E card, ten steps of grey — so seven filled and one empty looked like
 * eight filled at arm's length, and the meter was useless in exactly the state
 * it exists for. At `background` it is the page's own black: a gap punched in
 * the rail, which is what an unfilled slot IS.
 *
 * That is also why the filled segments stay at `textSecondary` rather than
 * going white. Raising the fill was the other way to open the gap and it made
 * the meter the brightest object on the card — eight solid white bars, in the
 * state where the card has the least to say. Darkening the hole costs nothing
 * anywhere else.
 *
 * The empty segment is NOT drawn in the warning colour, which was a third
 * option. Gold here is within a few steps of `selectionAccent`, so a single
 * gold bar in a row of grey ones reads as the one that is CHOSEN rather than
 * the one that is missing — inverting figure and ground on the only graphic
 * whose whole job is to be counted. The alarm goes in the words beside it.
 */
function SlotMeter({ filled, slots }: { filled: number; slots: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.meter}>
      {Array.from({ length: Math.max(1, slots) }, (_, i) => (
        <View
          key={i}
          style={[
            styles.meterSeg,
            { backgroundColor: i < filled ? c.textSecondary : c.background },
          ]}
        />
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
 * won, which is exactly the divergence this rewrite exists to close.
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

/* ==================================================================== card */

/**
 * The frame. Head, optional middle, trade — in that order, always.
 *
 * The middle arrives as a NODE rather than as a `variant` flag on purpose. A
 * flag invites the head and the trade to acquire per-variant conditions, which
 * is precisely how the lobby and the board drifted into two layouts the first
 * time they were unified.
 *
 * THE RUN IS NO LONGER ONE OF THESE BANDS. It was, briefly — see `RunRail` in
 * `ContestCarousel` for why it left. Short version: the rack is a property of
 * the RUN, and a run does not change when you swipe, so drawing it inside a
 * card that slides off the screen made it look as though it did.
 */
export function ContestCard({
  name,
  terms,
  state,
  middle,
  prize = null,
  level = 'sheet',
  onPress,
}: {
  name: string;
  terms: ContestTerms;
  /**
   * The head's right column. A `StatusChip` in the lobby, where the question is
   * "can I enter this"; a `Figure` on the board, where it is "how am I doing".
   * Both are the same corner answering "what state is this in", which is why
   * they are one slot and not two.
   */
  state: React.ReactNode;
  /** Present exactly when there is an entry to show. */
  middle?: React.ReactNode;
  prize?: number | null;
  /** What this card is sitting on. See `CardLevel`. */
  level?: CardLevel;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const fill = level === 'page' ? c.surfaceSheet : c.surface;

  const body = (
    <>
      <Head name={name} terms={terms} state={state} />
      {middle}
      <View style={styles.band}>
        <Trade terms={terms} prize={prize} />
      </View>
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

/**
 * The band entering inserts: where your week sits, and who it belongs to.
 *
 * TWO ROWS AND NOTHING ELSE — a rail, and one line of meta under it. That is
 * the whole band now; it used to be an avatar, a handle, a record, a 22pt
 * figure, a rail and three axis labels, in a block as tall as two lineup rows.
 *
 * WHAT WENT, AND WHY IT WAS SAFE:
 *
 *   THE AVATAR was a 26pt circle of your own initials on a card that can only
 *   ever be about you — and it was what set the height of the row it was in.
 *   The lineup rows below carry no avatar either, so losing it makes this more
 *   like the table it is the top of, not less.
 *
 *   THE FIGURE moved to the head, where it shares a row with the contest's name
 *   instead of owning one of its own. See `Figure`.
 *
 *   LOWEST AND HIGHEST were two labels naming the two ends of a bar. A bar's
 *   ends are the range; that is what a bar is. The row they occupied carries
 *   the handle and the mark instead — two facts where there were none.
 *
 * WHAT THE META ROW SAYS depends on which rail is above it, and both readings
 * are the same question: how far is this from where it needs to be. Live, it is
 * the line you are judged against and your distance from it. Before kickoff, it
 * is how many slots are still empty.
 */
export function Standing({
  manager,
  subtitle,
  terms,
  myPoints,
  field,
  cut,
  filled,
}: {
  /** Your handle. This band is YOUR entry; the contest is named in the head. */
  manager: string;
  /**
   * The season record, and only on the contest that has a season.
   *
   * A SEASON RECORD IS A PROPERTY OF THE SEASON CONTEST. A lobby contest is a
   * single week that is entered and settled and gone, so "Season 0-0" under it
   * would be inventing a standing for something with no history to stand on —
   * and worse, it would read as the same number the free card is showing.
   */
  subtitle?: string;
  terms: ContestTerms;
  myPoints: number | null;
  field: FieldWeek | null;
  cut: number | null;
  filled: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const live = isLive(field);
  const mark = markOf(terms, { median: field?.median ?? 0, cut });
  const margin = live && myPoints !== null && mark.value !== null ? myPoints - mark.value : null;
  const left = Math.max(0, terms.slotCount - filled);

  return (
    <View style={[styles.band, styles.middle, { borderColor: c.border }]}>
      {live && field !== null ? (
        <ScaleBar low={field.low} high={field.high} mark={mark.value} mine={myPoints} />
      ) : (
        <SlotMeter filled={filled} slots={terms.slotCount} />
      )}
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[Type.fine, styles.metaMain, { color: c.textSecondary }]}>
          {[manager, subtitle].filter(Boolean).join(' · ')}
        </Text>
        {live ? (
          <View style={styles.metaRight}>
            <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
              {mark.value === null ? mark.label : `${mark.label} ${fmt(mark.value)}`}
            </Text>
            {margin === null ? null : (
              <Text
                numberOfLines={1}
                style={[Type.micro, NUMERIC, { color: margin >= 0 ? c.positive : c.negative }]}>
                {margin >= 0 ? '+' : '−'}
                {Math.abs(margin).toFixed(1)}
              </Text>
            )}
          </View>
        ) : (
          /* SAID AS A REMAINDER, NOT AS A RATIO. "1 slot to fill" is a job;
             "7/8" is a score, and a reader who has to subtract before they know
             what to do has been handed arithmetic instead of an instruction.
             The remainder is also the number that shrinks to nothing, which is
             the shape of a thing being finished.

             THE DONE STATE IS QUIET AND STILL PRESENT. Dropping the line when
             the lineup is full would mean the one state you want confirmed is
             the one the card says nothing about, and silence is how a screen
             reads as broken. */
          <Text
            numberOfLines={1}
            style={[Type.micro, { color: left > 0 ? c.warning : c.textTertiary }]}>
            {left > 0 ? `${left} SLOT${left === 1 ? '' : 'S'} TO FILL` : 'LINEUP FILED'}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * IS THERE A DISTRIBUTION TO DRAW? — three conditions, and each one has been a
 * bug on this card at some point.
 *
 * `score_week` stamps `scored_at` and writes `total_points = 0` whether or not
 * a ball has been thrown, so keying off that put a FINAL chip and a confident
 * "0.0" on a week that had not started. The honest test of "has anybody played"
 * is the best score in the FIELD: if nobody has a point, nobody has played.
 *
 * And a field of ONE is its own low, mark and high — no range to place anybody
 * in, whatever they scored.
 */
function isLive(field: FieldWeek | null): boolean {
  return field !== null && field.entrants >= MIN_ENTRANTS && field.high > 0;
}

/**
 * Your score for this contest, and whether it is really a rank — the two
 * questions the head's `Figure` needs answered and cannot answer itself.
 *
 * IT LIVES HERE BECAUSE THE MIDDLE'S RULES DECIDE IT. The score is yours the
 * moment one exists — gated on anybody having PLAYED, not on the field being
 * wide enough to plot — because tying it to the distribution meant a week you
 * had finished and scored 88.2 in showed nothing, on the grounds that you were
 * the only manager in it. Only the COMPARISON needs a field.
 *
 * THE RANK IS ALWAYS WITH THE POOL SIZE, never a bare "#1", and it is withheld
 * entirely when the whole field is tied: before kickoff every lineup sits on a
 * stored nought and `rank()` hands EVERYONE first place. So the test is whether
 * the field has SPREAD — `high > low` — not whether anybody has played. A field
 * of one is exempt: its rank is unambiguous and the `of 1` says exactly what it
 * is worth.
 */
export function figureOf(field: FieldWeek | null, myPoints: number | null) {
  const played = field !== null && field.high > 0;
  const rankIsReal =
    field !== null && field.myRank !== null && (field.entrants === 1 || field.high > field.low);
  return {
    score: played ? fmt(myPoints) : null,
    rank: rankIsReal ? field.myRank : null,
    entrants: field?.entrants ?? 0,
  };
}

/**
 * The trade on its own, for the contest's page.
 *
 * THE SHEET USED TO KNOW LESS ABOUT RISK THAN THE ROW YOU TAPPED. It listed
 * Format, Entry and Entered — no hearts, no win condition, no payout — so the
 * lobby warned you a run was on the line and the page you opened to think it
 * over never mentioned it. That is exactly backwards for the surface where the
 * decision is actually taken.
 */
export function ContestTermsPanel({ terms }: { terms: ContestTerms }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.band, styles.termsHead, { borderColor: c.border }]}>
        <Text numberOfLines={1} style={[Type.fine, { color: c.textSecondary }]}>
          {formatLine(terms)}
        </Text>
      </View>
      <View style={styles.band}>
        <Trade terms={terms} prize={null} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },
  pressed: { opacity: 0.7 },

  /**
   * EVERY BAND, ONE GEOMETRY. The card used to set its padding per band —
   * 12/7 on the head, 12/10 on the middle, 12/9 on the terms — three near-equal
   * numbers that added roughly fifty points of air nobody had chosen.
   *
   * The gutter is `Spacing.three`, which is the lineup rows' own and the
   * section headings' own: a card whose left edge is two points inside the
   * board it heads reads as a mistake. The 2pt gap is the gap BETWEEN LINES OF
   * ONE BLOCK, which is what a band is — the same 2 the lineup row stacks its
   * three lines on.
   */
  band: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two - 1, gap: 2 },

  head: {
    flexDirection: 'row',
    /* TOP, not centre. The head's left is two lines and its right is a figure
       over a label; centring parked them against each other's middles. Aligned
       to the top, the name and the figure sit on one line — which is the line
       they belong to. */
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /* Takes the room the figure does not. `minWidth: 0` is what lets a long name
     truncate instead of shoving the figure off the card. */
  headText: { flex: 1, minWidth: 0, gap: 2 },

  /* Never shrinks: the head's text gives way instead. The width is fixed so
     that a two-character countdown replacing a five-character score does not
     drag the name beside it sideways once a minute in the last hour. */
  statCol: { alignItems: 'flex-end', flexShrink: 0, minWidth: 72 },
  /* 18, against the lineup rows' 15. One step up because this is a team total
     rather than one player's — and it was 22, which is two steps and made the
     card's least interesting state its loudest. */
  figure: { fontSize: 18, lineHeight: 21, fontWeight: '800', letterSpacing: -0.4 },

  middle: { borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.one + 1 },
  /* The handle on the left, the mark or the shortfall on the right. One row,
     baseline-aligned, and the handle truncates before either. */
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  metaMain: { flexShrink: 1, minWidth: 0 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },

  /* Equal halves with the arrow between them. `flex: 1` on both rather than a
     measured split, so a long reward line wraps inside its own column instead
     of pushing the risk column off the card. */
  trade: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tradeCol: { flex: 1, minWidth: 0, gap: 2 },
  tradeColRight: { alignItems: 'flex-end' },
  tradeLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  /* Where the hairline used to be. It is the divider AND the label: it says
     which way the trade runs, which is what RISK and REWARD were spending a
     line of the card to say. */
  arrow: { flexShrink: 0 },

  /* Same 8pt height as the live track, so nothing shifts when the first score
     lands and the meter becomes a distribution. The gap is what keeps it
     reading as COUNTABLE — eight things you have or have not done — rather than
     as a progress bar that happens to be segmented. */
  meter: { flexDirection: 'row', gap: 3, height: 8 },
  meterSeg: { flex: 1, borderRadius: 2 },
  /* `overflow: hidden` so the fill's square end is clipped to the track's
     radius rather than poking out of it at 100%. */
  track: { height: 8, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  /* Centred on its value rather than starting at it: a 2pt line drawn from the
     mark's position sits entirely to the right of it, which at the top of the
     range would read as a threshold nobody could reach. */
  mark: { position: 'absolute', width: 2, top: 0, bottom: 0, marginLeft: -1 },

  termsHead: { borderBottomWidth: StyleSheet.hairlineWidth },

});
