/**
 * The contests sheet's header: the run, at the size the run is actually worth.
 *
 * ---------------------------------------------------------------------------
 * IT STOPPED BEING THE SET CHECKLIST'S HERO
 * ---------------------------------------------------------------------------
 *
 * It was built as that hero pointed at a run — a title, a rack, the record at
 * page size, the rule in full, a progress bar, and the carry ladder as four
 * rows. On the set sheet that shape is right, because the set IS the page: you
 * came to read how far into it you are, and the grid underneath is the
 * evidence.
 *
 * A lobby is not that. You come here to ENTER something, the contests are the
 * page, and the run is the context you price them against.
 *
 * MEASURED, off a screenshot of the real sheet on an iPhone 17 Pro: the header
 * and its tab bar ran to 348pt of an 874pt screen — FORTY PER CENT — so the
 * first contest sat below the fold on every single visit, and four of those
 * rows were static config re-read every time. (An earlier draft of this comment
 * guessed "about 560pt". It was a guess, and it was wrong by half a screen;
 * the figure above comes off the device.)
 *
 * So the run keeps every fact it had and gives up the room:
 *
 *     was                              is
 *     ------------------------------   ------------------------------
 *     title, week on its own line      title and week share their lines
 *     rack + "3 hearts · 1 free"       rack + the count, right of the title
 *     the record at 26pt, own row      the record beside the rack
 *     the rule as a three-line para    one clause under the title
 *     a progress bar, then four rows   one row of four segments
 *
 * The ladder changed most and lost least. Four rows said `3W / 1 card / 2 to
 * go` down the screen; four segments say it across. The bar each segment sits
 * under IS the progress bar — the old fill and the old rungs were the same
 * fact drawn twice, in two places that could only ever agree.
 *
 * ---------------------------------------------------------------------------
 * NO WASH. THE BAND IS `surfaceSheet`
 * ---------------------------------------------------------------------------
 *
 * This wore `Brand.lime` through `SheetToneBand`, reasoning that a band is what
 * makes a header read as one BLOCK rather than as a title with loose rows under
 * it, and that lime claims nothing about the run the way `positive` or
 * `negative` would. Both halves were sound. What it missed is what the colour
 * RESOLVES to: `TONE_PEAK` is 0.26, so #C7F53D over #101010 lands near
 * rgb(64,76,28) — a dark olive. A brand hue at 26% is not read as brand. At
 * that weight it reads as a STATE, and olive is not a state anybody wants to be
 * told they are in, on the screen they open most.
 *
 * The band survives, because the argument for it was never about hue — a
 * header needs a PLANE or it is a title with loose rows under it.
 *
 * The first draft of that fix went to `surfaceSheet`, which is the exact colour
 * `PlayerSheetFrame` already paints the sheet: the band and the page were the
 * same #101010, so there was no plane at all and the header went back to being
 * a title with loose rows under it. The wash had been carrying the separation
 * and removing it took the separation too.
 *
 * `backgroundElement` is the step that does the job on the dark scale alone —
 * #212121 against the sheet's #101010, the same lift a card gets, with the
 * hairline underneath to close it. It is the plane the olive was, without
 * claiming a state. Everything inside keeps its own meaning: hearts stay
 * `negative`, reached rungs stay `positive`, and neither has a third colour to
 * compete with.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Hearts } from '@/components/runs/Hearts';
import { type Run } from '@/components/runs/run';
import { standingOn, type CarryRung } from '@/components/runs/use-run-ladder';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function LobbyHero({
  run,
  rungs,
  week,
}: {
  run: Run | null;
  /** Null while the ladder loads. Its height is deliberately not reserved. */
  rungs: CarryRung[] | null;
  week?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { here } = run && rungs ? standingOn(rungs, run.wins) : { here: null };

  return (
    <View style={[styles.band, { backgroundColor: c.backgroundElement, borderBottomColor: c.border }]}>
      {/* ONE LINE FOR WHO YOU ARE AND HOW YOU ARE DOING.
          The title anchors the left; the run's two numbers sit right, in the
          order they are felt — the rack first, because every stake below is
          priced in it, then the record, because that is what the ladder under
          this is about. */}
      <View style={styles.titleRow}>
        <Text style={[Type.page, { color: c.text }]}>Contests</Text>
        <View style={styles.spacer} />
        {run ? (
          <>
            <Hearts hearts={run.hearts} wagered={run.wagered} rack={run.rack} size={15} />
            {/* FREE TO STAKE, NOT JUST HELD.
                The line this replaced said "3 hearts · 1 free to stake", and
                the first draft of this band kept only the 3 — which is the
                wrong half. Every row below costs a heart to enter, so the
                number a reader is actually here to check is how many they can
                still SPEND; a bare 3 beside two crossed-out glyphs invites
                exactly the misread that matters. The glyphs distinguish
                wagered from free and this says it in figures, which is the
                same belt-and-braces the rack has always had.
                Total alone when nothing is staked, so the common case stays
                one character. */}
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{heartCount(run)}</Text>
            <View style={[styles.tick, { backgroundColor: c.borderStrong }]} />
            <Text style={[Type.strong, NUMERIC, { color: c.textSecondary }]}>
              {`${run.wins}-${run.losses}`}
            </Text>
          </>
        ) : null}
      </View>

      {/* THE WEEK AND THE STAKE, IN ONE CLAUSE.
          The rule was a three-line paragraph beside a 26pt figure, and most of
          it was the same sentence every week — what a heart is, what the wipe
          takes — which a player reads once. What stays is the half that is a
          NUMBER and therefore moves: how many hearts are left to lose. */}
      <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
        {[week, run ? wipeClause(run) : null].filter(Boolean).join(' · ')}
      </Text>

      {rungs && rungs.length > 1 ? (
        <View style={styles.ladder}>
          {rungs.map((r) => (
            <Rung
              key={r.atWins}
              rung={r}
              reached={run !== null && run.wins >= r.atWins}
              standing={here !== null && here.atWins === r.atWins}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One rung, as a segment: a bar, the wins it wants, what it keeps.
 *
 * THE BAR IS THE PROGRESS BAR. There is no separate track any more — a filled
 * segment is a rung you have passed, so the row of them draws the proportion
 * the bar drew, with the thing each rung PAYS written underneath it.
 *
 * `standing` outranks `reached` in the tint, because the rung you are on is the
 * one worth finding. Everything behind it is `textTertiary`: passed, and no
 * longer a decision.
 */
function Rung({
  rung,
  reached,
  standing,
}: {
  rung: CarryRung;
  reached: boolean;
  standing: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const tint = standing ? c.positive : reached ? c.textTertiary : c.textSecondary;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${rung.atWins} wins keeps ${rung.cardSlots} cards.${
        standing ? ' You are here.' : reached ? ' Passed.' : ''
      }`}
      style={styles.rung}>
      <View
        style={[
          styles.rungBar,
          { backgroundColor: reached || standing ? c.positive : c.borderStrong },
        ]}
      />
      <Text style={[Type.micro, NUMERIC, { color: standing ? c.positive : c.textTertiary }]}>
        {`${rung.atWins}W`}
      </Text>
      <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: tint }]}>
        {rung.cardSlots === 0 ? '—' : `${rung.cardSlots} card${rung.cardSlots === 1 ? '' : 's'}`}
      </Text>
    </View>
  );
}

/**
 * The rack in figures: what is spendable, out of what is held.
 *
 * `3` while nothing is staked; `1 of 3` once two are riding. Never the bare
 * total once they differ — see the note at the call site.
 */
function heartCount(run: Run): string {
  const free = run.hearts - run.wagered;
  return run.wagered > 0 ? `${free} of ${run.hearts}` : String(run.hearts);
}

/**
 * What losing the rest of the hearts costs, in one clause.
 *
 * The long form spelled out the wipe, the carry and the climb to the next rung
 * across three lines. The ladder draws the climb now and the run's own sheet
 * carries the rest, so what is left here is the one figure that moves.
 */
function wipeClause(run: Run): string {
  return run.hearts === 1
    ? 'lose your last heart and the roster is wiped'
    : `lose ${run.hearts} hearts and the roster is wiped`;
}

const styles = StyleSheet.create({
  band: {
    /* FULL BLEED, by cancelling the scroller's own inset the way
       `SheetToneBand` did — see its `band` style. Without this the plane stops
       16pt short of each edge and reads as a card sitting on the sheet rather
       than as the sheet's header, which is the whole job it was given back. */
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two + 2,
    gap: Spacing.half,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  spacer: { flex: 1 },
  tick: { width: StyleSheet.hairlineWidth, height: 12 },
  ladder: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two + 2 },
  rung: { flex: 1, gap: 5 },
  rungBar: { height: 4, borderRadius: 2 },
});
