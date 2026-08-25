/**
 * The week's contest: your score, placed inside the field.
 *
 * THE FIELD IS NOT A PERSON, AND THIS CARD MUST NOT SUGGEST IT IS.
 *
 * The first version of this was the reference's head-to-head: two avatars, two
 * scores, a margin between them. It was wrong, and wrong in a way that only
 * showed once it was drawn — a circle and a name opposite your own reads as
 * another manager, and this game deliberately has none. There are no pairings,
 * no schedule and no opponent to draw; there is a base of managers, and you are
 * somewhere in it.
 *
 * So the community is drawn as what it actually is: a DISTRIBUTION. The bar runs
 * from the worst score in the field to the best, the median you are scored
 * against is a mark on it, and your own total is the fill. The ends carry no
 * numbers — they are an axis, not a pair of statistics.
 *
 * IT IS THE TOP ROW OF THE SAME TABLE AS THE LINEUP.
 *
 * Name over a standing line on the left, the week's figure with `PROJ —` under
 * it on the right — the shape the eight rows below use, only larger, because
 * this is a team total rather than one player's. The card used to carry its own
 * oversized hero and its own labels, which made the page read as a card sitting
 * on top of a different design. Read this as the row for YOUR TEAM and the eight
 * under it as its parts.
 *
 * AN EMPTY STATE IS NOT THE FULL STATE WITH THE NUMBERS PUNCHED OUT.
 *
 * An early draft was exactly that: a dash in a 32pt hero, "MEDIAN —", and a grey
 * apology underneath. It read as broken rather than as early — which, for the
 * first weeks of a beta, is the state most people meet FIRST. What carries it
 * now is not a bigger absence but the surroundings:
 *
 *  - The bar is always drawn. Before anybody plays it is a GHOST RAIL with its
 *    three labels intact, so the card keeps its shape when the first score
 *    lands and the axis teaches what it will mean before there is data in it.
 *  - The line under the name always says something true: your rank once the
 *    week has scores in it, the size of the field before that.
 *
 * There is no explanatory caption and no pace line. Both were tried and cut —
 * they were the two longest things on a card whose job is one glance, and the
 * axis labels already say what the bar means.
 *
 * NO PROJECTION, NO WIN PROBABILITY. The provider sells no projections and we
 * will not invent one. Nothing here is modelled; every figure has happened.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Heart } from '@/components/runs/Hearts';
import { initialsOf } from '@/components/shell/AppHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { MIN_ENTRANTS, recordLabel, type FieldWeek, type Record_ } from './field';
import { countdownLabel } from './model';

/** Dash rather than a nought: no number yet is not the same as no points. */
const DASH = '—';

/**
 * Segments in the ghost rail. Enough to read as "a scale waiting to be filled"
 * rather than as a broken bar; few enough that each one is still a shape at
 * 320pt, where they work out about 10pt wide.
 */
const GHOST_SEGMENTS = 20;

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : n.toFixed(1);

/**
 * The week's figure, in the same treatment the lineup rows use: the score, and
 * the projection under it at reading weight.
 *
 * Deliberately the ROW's shape rather than a second invention. This card and the
 * eight rows below it are answering the same question at two scales — what did
 * this score — and a card with its own vocabulary for it made the page read as
 * two designs. Larger here (22 against the row's 15) because it is a team total.
 *
 * THE PROJECTION IS A DASH AND MUST STAY ONE. The provider sells none. The slot
 * is reserved, not filled with something invented — the same rule the rows keep.
 *
 * An em dash at figure weight is a black bar, not an absence: it reads as a
 * redaction. So an unplayed week drops to the projection's weight and colour,
 * exactly as the rows do.
 */
function WeekFigure({ score }: { score: string | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.figureCol}>
      {score !== null ? (
        <Text numberOfLines={1} style={[styles.figure, NUMERIC, { color: c.text }]}>
          {score}
        </Text>
      ) : (
        <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
          {DASH}
        </Text>
      )}
      <View style={styles.projLine}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          PROJ
        </Text>
        <Text numberOfLines={1} style={[styles.projValue, NUMERIC, { color: c.textTertiary }]}>
          {DASH}
        </Text>
      </View>
    </View>
  );
}

