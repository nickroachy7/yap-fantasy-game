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
 *     ┌────────────────────────────────┐
 *     │ name · stake        state      │   HEAD    — always
 *     │ format · slots                 │
 *     ├────────────────────────────────┤
 *     │ you · your score · the field   │   MIDDLE  — only once entered
 *     ├────────────────────────────────┤
 *     │ RISK            REWARD         │   TERMS   — always
 *     ├────────────────────────────────┤
 *     │ how it is won      pool · seats │   FOOT   — always
 *     └────────────────────────────────┘
 *
 * Nothing above or below the middle moves when it appears. That is the whole
 * design and the reason `ContestCard` takes the middle as a NODE rather than as
 * a variant flag: a variant invites the head and the foot to drift apart per
 * variant, which is exactly what happened last time.
 *
 * THE TERMS STAY ON AN ENTERED CARD, and the gems are the debatable part —
 * they are spent, and an earlier version dropped them on the grounds that a
 * price already paid is not news. But the trade is not over until settlement:
 * the heart is still riding, the pool is still growing, and the reward is still
 * ahead of you. Showing three quarters of a live trade is worse than showing a
 * line about money that has moved.
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
import { initialsOf } from '@/components/shell/AppHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
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
  type ContestTerms,
  type TradeLine,
} from './contest-model';

/** Dash rather than a nought: no number yet is not the same as no points. */
const DASH = '—';

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : n.toFixed(1);

/* ==================================================================== zones */

/**
 * What this contest is, and what state it is in.
 *
 * TWO LINES, ALWAYS THE SAME TWO. The name and the stake on the first, what the
 * contest asks of your roster on the second, and the state on the right across
 * both. The board's card used to put a WEEK here instead of a name — which was
 * a redundancy twice over, since the screen above it already says the week and
 * the free contest's name IS the week ("Preseason Week 4").
 */
function Head({
  name,
  terms,
  state,
}: {
  name: string;
  terms: ContestTerms;
  state: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.head, { borderColor: c.border }]}>
      <View style={styles.headText}>
        <View style={styles.headTitle}>
          <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
            {name}
          </Text>
          {/* THE STAKE, ON THE SAME LINE AS THE NAME, because a heart is part
              of what this contest IS. Drawn with the glyph rather than the word:
              a red heart is a mark a reader stops on where a sentence is one
              they skim.

              Only where there is one. A "0 hearts" mark on a contest that
              cannot end you would make the safe thing look like a lesser
              version of the risky one rather than a different offer. */}
          {terms.heartsAtRisk > 0 ? (
            <View style={styles.stake}>
              <Heart size={9} state="safe" color={c.negative} />
              <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
                {terms.heartsOnWin > 0
                  ? `${terms.heartsAtRisk} · +${terms.heartsOnWin}`
                  : `${terms.heartsAtRisk}`}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headSub}>
          <Text numberOfLines={1} style={[Type.fine, styles.headSubMain, { color: c.textSecondary }]}>
            {formatLine(terms)}
          </Text>
          {/* HOW FULL IT IS, on the right of its own line. `max_entrants` is
              null on every contest that exists — a cap on a four-tester beta is
              a way to discover the lobby is empty rather than full — so this
              degrades to a bare count and says nothing at all at zero. */}
          {seatsLine(terms) ? (
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {seatsLine(terms)}
            </Text>
          ) : null}
        </View>
      </View>
      {state}
    </View>
  );
}

/** The countdown, or the chip that replaces it once there is nothing to count. */
function ClockOrChip({
  lockAt,
  locked,
  final,
  now,
}: {
  lockAt: string | null;
  locked: boolean;
  final: boolean;
  now: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (final) return <StatusChip label="Final" tone="positive" />;
  if (locked) return <StatusChip label="Locked" />;

  /* The countdown runs to the NEXT player's kickoff, not to the week's first —
     players lock one at a time now, so this is a deadline that arrives several
     times and shortens the bench each time rather than ending the week. */
  return (
    <View style={styles.clock}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        NEXT LOCK
      </Text>
      <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: c.text }]}>
        {lockAt ? countdownLabel(new Date(lockAt).getTime() - now) : DASH}
      </Text>
    </View>
  );
}

