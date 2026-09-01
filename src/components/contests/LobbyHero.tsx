/**
 * The contests sheet's header: the run, at the size of the thing it decides.
 *
 * ---------------------------------------------------------------------------
 * IT IS THE SET CHECKLIST'S HERO, POINTED AT A RUN
 * ---------------------------------------------------------------------------
 *
 * The set sheet answers "which set is this and how far in am I" in one block —
 * a name, a figure, the rule in full, a progress bar, and the LADDER: every
 * reward on it, what each wants, what each pays, and which are behind you. Then
 * the filters, then the grid. That shape is why a set nobody will ever finish
 * is still worth adding a card to, and it is the best header in this app.
 *
 * A contest lobby has exactly the same question underneath it, and it had been
 * answering it in a one-line rail: what is my run, and how far in am I. So this
 * is that header, with the run's own numbers in it.
 *
 *     the set                          the run
 *     ------------------------------   ------------------------------
 *     name and season                  Contests, and which week
 *     12/31 committed                  the record, and the hearts
 *     what completing means            what a death costs
 *     bar, with rungs marked           bar, with rungs marked
 *     six rewards, three behind you    four carry rungs, one behind you
 *     "1 more card pays 500"           "2 more wins keeps 1 card"
 *
 * ---------------------------------------------------------------------------
 * TWO NUMBERS, AND THEY ARE NOT INTERCHANGEABLE
 * ---------------------------------------------------------------------------
 *
 * A run is HEARTS and it is WINS, and a header that picked one would be a
 * header about half of it. Hearts are how long you last: every contest on the
 * shelves below is priced in them and the reader cannot judge a single entry
 * without knowing how many are free. Wins are what you KEEP when the hearts run
 * out, which is the ladder, and the only reason a losing run is worth playing
 * out rather than abandoning.
 *
 * So the rack sits directly under the title, where the set puts its subtitle,
 * and the figure column below it is the record — because the figure has to be
 * the number the bar and the ladder under it are about, and those are about
 * wins. Putting hearts in the figure would have left a progress bar measuring
 * something the number above it does not mention.
 *
 * ---------------------------------------------------------------------------
 * THE WASH IS `Brand.lime`, AND IT IS THE ONE SHEET THAT CAN WEAR IT
 * ---------------------------------------------------------------------------
 *
 * This header went up without a wash, on the argument that `SheetToneBand`'s
 * colour is always the colour OF something — a card's tier, a player's club, a
 * set's team — and a run is not of anything. That was the right question and
 * the wrong answer: it treated the band as a label for the subject, when on
 * every other sheet it is also simply what makes the header read as one BLOCK
 * rather than as a title with loose rows under it.
 *
 * The colour it takes is the app's own. Lime is not a semantic hue anywhere in
 * this codebase — it is the mark on the login screen and nothing else — so it
 * says "this is Yap Fantasy's own screen" without claiming anything about the
 * run inside it. That matters here specifically, because the two colours a run
 * could otherwise claim are both already spoken for and both would be lying:
 * red is `negative`, worn by a lost heart and a dead run, so a wash of it over
 * a healthy run announces an emergency every week; green is `positive`, and a
 * header that goes green whatever your record is congratulating you for having
 * one.
 *
 * IT IS ALSO A CLAIM ON THIS SHEET IN PARTICULAR. The lobby is the door into
 * the part of the game that is actually a game — hearts, runs, contests — and
 * it is the only sheet in the app whose subject is the app rather than an
 * object in it. If a second one ever wants lime, that is the test it has to
 * pass.
 *
 * `TONE_PEAK` is 0.26, so #C7F53D over the sheet's #101010 resolves to about
 * rgb(64,76,28): a dark olive, the same weight as a club colour at the same
 * alpha rather than the bright green the swatch suggests. The marks inside it
 * stay `positive` teal, which separates from olive cleanly and keeps green
 * meaning progress rather than meaning brand.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Hearts } from '@/components/runs/Hearts';
import { heartsLine, type Run } from '@/components/runs/run';
import { standingOn, type CarryRung } from '@/components/runs/use-run-ladder';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The bar's own height, shared by the track and every fill in it. */
const TRACK_H = 6;

