/**
 * The contests sheet's header: the run, at the size the run is actually worth.
 *
 * ---------------------------------------------------------------------------
 * IT STOPPED BEING THE SET CHECKLIST'S HERO
 * ---------------------------------------------------------------------------
 *
 * It was built as that hero pointed at a run — a title, a rack, the record at
 * page size, the rule in full, a progress bar, and the carry ladder as four
 * rows. On the set sheet that shape is right, because the set IS the page. A
 * lobby is not: you come here to ENTER something, the contests are the page,
 * and the run is the context you price them against. Measured off the real
 * sheet, the header and its tab bar ran to 348pt of an 874pt screen — forty
 * per cent — so the first contest sat below the fold on every visit.
 *
 * What is left is two lines, and only two:
 *
 *     Contests  1-0        [hearts riding]  [♥ 3]
 *     Week 1 · Lose 3 more and the run ends …
 *
 * ---------------------------------------------------------------------------
 * THE HEARTS ARE THE ONES AT STAKE, DRAWN THE WAY THE BOARD DRAWS THEM
 * ---------------------------------------------------------------------------
 *
 * `Hearts` draws the RACK: every heart the run holds, whole or torn, free or
 * wagered. That is the right picture on a death screen and the wrong one here,
 * because the rack answers "how many do I have" and the question this sheet is
 * actually about is "how many are already on the table".
 *
 * `ContestHearts` is the answer, and it is not a new idea — it is the row in
 * the middle of the board's week rail, one heart per heart staked, and this
 * header is now the same object in a second place. A reader who has learned
 * those glyphs on the board does not learn them again here.
 *
 * THE RECORD SITS ON THE TITLE. It is what the run has DONE — a fact about the
 * whole run, like the title — while the marks on the right are about THIS
 * WEEK: what is riding, and what is left. Grouped with those it read as a
 * third heart figure.
 *
 * THE REMAINING COUNT KEEPS ITS PILL. That is the masthead's `♥ 3`, the same
 * shape in the same place it always is, so the header carries both halves of
 * the question in one row: what is riding, and what is left.
 *
 * ---------------------------------------------------------------------------
 * THE CARRY LADDER IS GONE
 * ---------------------------------------------------------------------------
 *
 * Four rows became four segments and the segments are gone too. It was the
 * most-argued-over thing in this file and it earned none of the room: static
 * config, identical every week, re-read on every visit to a screen people open
 * to enter something.
 *
 * WHAT WENT WITH IT is the only place the game said what WINS are for — that a
 * run at three wins carries a card out of the wipe. That argument now lives
 * nowhere on this sheet, which is a real cost and is noted here so it is a
 * decision rather than an oversight. The run's own sheet still has the room
 * for it.
 *
 * ---------------------------------------------------------------------------
 * NO WASH. THE BAND IS PAINTED BY `SheetToneBand`
 * ---------------------------------------------------------------------------
 *
 * It wore `Brand.lime`, and at `TONE_PEAK` 0.26 over #101010 that resolves to
 * about rgb(64,76,28) — a dark olive. A brand hue at 26% is not read as brand;
 * at that weight it reads as a STATE, and olive is not one anybody wants to be
 * told they are in. `backgroundElement` does the job on the dark scale alone.
 *
 * The plane is painted by `SheetToneBand`, not here: it reaches up over the
 * floating grabber and 900pt into the overscroll, so neither a seam at the top
 * nor a hard flick back to it can show the sheet's colour above the band.
 */
import { StyleSheet, Text, View } from 'react-native';

import { ContestHearts, Heart, type HeartResult } from '@/components/runs/Hearts';
import { type Run } from '@/components/runs/run';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function LobbyHero({
  run,
  staked,
  week,
}: {
  run: Run | null;
  /** One entry per contest with hearts on it — see `ContestHearts`. */
  staked: { result: HeartResult | null; entered: boolean }[];
  week?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.band}>
      <View style={styles.titleRow}>
        <Text style={[Type.page, { color: c.text }]}>Contests</Text>
        {/* THE RECORD SITS ON THE TITLE, not with the hearts. It is what the
            run has DONE, and the title is the only other thing on this row
            that is about the run as a whole — the marks on the right are about
            THIS WEEK, what is riding and what is left. Grouping it with those
            made it read as a third heart figure.
            Baseline-aligned, so a 13pt figure sits on a 26pt title's line
            rather than floating half-way up it. */}
        {run ? (
          <Text style={[Type.strong, NUMERIC, styles.record, { color: c.textTertiary }]}>
            {`${run.wins}-${run.losses}`}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        {staked.length > 0 ? <ContestHearts entries={staked} size={15} gap={5} /> : null}
        {run ? (
          <View style={[styles.pill, { backgroundColor: c.background }]}>
            <Heart size={12} state="free" color={c.negative} />
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{run.hearts}</Text>
          </View>
        ) : null}
      </View>

      {/* THE SENTENCE, WITH THE ARITHMETIC DONE.
          "Lose 3 hearts and the roster is wiped" is a rule; what a player wants
          at a glance is how close they are to it, and how much is already on
          the table — see `runLine`. */}
      <Text style={[Type.body, { color: c.textTertiary }]}>
        {[week, run ? runLine(run) : null].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

/**
 * How close the run is to ending, in a sentence.
 *
 * TWO FACTS AND ONE CLAUSE. What is riding right now, and what it takes to end
 * the run — because the first is the thing that changes hour to hour and the
 * second is the thing it is measured against. The old line carried only the
 * second ("lose 3 hearts and the roster is wiped"), which is a rule; a rule
 * plus the arithmetic is a warning, and this screen is where a warning is
 * worth reading.
 *
 * "LOSE ALL 3", NEVER "LOSE 3 MORE". The first draft said "more" beside a
 * count of free hearts and produced `2 riding, 1 still free — lose 3 more`,
 * which invites the reader to add: three more on top of the two already at
 * risk, out of a rack of three. "All" is the word that ties the number to the
 * rack rather than to the hearts still uncommitted.
 *
 * ONE "AND" PER SENTENCE. The same draft ended "the run ends and your roster
 * is wiped" — two consequences joined to a condition that already had an
 * "and" in it. The wipe IS the run ending, so only one of them needs saying.
 */
function runLine(run: Run): string {
  const end = 'the roster is wiped';
  const free = run.hearts - run.wagered;

  if (run.hearts === 1) {
    return run.wagered > 0
      ? `Your last heart is riding — lose it and ${end}`
      : `One heart left — lose it and ${end}`;
  }
  if (free <= 0) return `All ${run.hearts} riding — lose them and ${end}`;
  if (run.wagered > 0) {
    return `${run.wagered} riding, ${free} free — lose all ${run.hearts} and ${end}`;
  }
  return `Nothing riding yet — lose all ${run.hearts} and ${end}`;
}

const styles = StyleSheet.create({
  /* No plane of its own: `SheetToneBand` paints it and owns the geometry that
     makes it reach. A background or a negative margin here would double the
     escape and hang the fill 16pt off each edge of the screen. */
  band: { paddingTop: Spacing.two, paddingBottom: Spacing.two + 2, gap: Spacing.half },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* `Type.page` is 26 on a 30 line box and this is 13 on 17: centring the two
     leaves the small one floating above the title's baseline. The offset is
     the difference in their descenders. */
  record: { alignSelf: 'flex-end', paddingBottom: 4 },
  spacer: { flex: 1 },
  /* The masthead's own pill, at the masthead's own size — see `AppHeader`. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    paddingHorizontal: Spacing.two,
    height: 26,
    borderRadius: 13,
  },
});