/**
 * THE TRADE: what you put up on the left, what you can take on the right.
 *
 * TWO COLUMNS RATHER THAN A SENTENCE, because it is a comparison and a reader
 * is making it. Strung along one line — "40 gems, 1 heart at risk, top 3 win,
 * pool 200" — the two halves interleave and the reader has to sort them before
 * they can weigh them. Side by side, the weighing is the reading.
 *
 * THE HEAL SITS IN THE REWARD COLUMN, NEVER BESIDE THE RISK. A contest that
 * takes a heart most weeks and gives one back when it lands is not a harsher
 * version of the even-money contest; it is the only place in the game hearts
 * come FROM. Printed next to the risk it reads as a discount on the damage.
 */
function Trade({ terms, prize }: { terms: ContestTerms; prize: number | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.trade}>
      <TradeColumn label="RISK" lines={riskLines(terms)} />
      <View style={[styles.tradeRule, { backgroundColor: c.border }]} />
      <TradeColumn label="REWARD" lines={rewardLines(terms, prize)} />
    </View>
  );
}

function TradeColumn({ label, lines }: { label: string; lines: TradeLine[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.tradeCol}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      {lines.map((line) => (
        <View key={line.text} style={styles.tradeLine}>
          {line.heart ? <Heart size={10} state="safe" color={c.negative} /> : null}
          <Text
            numberOfLines={1}
            style={[Type.body, { color: line.tone === 'positive' ? c.positive : c.text }]}>
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The one big number, and it is NOT always the score.
 *
 * ---------------------------------------------------------------------------
 * AN EMPTY STATE IS NOT THE FULL STATE WITH THE NUMBERS PUNCHED OUT
 * ---------------------------------------------------------------------------
 *
 * For most of a week — and for the entire life of a beta week before Sunday —
 * this card had no score to show, so it drew a dash at hero size, `PROJ —`
 * under it, and an empty rail with three axis labels beneath that. Roughly
 * sixty per cent of the card was reserved space, and the largest thing on it
 * was an absence. It read as broken rather than as early, which is the state
 * most people meet FIRST.
 *
 * The fix is not a bigger dash or a friendlier caption. It is that before
 * kickoff the card is answering a DIFFERENT QUESTION, and it should ask it:
 * not "how am I doing", which has no answer yet, but "is my lineup ready and
 * when does it lock" — which is the only thing still in the reader's hands and
 * the only thing that can still be wrong.
 *
 * So the column shows slots filled until there is a score, then the score. Same
 * position, same type scale, so nothing jumps when it swaps.
 *
 * `PROJ —` IS GONE FROM THE CARD. The provider sells no projections and never
 * will, so that slot was a permanent dash directly under the largest number on
 * the screen. In the lineup ROWS the column still earns its place — it is one
 * reserved cell across eight rows and it keeps them aligned — but here it was a
 * single dead line in the one spot the card had to say something true. It holds
 * the rank now, which is a fact that exists.
 */
function Figure({
  score,
  filled,
  slots,
  rank,
  entrants,
}: {
  /** The week's total, or null before anybody has played. */
  score: string | null;
  filled: number;
  slots: number;
  /** Null while the whole field is tied and a rank would be meaningless. */
  rank: number | null;
  entrants: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (score !== null) {
    return (
      <View style={styles.figureCol}>
        <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: c.text }]}>
          {score}
        </Text>
        {/* Reserved whether or not there is a rank, so the card does not change
            height when the field spreads. */}
        <Text numberOfLines={1} style={[Type.micro, NUMERIC, styles.figureSub, { color: c.textTertiary }]}>
          {rank === null ? ' ' : `#${rank} OF ${entrants}`}
        </Text>
      </View>
    );
  }

  /* A LINEUP SHORT OF ITS SLOTS IS A PROBLEM, and it is drawn as one. The
     warning colour here is the same one the lobby uses on "5 of 8" — this is
     the same fact about the same lineup and it must not look different
     depending on which screen noticed it. */
  const short = filled < slots;
  return (
    <View style={styles.figureCol}>
      <Text
        numberOfLines={1}
        style={[styles.figure, NUMERIC, { color: short ? c.warning : c.text }]}>
        {filled}/{slots}
      </Text>
      <Text numberOfLines={1} style={[Type.micro, styles.figureSub, { color: c.textTertiary }]}>
        {short ? 'TO FILL' : 'FILLED'}
      </Text>
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
            { backgroundColor: i < filled ? c.textSecondary : c.backgroundElement },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The three labels under either rail, so both states read the same way.
 *
 * The middle one names the MARK — which is why its value belongs here rather
 * than in a column of its own, and why the margin sits beside it: the distance
 * to that line is the only thing on this card the reader is really asking
 * about, and it is stated where the line is.
 *
 * The label is the contest's own, not the word "median". See `markOf`.
 */
function ScaleFoot({
  markLabel,
  mark,
  margin,
}: {
  markLabel: string;
  mark: string | null;
  margin: number | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.scaleFoot}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        LOWEST
      </Text>
      <View style={styles.footMiddle}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {mark === null ? markLabel : `${markLabel} ${mark}`}
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
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        HIGHEST
      </Text>
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
 * The frame. Head, optional middle, terms, foot — in that order, always.
 *
 * The middle arrives as a NODE rather than as a `variant` flag on purpose. A
 * flag invites the head and the foot to acquire per-variant conditions, which
 * is precisely how the lobby and the board drifted into two layouts the first
 * time they were unified.
 */
export function ContestCard({
  name,
  terms,
  state,
  middle,
  prize = null,
  onPress,
}: {
  name: string;
  terms: ContestTerms;
  /** The chip or the countdown. Both surfaces answer "what state is this in". */
  state: React.ReactNode;
  /** Present exactly when there is an entry to show. */
  middle?: React.ReactNode;
  prize?: number | null;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const body = (
    <>
      <Head name={name} terms={terms} state={state} />
      {middle}
      <View style={styles.termsBody}>
        <Trade terms={terms} prize={prize} />
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {body}
      </View>
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
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
      ]}>
      {body}
    </Pressable>
  );
}

/**
 * The band entering inserts: your team, your number, and where it sits.
 *
 * IT IS THE TOP ROW OF THE SAME TABLE AS THE LINEUP — handle over a standing
 * line on the left, the week's figure on the right, which is the shape the rows
 * below it use, only larger because this is a team total rather than one
 * player's.
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
  const accent = TierColors[scheme].gold.accent;

  /**
   * HAS ANYBODY PLAYED YET? — not the same question as "has the sweep run",
   * which is what this card used to ask and got wrong on screen.
   *
   * `score_week` stamps `scored_at` and writes `total_points = 0` whether or
   * not a ball has been thrown, so keying off that put a FINAL chip and a
   * confident "0.0" on a week that had not started. The honest test is the best
   * score in the FIELD: if nobody has a point, nobody has played.
   */
  const played = field !== null && field.high > 0;
  /* A field of one is its own low, mark and high — no range to place anybody
     in, whatever anybody scored. */
  const live = field !== null && field.entrants >= MIN_ENTRANTS && played;

  const mark = markOf(terms, { median: field?.median ?? 0, cut });
  const margin = live && myPoints !== null && mark.value !== null ? myPoints - mark.value : null;

  /**
   * The score is YOURS the moment one exists — gated on `played`, NOT on
   * `live`. Tying it to `live` meant a week you had finished and scored 88.2 in
   * showed nothing, because you happened to be the only manager in it. Only the
   * COMPARISON needs a field.
   */
  const score = played ? fmt(myPoints) : null;

  /**
   * ALWAYS WITH THE POOL SIZE, never a bare "#1". The danger is a rank that is
   * really a TIE ACROSS THE WHOLE FIELD: before kickoff every lineup sits on a
   * stored nought and `rank()` hands EVERYONE first place. So the test is
   * whether the field has spread — `high > low` — not whether anybody has
   * played. A field of ONE is exempt: its rank is unambiguous and the `of 1`
   * says everything about what it is worth.
   */
  const rankIsReal =
    field !== null && field.myRank !== null && (field.entrants === 1 || field.high > field.low);

  return (
    <View style={[styles.middle, { borderColor: c.border }]}>
      <View style={styles.identity}>
        <View style={[styles.avatar, { borderColor: accent }]}>
          <Text style={[Type.label, { color: c.text }]}>{initialsOf(manager)}</Text>
        </View>
        <View style={styles.who}>
          <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
            {manager}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Figure
          score={score}
          filled={filled}
          slots={terms.slotCount}
          rank={rankIsReal ? field.myRank : null}
          entrants={field?.entrants ?? 0}
        />
      </View>

      <View style={styles.scale}>
        {live ? (
          <ScaleBar low={field.low} high={field.high} mark={mark.value} mine={myPoints} />
        ) : (
          <SlotMeter filled={filled} slots={terms.slotCount} />
        )}
        {/* THE AXIS LABELS EXIST ONLY WHERE THERE IS AN AXIS. They were drawn
            over the empty rail too, on the argument that they teach the scale
            before there is data in it. That was defensible against a
            meaningless ghost rail and is simply false against a slot meter —
            LOWEST and HIGHEST would be labelling nothing. */}
        {live ? (
          <ScaleFoot
            markLabel={mark.label}
            mark={mark.value !== null ? fmt(mark.value) : null}
            margin={margin}
          />
        ) : null}
      </View>
    </View>
  );
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
      <View style={styles.termsHead}>
        <Text numberOfLines={1} style={[Type.fine, { color: c.textSecondary }]}>
          {formatLine(terms)}
        </Text>
      </View>
      <View style={styles.termsBody}>
        <Trade terms={terms} prize={null} />
      </View>
    </View>
  );
}

/** The state chip a lobby card carries, and the clock an entered one does. */
export { ClockOrChip };

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
  /* Takes the room the chip and clock do not, so the name truncates before the
     stake does — a clipped heart reads as a rendering fault. */
  headText: { flex: 1, minWidth: 0, gap: 1 },
  /* Line two spans the card: what it asks on the left, how full it is on the
     right. `flexShrink` on the left half only, so the seat count never wraps. */
  headSub: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  headSubMain: { flexShrink: 1, minWidth: 0 },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  stake: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  head: {
    flexDirection: 'row',
    /* TOP, not centre. The head is two lines and the state is one, so centring
       parked the clock between them — level with the seat count on line two and
       reading as part of it. Aligned to the top it sits on the name's line,
       which is the line it belongs to. */
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two - 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /* Label and value on one baseline, so the rail stays one line tall whether it
     is showing a countdown or a chip. */
  clock: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 1 },

  /* The band entering inserts. Ruled off top and bottom so that the head above
     and the terms below are visibly the same rows they were without it. */
  middle: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two + 2,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  termsBody: { paddingHorizontal: Spacing.two + 4, paddingVertical: Spacing.two + 1 },
  termsHead: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two - 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /* Equal halves with a rule between them. `flex: 1` on both rather than a
     measured split, so a long reward line wraps inside its own column instead
     of pushing the risk column off the card. */
  trade: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.three },
  tradeCol: { flex: 1, minWidth: 0, gap: 3 },
  tradeLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  /* A hairline, not a gap: the two columns are one comparison and the rule is
     what says so. */
  tradeRule: { width: StyleSheet.hairlineWidth },

  /* ------------------------------------------------------------ board */
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Takes the row's spare width, which is what pushes the figure to the right
     edge — no spacer and no `marginLeft: auto`. `minWidth: 0` is what lets a
     long handle truncate instead of shoving the figure off the card. */
  who: { flex: 1, minWidth: 0, gap: 1 },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  /* Never shrinks: the name beside it gives way instead. */
  figureCol: { alignItems: 'flex-end', flexShrink: 0 },
  /* 22, against the lineup rows' 15. Bigger because it is a team total rather
     than one player's, small enough that the bar under it is still the thing
     the card is about. */
  figure: { fontSize: 22, lineHeight: 24, fontWeight: '800', letterSpacing: -0.5 },
  /* Height reserved whether or not there is anything in it, so the card does
     not grow by a line the moment a field spreads far enough to have ranks. */
  figureSub: { height: 15, lineHeight: 15 },
  footMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    flexShrink: 1,
    minWidth: 0,
  },
  scale: { gap: Spacing.one },
  /* `overflow: hidden` so the fill's square end is clipped to the track's
     radius rather than poking out of it at 100%. */
  track: { height: 8, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  /* Centred on its value rather than starting at it: a 2pt line drawn from the
     mark's position sits entirely to the right of it, which at the top of the
     range would read as a threshold nobody could reach. */
  mark: { position: 'absolute', width: 2, top: 0, bottom: 0, marginLeft: -1 },
  /* Same 8pt height as the live track, so nothing shifts when the first score
     lands and the meter becomes a distribution. The gap is what keeps it
     reading as COUNTABLE — eight things you have or have not done — rather than
     as a progress bar that happens to be segmented. */
  meter: { flexDirection: 'row', gap: 3, height: 8 },
  meterSeg: { flex: 1, borderRadius: 2 },
  scaleFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