export function LobbyHero({
  run,
  rungs,
  week,
}: {
  /** Null before the player has one, which draws the title and nothing else. */
  run: Run | null;
  /** The carry ladder. Null while it loads; the block is skipped rather than
      reserved, because it is four rows of static config and arrives at once. */
  rungs: CarryRung[] | null;
  /** "Preseason 4" — which week these contests belong to. */
  week?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { here, next } = run && rungs ? standingOn(rungs, run.wins) : { here: null, next: null };
  /* THE TOP OF THE LADDER IS THE SCALE, not the next rung. A bar that refilled
     between rungs would report a run three wins from the ceiling and a run
     three wins from its first card as the same picture. */
  const top = rungs && rungs.length > 0 ? rungs[rungs.length - 1].atWins : 0;
  const progress = run && top > 0 ? Math.min(run.wins / top, 1) : 0;

  return (
    <View style={styles.hero}>
      <Text style={[Type.page, { color: c.text }]}>Contests</Text>
      {week ? <Text style={[Type.fine, { color: c.textTertiary }]}>{week}</Text> : null}

      {run ? (
        <>
          {/* THE RACK, HIGH AND WHOLE. It is the number every shelf below is
              priced in, and the one thing on this header a reader checks before
              every single entry — so it goes above the fold of the fold, not
              into a status line under the ladder. */}
          <View style={styles.rack}>
            <Hearts hearts={run.hearts} wagered={run.wagered} rack={run.rack} size={20} />
            <Text numberOfLines={1} style={[Type.strong, styles.rackLine, { color: c.text }]}>
              {heartsLine(run)}
            </Text>
          </View>

          <View style={styles.figureRow}>
            {/* THE RECORD AT PAGE SIZE, AND `0-0` ON A FRESH RUN.

                `recordOf` returns null there instead, on the argument that "a
                record of nothing is not a fact worth drawing, and a zero on a
                death-adjacent screen reads as a score". That holds for the
                status line it was written for and breaks here twice over. An
                em dash set at 26pt bold is not a dash, it is a short white BAR
                — it was drawn, and it reads as a stray rule someone left in the
                layout. And this figure is the label on the ladder underneath
                it: a run at the bottom of that ladder is at nought wins, which
                is a fact about a table, not a scoreline. */}
            <Text style={[Type.page, NUMERIC, { color: c.text }]}>
              {`${run.wins}-${run.losses}`}
            </Text>
            {/* THE RULE IN FULL, because this is the one screen with room for
                it. What a heart is, what losing the last one costs, and — the
                part no bar can say — that the wins are what survives it. */}
            <Text style={[Type.body, styles.rule, { color: c.textSecondary }]}>
              {runRule(run, here, next)}
            </Text>
          </View>

          <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: c.positive },
              ]}
            />
            {/* Every rung but the first and the last drawn as a notch in the
                bar, which is what turns a proportion into a distance to the
                next thing worth having. */}
            {(rungs ?? [])
              .filter((r) => r.atWins > 0 && r.atWins < top)
              .map((r) => (
                <View
                  key={r.atWins}
                  style={[
                    styles.notch,
                    { left: `${(r.atWins / top) * 100}%`, backgroundColor: c.surfaceSheet },
                  ]}
                />
              ))}
          </View>

          {rungs && rungs.length > 1 ? (
            <View
              style={[styles.ladder, { borderColor: c.border, backgroundColor: c.surfaceSheet }]}>
              {rungs.map((r, i) => (
                <RungRow
                  key={r.atWins}
                  rung={r}
                  wins={run.wins}
                  standing={here !== null && here.atWins === r.atWins}
                  first={i === 0}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * What the run is, in the two sentences a header has room for.
 *
 * IT NAMES THE NEXT RUNG RATHER THAN THE LADDER'S TOP, because the ladder is
 * drawn immediately below and can say the rest for itself. What prose is for
 * here is the thing a table cannot say: that these are the cards that survive
 * something, and that the something is close.
 */
function runRule(run: Run, here: CarryRung | null, next: CarryRung | null): string {
  /* "Lose 3 hearts and the run ends" is true and reads as a threat about some
     future three hearts. `all` is the word that makes it the ones in the rack
     directly above. */
  const held = run.hearts === 1 ? 'your last heart' : `all ${run.hearts} hearts`;
  /* THE LADDER'S OWN NUMBER, NOT `run.carrySlots`, AND THEY SHOULD BE THE SAME.
     Both come from the server — `carry_slots` is `run_carry_slots(wins)` and the
     rungs are the table that function reads — so a disagreement is a bug rather
     than a choice. Sourcing this sentence from the same row the table marks
     means that if one ever does drift, the header is wrong in one place instead
     of contradicting itself in two adjacent lines. The server's figure is the
     fallback for the moment before the ladder lands. */
  const slots = here?.cardSlots ?? run.carrySlots;
  /* The VERB agrees too. Pluralising only the noun produced "1 card come
     back", which is the classic half of this done in a template. */
  const carry =
    slots === 0 ? 'nothing comes back' : slots === 1 ? '1 card comes back' : `${slots} cards come back`;
  const climb = next
    ? ` ${next.atWins - run.wins} more win${next.atWins - run.wins === 1 ? '' : 's'} makes it ${next.cardSlots}.`
    : '';
  return `Lose ${held} and the run ends: the roster is wiped and ${carry}.${climb}`;
}

/**
 * One rung of the carry ladder.
 *
 * THE SET'S RUNG ROW, COLUMN FOR COLUMN — a fixed label, a fixed figure, an
 * elastic state, and a mark — because four rungs have to read as a table rather
 * than as four sentences of different lengths, and because two ladders in one
 * app that are laid out differently are two ladders a reader has to learn
 * twice.
 *
 * THE MARK IS A PLACE, NOT A CLAIM, and that is the one real difference from
 * the set's. A set rung is money you have or have not collected, so it is
 * ticked. A carry rung is where you are STANDING: everything below it is
 * already true and nothing about it is owed to you, so the rung you are on is
 * dotted and the ones behind it are simply not marked at all. Ticking them
 * would promise four cards to somebody who keeps one.
 */
function RungRow({
  rung,
  wins,
  standing,
  first,
}: {
  rung: CarryRung;
  wins: number;
  standing: boolean;
  first: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const reached = wins >= rung.atWins;
  const gap = rung.atWins - wins;
  const tone = standing ? c.positive : reached ? c.textTertiary : c.textSecondary;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${rung.atWins} wins keeps ${rung.cardSlots} cards. ${
        standing ? 'You are here.' : reached ? 'Passed.' : `${gap} more wins.`
      }`}
      style={[
        styles.rungRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
      ]}>
      <Text style={[Type.micro, NUMERIC, styles.rungWins, { color: c.textTertiary }]}>
        {`${rung.atWins}W`}
      </Text>
      <Text style={[Type.body, NUMERIC, styles.rungCards, { color: tone }]}>
        {rung.cardSlots === 0
          ? 'no cards'
          : `${rung.cardSlots} card${rung.cardSlots === 1 ? '' : 's'}`}
      </Text>
      <Text numberOfLines={1} style={[Type.fine, styles.rungState, { color: c.textTertiary }]}>
        {standing ? 'you are here' : reached ? 'passed' : `${gap} to go`}
      </Text>
      <Text style={[Type.strong, styles.rungMark, { color: tone }]}>
        {standing ? '•' : reached ? '' : '–'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two },
  rack: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
  rackLine: { flexShrink: 1, minWidth: 0 },
  /* The set's own figure row: a page-size number and the rule beside it, top
     aligned so a three-line rule hangs off the figure rather than centring on
     it. */
  figureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rule: { flex: 1, minWidth: 0 },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden' },
  fill: { height: TRACK_H, borderRadius: TRACK_H / 2 },
  notch: { position: 'absolute', top: 0, width: 2, height: TRACK_H },
  /**
   * FILLED, not transparent, and the set sheet learned this the hard way: a
   * bordered box with no background lets a tone wash through and comes out as a
   * tinted panel. There is no wash here today — see the header — but the band
   * is the thing that might one day take one, and a box that only looks right
   * on an uncoloured band is a trap left for whoever adds the colour.
   */
  ladder: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.chip, overflow: 'hidden' },
  rungRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 3,
  },
  /* Fixed columns, so four rungs read as a table. See the set's own note: the
     widths are measured against the longest string each column can hold, not
     guessed. */
  rungWins: { width: 28 },
  rungCards: { width: 68 },
  rungState: { flex: 1, minWidth: 0 },
  rungMark: { width: 14, textAlign: 'center' },
});
