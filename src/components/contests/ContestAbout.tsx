/**
 * What a contest actually is, written out.
 *
 * ---------------------------------------------------------------------------
 * THE CARD PRICES IT. THIS EXPLAINS IT.
 * ---------------------------------------------------------------------------
 *
 * `ContestCard` is eleven facts in 164 points and every string on it is fixed
 * to one line — which is the right shape for something you compare against four
 * other cards, and the wrong shape for a rule. "Top 3 of 12 win" is a price
 * tag; it does not say that the pool is weighted by place, that the fee funds
 * it, that a loss takes a heart, or that a card spent here cannot play anywhere
 * else this week.
 *
 * Those sentences existed nowhere. The contest page carried two paragraphs of
 * prose — the exclusivity rule and the career-FP argument — floating between an
 * entry panel and a lineup editor, and everything else a player might want to
 * know was either on a card in eight characters or in a migration comment.
 *
 * ---------------------------------------------------------------------------
 * FACTS, NOT A FAQ
 * ---------------------------------------------------------------------------
 *
 * Every row is a TERM and its consequence, in the order a reader meets them:
 * what it asks of your roster, how it is won, where the money is, what it costs
 * you to lose, when it stops being editable, and how the points are counted.
 * Nothing here is a heading you have to open, because a rule behind a
 * disclosure is a rule nobody reads.
 *
 * IT DERIVES EVERY NUMBER FROM `ContestTerms` rather than restating constants.
 * The pool share, the top prize and the minimum field are the same arithmetic
 * the card and the server use — see `contest-model` — so this cannot come to
 * disagree with the row that was tapped to reach it.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Hearts } from '@/components/runs/Hearts';
import { Panel } from '@/components/ui/Panel';
import { MIN_ENTRANTS } from '@/components/lineup/field';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerState } from '@/context/PlayerContext';

import { formatLine, payingPlaces, topPrize, winLine, type ContestTerms } from './contest-model';

export function ContestAbout({
  terms,
  name,
  title = 'How it works',
  prizePoolBps,
  leavable,
  run,
}: {
  terms: ContestTerms;
  name: string;
  /** "" where a tab above already says what this is. See `ContestFieldPanel`. */
  title?: string;
  /** Share of collected fees that is paid back out, in basis points. */
  prizePoolBps: number;
  /**
   * There is still a way out of this contest to describe.
   *
   * False on the free contest — nobody joined it and nobody can leave it — and
   * false on a week that is over, where the rule is still true and no longer
   * useful. A finished contest telling you how to withdraw from it is a page
   * that has not noticed what week it is.
   */
  leavable: boolean;
  /**
   * THE READER'S OWN RACK, not a picture of a heart.
   *
   * This row drew a single `Heart state="wagered"` — the blade-through glyph
   * that means "this one is committed" — as decoration beside the stake. Two
   * things were wrong with it. It asserted a state that was not the reader's:
   * on a contest you have not entered, nothing is staked. And it spent the
   * row's one graphic on a symbol when the actual question is *how many have I
   * got left*, which is the whole reason the rack exists.
   *
   * A PROP RATHER THAN `usePlayer()`, because this component is in the kit and
   * the kit lives outside `PlayerProvider` — a hook here would throw on the one
   * page built to render every state of it. Null draws nothing, which is what
   * a player with no run yet gets.
   */
  run: PlayerState['run'];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();

  const top = topPrize(terms);
  const share = Math.round(prizePoolBps / 100);
  const places = payingPlaces(terms);

  return (
    <Panel title={title} inset={false}>
      <View>
        <Fact term="The roster" body={formatLine(terms, name)}>
          A card can only play in one contest a week. Whatever you field here
          comes out of the cards you are not already playing — entering a second
          contest means playing deeper into your bench, not playing the same
          eight cards twice.
        </Fact>

        <Fact term="Winning" body={winLine(terms)}>
          {winningProse(terms, places, top)}
        </Fact>

        <Fact
          term="The pool"
          body={
            terms.entryFeeCoins > 0
              ? terms.prizePool > 0
                ? `${terms.prizePool} coins so far`
                : 'Nothing in it yet'
              : 'No pool — this one is free'
          }>
          {terms.entryFeeCoins > 0
            ? `${share}% of every entry fee goes into the pool and the rest leaves the economy. It is funded by the people in it, so it is genuinely small in a young contest and grows with every entry. Nothing is ever minted to make it look bigger.`
            : `A free contest collects nothing, so there is nothing to split. What it pays is what every contest pays — see below.`}
        </Fact>

        {/* THE BASELINE, ON EVERY CONTEST, IN THE SAME WORDS.

            This row is not about this contest. That is the point of it: the
            per-point rate is what a CARD earns for being started anywhere, and
            printing it only where there was no pool to print instead — which is
            what the app used to do — made the one universal thing in the game
            look like the free contest's perk.

            It reads as the floor under the whole lobby precisely because it is
            identical on all nine rows. The rate itself comes down from
            `score_rate()` and is never written here, so this sentence cannot
            advertise a number the payout is not using. */}
        {terms.scoreRate > 0 ? (
        <Fact term="Every start" body={`${terms.scoreRate} coins a point`}>
          {`Every card you field earns coins for what it scores, in this contest and in all of them — ${terms.scoreRate} a point, multiplied by that card's tier, from ×1.0 at bronze to ×1.4 at diamond. It is paid whether you win or lose${terms.entryFeeCoins > 0 ? ' and it is on top of anything the pool pays' : ''}, which is why a card sitting on your bench is the only card in your collection earning nothing at all.`}
        </Fact>
        ) : null}

        {terms.heartsAtRisk > 0 || terms.heartsOnWin > 0 ? (
          <Fact
            term="Your run"
            body={
              terms.heartsAtRisk > 0
                ? `${terms.heartsAtRisk === 1 ? '1 heart' : `${terms.heartsAtRisk} hearts`} on the line`
                : 'Nothing at risk'
            }
            mark={
              run ? (
                /* Staked pips are marked here too — see the note on the
                   board's rail for why they came back. This row says what you
                   HOLD and which of those are already riding; the words beside
                   it say what THIS contest asks you to put up on top. */
                <Hearts hearts={run.hearts} wagered={run.wagered} rack={run.rack} size={13} />
              ) : undefined
            }>
            {terms.heartsAtRisk > 0
              ? `Losing here costs your run ${terms.heartsAtRisk === 1 ? 'a heart' : `${terms.heartsAtRisk} hearts`}, and a run with no hearts left is wiped.${terms.heartsOnWin > 0 ? ` Winning heals ${terms.heartsOnWin === 1 ? 'one' : String(terms.heartsOnWin)}, up to the rack you have earned.` : ''}`
              : `This one cannot end a run. Winning still heals ${terms.heartsOnWin === 1 ? 'a heart' : `${terms.heartsOnWin} hearts`}.`}
          </Fact>
        ) : null}

        <Fact term="Locking" body="One card at a time">
          Nothing locks at a single deadline. Each card is fixed when its own
          game kicks off, so a lineup stays editable in the slots whose players
          have not played yet — and an entry is only final once its last game has
          started.
        </Fact>

        <Fact term="The field" body={`Needs ${MIN_ENTRANTS} entries to settle`}>
          Scores are ranked against everybody who filed. A contest that never
          reaches {MIN_ENTRANTS} entries has no field to be ranked in and settles
          as nothing, whatever anybody scores — which is why an early entry is
          worth something in a contest that pays by place.
        </Fact>

        {leavable ? (
          <Fact term="Leaving" body={terms.entryFeeCoins > 0 ? 'Full refund' : 'Any time'}>
            You can leave while every card in your lineup is still ahead of its
            kickoff. The lineup is deleted, the cards go back to your bench free
            to play elsewhere
            {terms.entryFeeCoins > 0
              ? `, and the ${terms.entryFeeCoins} coins return in full`
              : ''}
            . Once one of your players has started, the entry stands.
          </Fact>
        ) : null}

        {/* THE ONE ROW THAT LEADS SOMEWHERE. Scoring is the same ruleset for
            every contest in the app, so restating it here would be a copy that
            drifts — `scoring.tsx` reads the ACTIVE row out of `scoring_rules`
            and is the only true statement of it. */}
        <Pressable
          onPress={() => router.push('/scoring')}
          accessibilityRole="button"
          accessibilityLabel="Read how fantasy points are scored"
          style={({ pressed }) => [
            styles.fact,
            styles.link,
            { borderColor: c.border },
            pressed && styles.pressed,
          ]}>
          <View style={styles.head}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>SCORING</Text>
            <Text style={[Type.strong, { color: c.text }]}>Every contest, one ruleset</Text>
          </View>
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            Points come from the game&apos;s own scoring rules — the same ones on
            every board and every card in the app. Read them in full.
          </Text>
          <Text style={[Type.fine, styles.cta, { color: c.text }]}>How scoring works →</Text>
        </Pressable>

        {/* WHY YOU ACTUALLY ENTER, and it is deliberately last: it is an
            argument rather than a rule. The reward column on the card is coins
            because coins are a balance a reader keeps score in; career FP is the
            real return and had nowhere to be made, because next to "40 coins" in
            a fixed-width column it read as small print. */}
        <View style={[styles.fact, styles.last]}>
          <View style={styles.head}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>WHY BOTHER</Text>
            <Text style={[Type.strong, { color: c.text }]}>The coins are not the point</Text>
          </View>
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            The coins are the chase. What an entry actually buys is career FP on
            cards that were earning nothing — every start moves a card up its
            tier ladder, and the tier those cards climb is the one thing packs
            cannot sell you.
          </Text>
        </View>
      </View>
    </Panel>
  );
}