/**
 * The three labels under either rail, so both states read the same way.
 *
 * The middle one names the MARK — which is why the median's value belongs here
 * rather than in a column of its own, and why the margin sits beside it: the
 * distance to that mark is the only thing on this card the reader is really
 * asking about, and it is now stated where the mark is.
 */
function ScaleFoot({ median, margin }: { median: string | null; margin: number | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.scaleFoot}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        LOWEST
      </Text>
      <View style={styles.footMiddle}>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {median === null ? 'MEDIAN' : `MEDIAN ${median}`}
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
 * The scale before it means anything.
 *
 * Deliberately NOT the live track drawn empty — a flat grey bar is
 * indistinguishable from a bar whose fill failed to render. Broken into
 * segments it reads as a rail waiting for something, which is what it is.
 */
function GhostRail() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.ghost}>
      {Array.from({ length: GHOST_SEGMENTS }, (_, i) => (
        <View key={i} style={[styles.ghostSeg, { backgroundColor: c.backgroundElement }]} />
      ))}
    </View>
  );
}

/**
 * Where you sit between the field's worst and best score.
 *
 * The caller is IN the field, so `low <= mine <= high` holds by construction and
 * the fill can never run off either end — see the migration header. The clamp
 * below is belt-and-braces against a stale read pairing this week's score with
 * last week's range mid-refresh, not against the arithmetic.
 */