/**
 * One rule: a label, the short answer, and the sentence that qualifies it.
 *
 * THE SHORT ANSWER IS THE LINE PEOPLE READ. Somebody skimming this panel gets
 * "Beat the median / 240 coins so far / 1 heart on the line" down the left of the
 * page and can stop there; the paragraph under it is for the reader who has
 * stopped on that row. Both are always drawn, because a rule that hides its own
 * explanation behind a tap is a rule nobody reads.
 */
/**
 * WHAT "WINNING" MEANS HERE, in the two or three sentences the row has room for.
 *
 * One function rather than a ternary in the JSX because there are four rules
 * now and each has a different thing worth saying — how many places pay, how
 * hard the line is, and whether the pool is shared or concentrated. A nested
 * conditional expression covering four cases is where this kind of copy goes to
 * become unreadable and then wrong.
 *
 * THE CURVE IS THE HALF THAT USED TO BE MISSING. "Top 3 win" says who is paid
 * and says nothing about whether first place is worth chasing, and those are
 * different questions with the same answer only under `flat`. So the shape of
 * the split is named in words wherever there is a top prize to name.
 */
function winningProse(
  terms: ContestTerms,
  places: number | null,
  top: number | null,
): string {
  const asPool = top !== null ? `, about ${top} coins as the pool stands` : '';

  if (terms.winCondition === 'target' && terms.targetPoints !== null) {
    return `You need ${terms.targetPoints} points from ${terms.slotCount} cards. Everyone who clears the bar wins and everyone who does not loses — there is no field to beat, so this one settles even if you are the only entry, and nobody else scoring well can take it away from you.`;
  }

  if (terms.winCondition === 'top_pct' && terms.winPct !== null) {
    const scaled =
      places !== null
        ? `With ${terms.entrants} in, that is ${places === 1 ? 'one place' : `${places} places`}.`
        : 'The number of places grows with the field.';
    return terms.payoutCurve === 'flat'
      ? `The top ${terms.winPct}% are paid and every winner takes the same${asPool}. ${scaled} Scraping in pays exactly what running away with it pays, so this one is about not losing rather than about being first.`
      : `The top ${terms.winPct}% are paid, weighted by place — first takes the largest share${asPool}. ${scaled}`;
  }

  if (terms.winCondition === 'top_n' && terms.winRank !== null) {
    return terms.payoutCurve === 'winner_take_all'
      ? `One place, and it takes the whole pool${asPool}. There is no second prize here.`
      : `Only the first ${terms.winRank} places are paid, and the pool is weighted by place — first takes the largest share${asPool}. Most of this field loses.`;
  }

  return `Every entry that beats the middle score of the field wins, and the winners split the pool equally. It is close to even money: what you are being paid for is finishing above half the people who filed.`;
}

function Fact({
  term,
  body,
  mark,
  children,
}: {
  term: string;
  body: string;
  /** A glyph beside the short answer — the heart, on the run's row. */
  mark?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.fact, { borderColor: c.border }]}>
      <View style={styles.head}>
        <Text style={[Type.micro, { color: c.textTertiary }]}>{term.toUpperCase()}</Text>
        <View style={styles.answer}>
          {mark}
          <Text style={[Type.strong, { color: c.text }]}>{body}</Text>
        </View>
      </View>
      <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Hairline BETWEEN rows rather than a box around each: this is one document,
     not a stack of cards, and a border per rule would make six panels of it. */
  fact: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: { borderBottomWidth: 0 },
  head: { gap: 1 },
  answer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  /* The one pressable row gets its own edges, so it does not read as prose that
     happens to respond to a tap. */
  link: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    marginVertical: Spacing.two,
  },
  cta: { fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