function ScaleBar({
  low,
  high,
  median,
  mine,
}: {
  low: number;
  high: number;
  median: number;
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
  const beating = mine !== null && mine >= median;

  return (
    <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
      {/* Percentage widths rather than flex, because the median mark has to sit
          at an absolute position on the same axis as the fill's end. Two
          different layout systems on one scale would drift apart. */}
      <View
        style={[
          styles.fill,
          { width: `${fill}%`, backgroundColor: beating ? c.positive : c.textSecondary },
        ]}
      />
      {/* Drawn last so it sits ON the fill rather than under it — the whole
          point is seeing whether you have passed it. `marginLeft` of half its
          own width centres the line on the value instead of starting at it. */}
      <View style={[styles.mark, { left: `${at(median)}%`, backgroundColor: c.text }]} />
    </View>
  );
}

export function ContestCard({
  displayName,
  weekLabel,
  lockAt,
  locked,
  now,
  myPoints,
  field,
  record,
  standingLine,
  heartsAtRisk = 0,
  heartsOnWin = 0,
}: {
  displayName: string;
  /** "Preseason · Week 3" — without the lock state, which the head rail carries. */
  weekLabel: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  /**
   * Your total this week, straight from the server. Whether it is worth SHOWING
   * is decided below from the field, not from here: `score_week` writes a
   * stored nought long before kickoff, so a number arriving is not evidence
   * that anything has been played.
   */
  myPoints: number | null;
  /** This week's field. Null while it loads, or before anyone has entered. */
  field: FieldWeek | null;
  record: Record_;
  /**
   * Overrides the season record under the name.
   *
   * A SEASON RECORD IS A PROPERTY OF THE SEASON CONTEST, and only the free one
   * has a season. A lobby contest is a single week that is entered and settled
   * and gone, so "Season 0-0" under it would be inventing a standing for
   * something with no history to stand on — and worse, it reads as the SAME
   * number the free card above it is showing.
   *
   * A lobby card says what the contest asks of you instead ("Flex Three · 3
   * cards"), which is the fact its owner actually needs while swiping past.
   */
  standingLine?: string;
  /**
   * What losing this contest costs the run, and what winning it heals.
   *
   * DRAWN HERE BECAUSE NOTHING ELSE DRAWS IT for the free contest: the lobby
   * list filters that one out (nobody chose it, nobody can leave it), so this
   * card is the only surface its stake appears on. Being auto-entered into
   * something that can end a run is worse than choosing it blind — there is not
   * even a tap to think twice about.
   */
  heartsAtRisk?: number;
  heartsOnWin?: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  /* The countdown runs to the NEXT player's kickoff, not to the week's first —
     players lock one at a time now, so this is a deadline that arrives several
     times and shortens the bench each time rather than ending the week.
 
     Only ever rendered while something is still movable; a fully locked or
     final week shows its chip instead, so there is no 'LOCKED' branch here to
     keep in step with it. */
  const clock = lockAt ? countdownLabel(new Date(lockAt).getTime() - now) : DASH;

  /**
   * HAS ANYBODY PLAYED YET? — and it is not the same question as "has the sweep
   * run", which is what this card used to ask and got wrong on screen.
   *
   * `gameday_sweep` calls `score_week` every five minutes from an hour before
   * the first kickoff, and `score_week` stamps `scored_at` and writes
   * `total_points = 0` whether or not a ball has been thrown. Keying off that
   * put a FINAL chip and a confident "0.0" on a week that had not started.
   *
   * The honest test is the best score in the FIELD: if nobody has a point,
   * nobody has played.
   */
  const played = field !== null && field.high > 0;

  /* A field of one is its own low, median and high — no range to place anybody
     in, whatever anybody scored. */
  const contested = field !== null && field.entrants >= MIN_ENTRANTS;

  /**
   * Over, as opposed to merely swept. The server decides it — every fixture in
   * the week `final` — because that is also what gates a W or an L, and the
   * chip and the record must never disagree about whether a week has finished.
   */
  const final = field?.final ?? false;

  const live = contested && played;
  const margin = live && myPoints !== null ? myPoints - field.median : null;

  /**
   * The week's score, and it is YOURS the moment one exists.
   *
   * Gated on `played`, NOT on `live`. Tying it to `live` meant a week you had
   * finished and scored 88.2 in showed nothing, because you happened to be the
   * only manager in it — hiding your own result behind somebody else's absence.
   * Only the COMPARISON needs a field; the score is yours either way.
   */
  const score = played ? fmt(myPoints) : null;

  /**
   * The line under the name: WHERE YOU STAND, then your record.
   *
   * The rank is the whole point of a single global board — everybody is in one
   * table, so "seventh of twenty-six" is a real position rather than a placing
   * inside a league of twelve you happened to be sorted into. It also retires
   * the "AHEAD OF n" the bar used to carry: seventh of twenty-six already says
   * nineteen are behind you.
   *
   * ALWAYS WITH THE POOL SIZE, never a bare "Ranked #1".
   *
   * This is the same rule the player profile keeps for its position ranks, for
   * the same reason and with sharper teeth here: that pool swings between 7 and
   * 126 depending on the season, and THIS one is a beta field that goes 1, 3,
   * then twenty-odd. "Ranked #1" out of a field of two is not a shorter fact,
   * it is a different and flattering one — and it would quietly get less true
   * as the base grew. The denominator is what makes it a measurement.
   *
   * WHEN IT IS WITHHELD, and it is a narrower case than it first looks.
   *
   * The danger is a rank that is really a TIE ACROSS THE WHOLE FIELD. Before
   * kickoff every lineup sits on a stored nought, and `rank()` over a column of
   * noughts hands EVERYONE first place — twenty-six managers each told they are
   * first, every one of those claims evaporating the moment a game finishes.
   *
   * So the test is whether the field has spread yet — `high > low` — not
   * whether anybody has played, and not whether there are two of you. A field
   * of ONE is exempt: its rank is unambiguous, permanently 1, and the `of 1`
   * says everything there is to say about what that is worth. An earlier
   * version gated this on `contested` and hid "Ranked #1 of 1" behind
   * "1 in the field", which withheld a fact that was never in doubt.
   *
   * Where it is withheld, the size of the field is the honest thing to say
   * instead, and the absence of the word "Ranked" is itself the signal.
   */
  const rankIsReal =
    field !== null &&
    field.myRank !== null &&
    (field.entrants === 1 || field.high > field.low);

  /**
   * TWO SCOPES, AND THEY MUST NOT SHARE A LINE.
   *
   * These were once one string — "Ranked #7 of 26 · 2-1" — and that reads as a
   * single claim: seventh, therefore 2-1. It is two claims at different scales.
   * The record is the SEASON (weeks beaten, cumulative); the rank is THIS WEEK
   * (where you sit in the field right now). Side by side, the rank inherits the
   * record's scope and looks like a season standing, which it is not and which
   * would be the more flattering of the two readings for most of a season.
   *
   * So they are separated by the bar, and each is labelled with its own scope:
   * the season record sits under the name, the weekly rank under the bar it
   * summarises. The bar IS this week's standing; the rank is the same fact as
   * a number, so that is where it belongs.
   */
  const seasonLine = standingLine ?? `Season ${recordLabel(record)}`;

  const weekLine =
    field === null
      ? null
      : rankIsReal
        ? `Ranked #${field.myRank} of ${field.entrants} this week`
        : `${field.entrants} in the field`;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* The week and its state, on one rail. The countdown lives here rather
          than in a tile because at 320pt a quarter-width tile rendered it as
          "3h …" — truncating the one thing on this card with a deadline. */}
      <View style={[styles.head, { borderColor: c.border }]}>
        <View style={styles.headLeft}>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textSecondary }]}>
            {weekLabel.toUpperCase()}
          </Text>
          {/* THE STAKE, ON THE SAME RAIL AS THE DEADLINE, because they are the
              same kind of fact: what this week is going to cost you and when.
              A heart and a clock side by side is the whole proposition of the
              card in two glyphs.

              Only drawn when there is one. A "0 hearts" mark on a contest that
              cannot end you would make the safe thing look like a lesser
              version of the risky one rather than a different offer. */}
          {heartsAtRisk > 0 ? (
            <View style={styles.stake}>
              <Heart size={9} state="safe" color={c.negative} />
              <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
                {heartsOnWin > 0 ? `${heartsAtRisk} · +${heartsOnWin}` : `${heartsAtRisk}`}
              </Text>
            </View>
          ) : null}
        </View>
        {final ? (
          <StatusChip label="Final" tone="positive" />
        ) : locked ? (
          <StatusChip label="Locked" />
        ) : (
          <View style={styles.clock}>
            <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
              NEXT LOCK
            </Text>
            <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: c.text }]}>
              {clock}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Name over standing on the left, the week's figure on the right —
            the lineup rows' own shape, so the card reads as their heading
            rather than as a different design sitting above them. */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { borderColor: accent }]}>
            <Text style={[Type.label, { color: c.text }]}>{initialsOf(displayName)}</Text>
          </View>
          <View style={styles.who}>
            <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {seasonLine}
            </Text>
          </View>
          <WeekFigure score={score} />
        </View>

        <View style={styles.scale}>
          {live ? (
            <ScaleBar low={field.low} high={field.high} median={field.median} mine={myPoints} />
          ) : (
            <GhostRail />
          )}
          <ScaleFoot median={live ? fmt(field.median) : null} margin={margin} />
          {/* Sentence case at reading size, deliberately NOT the axis labels'
              uppercase micro: it is a caption for the bar, not a fourth tick on
              it. */}
          {weekLine === null ? null : (
            <Text numberOfLines={1} style={[Type.fine, { color: c.textSecondary }]}>
              {weekLine}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },
  /* Takes the room the chip and clock do not, so the week label truncates
     before the stake does — a clipped heart reads as a rendering fault. */
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  stake: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /* Label and value on one baseline, so the rail stays one line tall whether it
     is showing a countdown or a chip. */
  clock: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 1 },
  body: { padding: Spacing.two + 4, gap: Spacing.two + 2 },
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
  figure: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
  /* An unplayed week drops to the projection's weight and colour, so the
     column reads as empty rather than as struck out. Straight from LineupRow. */
  figureEmpty: { fontSize: 14, lineHeight: 26, fontWeight: '500' },
  projLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, height: 15 },
  projValue: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  footMiddle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 1, minWidth: 0 },
  scale: { gap: Spacing.one + 1 },
  /* `overflow: hidden` so the fill's square end is clipped to the track's
     radius rather than poking out of it at 100%. */
  track: { height: 8, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  /* Centred on its value rather than starting at it: a 2pt line drawn from the
     median's position sits entirely to the right of it, which at the top of the
     range would read as a median nobody could reach. */
  mark: { position: 'absolute', width: 2, top: 0, bottom: 0, marginLeft: -1 },
  /* Same 8pt height as the live track, so nothing shifts when the first score
     lands and the rail becomes a bar. */
  ghost: { flexDirection: 'row', gap: 3, height: 8 },
  ghostSeg: { flex: 1, borderRadius: 2 },
  scaleFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
