import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContestCard, StatusWord } from '@/components/contests/ContestCard';
import { settlementOf } from '@/components/contests/contest-model';
import { termsOfContest, useContests, type Contest } from '@/components/contests/use-contests';
import { termsOfEntry, useMyContests, type MyContest } from '@/components/contests/use-my-contests';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import {
  ContestHistoryPanel,
  historySummary,
} from '@/components/contests/ContestHistoryPanel';
import { ContestRecapPanel, weekLabel } from '@/components/contests/ContestRecapPanel';
import {
  useContestHistory,
  type HistoryEntry,
} from '@/components/contests/use-contest-history';
import { LobbyHero } from './LobbyHero';
import { useRunLadder } from '@/components/runs/use-run-ladder';
import { weekTitleOf } from '@/components/contests/use-my-contests';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Every contest on this week's slate, and which of them you have filed for.
 *
 * IT IS A VIEW INSIDE `ContestSheet`, NOT A ROUTE. It was `app/(app)/contests`
 * and it is the bottom frame of the sheet's stack now — see the header there
 * for why a contest, a rival's team and this lobby are three faces of one
 * presented sheet rather than three sheets on top of each other.
 *
 * IT IS A SHEET NOW, over the lineup, and it used to be a page beside it under
 * a two-item bar. What changed is not where the contests live but what the
 * lobby IS: not a second view of the Compete board — the board is the lineup —
 * but a place you open, enter something from, and put down again, which is the
 * same object as a pack shelf or a set checklist and now takes the same
 * presentation. The way in is the last card of the lineup carousel; see
 * `CONTESTS` in `sections.ts` for what that fixed.
 *
 * WHAT THIS SCREEN IS FOR, and why it is not just a list.
 *
 * The rule that makes contests worth having is that a card plays in ONE of them
 * a week (`card_plays_one_contest`, 20260825010000). Without it a second
 * contest is another place to park the same eight cards and the bench gets more
 * comfortable; with it, each contest is a claim on the roster, and the cards
 * behind your starters have to come out to meet it. That rule is invisible on
 * the lineup screen — you only meet it when a card you wanted is already
 * playing somewhere else — so this page has to state it rather than wait to
 * enforce it. Hence the footnote under the list, which is not decoration.
 *
 * IT IS THE WHOLE WEEK NOW, IN FOUR SECTIONS: what you are in and playing,
 * what has finished, what is coming, and what is open. It used to be the last
 * of those alone — "contests you could join, not ones you are in" — because
 * your entries lived on the board's carousel over the lineup each belongs to,
 * and showing them in both places would make "where do I edit this" a question
 * with two answers, with the losing answer still one tap away. That is how two
 * editors get built, and it was the right thing to be afraid of.
 *
 * WHAT CLOSED IT IS THAT A CONTEST'S PAGE STOPPED BEING AN EDITOR. It is a
 * card, your lineup read-only, the field, and the rules; the single editor for
 * an entry is still the board, behind one button on one of those tabs. A list
 * pointing at that page is a second way to READ something there is still only
 * one way to change, which forks nothing.
 *
 * The free contest is IN the entered section and out of the open one, which is
 * the same fact from both ends: nobody chose it and nobody can leave it, so it
 * is not a thing to browse — and it is the contest every player is in every
 * week, which had made it the one contest this sheet never mentioned.
 *
 * THERE IS ONE LOBBY CONTEST AND IT COSTS COINS. The fee is not flavour: a
 * second contest is a second source of score coins (`award_score_coins` pays 1.5
 * a point on every slot in every lineup filed), so a free-to-enter lobby is a
 * faucet with no tap. `20260825050000` sets out how 40 was arrived at.
 *
 * IF IT COSTS COINS IT PAYS COINS, and the database will not let a contest exist
 * otherwise (`contests_paid_contests_pay_out`, 20260826020000). The pool is 25%
 * of the fees that contest has collected — redistribution, never a grant — so
 * it is genuinely small in a four-tester week and grows with the field. The
 * card says the real figure and says what moves it; rounding it up to something
 * respectable would be the mint that inverts the fee's whole justification.
 *
 * WHAT AN ENTRY IS ACTUALLY FOR IS STILL TIER. career_fp on cards that were
 * earning nothing is the reason to enter and the pool is the chase — the
 * expected prize is deliberately below what the entry costs net of score coins,
 * which is what stops the lobby becoming an arbitrage run with three bad cards.
 * That is why the reward column names the career_fp as well as the coins.
 *
 * WHICH IS THE OTHER THING THIS SCREEN HAS TO SAY. Some of these contests can
 * end your run (`hearts_at_risk`, 20260825130000) and some cannot, and nothing
 * about a fee or a format tells them apart — both cost the same 40 coins. A
 * player who enters a run-ending contest without being told it was one has been
 * ambushed by their own lobby, so the stake is drawn on the card itself rather
 * than left to the contest page to disclose after the tap.
 *
 * THE STAKE MARK IS ONLY ON CARDS THAT HAVE ONE. A "0 hearts" note on the safe
 * contests would make the safe thing look like a lesser version of the risky
 * one, when it is simply a different offer.
 */
/**
 * Which of the sheet's two faces is showing.
 *
 * ONE SHEET, TWO VIEWS, rather than two sheets. The archive was a presented
 * route for about an hour and it put a popup over a popup — two ✕s, and a back
 * gesture nobody expects. See the note on `ContestHistoryPanel`.
 */
type View_ = 'open' | 'history' | 'recap';

export function LobbyView({
  arrivedOn,
  onClose,
  onOpenContest,
}: {
  /**
   * WHICH SHELF THIS OPENED ON, from the route.
   *
   * The lineup board's rail has two doors into this screen — `+ Contests` and
   * `Weeks` — and they want different faces of it. The param is read ONCE, as
   * `useState`'s initial value below, which is what makes it an opening
   * position rather than a controlled prop: switching views inside the sheet
   * must not have to write back to the URL, and coming back from a recap must
   * not snap the reader to the shelf they arrived on twenty taps ago.
   *
   * Anything other than `history` opens the lobby, so a hand-typed or stale URL
   * lands somewhere sensible rather than nowhere.
   */
  arrivedOn?: string;
  onClose: () => void;
  /** Push a contest onto the sheet's stack, by code. Was `router.push`. */
  onOpenContest: (code: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const [view, setView] = useState<View_>(arrivedOn === 'history' ? 'history' : 'open');
  /**
   * WHICH OF THE FOUR SHELVES THE LOBBY IS SHOWING.
   *
   * IT OPENS ON `open`, because that is what the door says. The board's rail
   * has two ways in — `+ Contests` and `Weeks` — and a reader who pressed the
   * first came to enter something. The second lands on the season archive
   * through `view`, one layer up from these tabs, so it never needs a face
   * here.
   *
   * SEPARATE FROM `view`, which is a takeover rather than a tab: the archive
   * and a recap replace the whole sheet and come back through a ‹ row, because
   * one is a paged season and the other is a single week read in full. A tab
   * bar is for things that are peers.
   */
  /* The contest being read, carried rather than looked up: a row from week two
     is older than anything `contest_lobby` can answer about, and every figure
     the recap needs is already on the row. See `ContestRecapPanel`. */
  const [reading, setReading] = useState<HistoryEntry | null>(null);
  /* Stays enabled once the archive has been opened, so coming back from a
     recap does not refetch the season. */
  const history = useContestHistory(view === 'history' || view === 'recap');
  const { contests, loading, error } = useContests();
  /**
   * THE WEEKS THAT ARE OVER, and they are a different read from the lobby's.
   *
   * `contest_lobby` carries last week's entries so their page stays openable,
   * but its `mine` is only a lineup id and a slot count — it cannot say whether
   * you won, what the field did, or what you were paid. `my_contest_cards` is
   * the read that carries a distribution, a cut, a prize and the coins the
   * payout stamped, which is exactly the set of facts a settled card draws. It
   * is the board's own query, so nothing new is being asked of the server.
   */
  const { contests: mine } = useMyContests();
  /* Four rows of config behind the header's ladder — see `useRunLadder`. */
  const { rungs } = useRunLadder();
  const { coins, run } = usePlayer();

  /* THE OPEN LIST IS WHAT YOU ARE NOT ALREADY IN, which is now a statement
     about this one section rather than about the sheet — the contests you have
     entered are a section of their own above it, drawn from a different read.
     A contest cannot be entered twice, so an entry in the open list would be an
     offer that `set_lineup` refuses.

     The free contest is not in this list: nobody chose it and nobody can leave
     it, so it is not something to browse. It appears under Entered, where it
     belongs, along with everything else you are in.

     NEITHER DOES A CONTEST BEING RECAPPED. `contest_lobby` carries last week's
     entries so that the recap card on the board has a page to open — see
     `20260830030000` — and this is a list of things you can still enter. They
     were already out of `open` by the `mine === null` test, since a recap row
     only exists where you filed; the count is the one that would have been
     wrong, reporting a finished week's entries as contests you are in. */
  /**
   * WHAT IS OVER, KEYED ON THE WEEK BEING FINAL RATHER THAN ON `recap`.
   *
   * `recap` means the BOARD has moved to a new slate, which happens days after
   * the last whistle — so a results section gated on it would have nothing in
   * it for the whole of Monday and Tuesday, which is precisely when a player
   * opens this sheet to find out how they did. The test is the one `StatusMark`
   * draws FINAL from, and for the same reason: `score_week` stamps a stored
   * nought whether or not a ball was thrown, so the field's best score is the
   * only honest proof that anybody played.
   *
   * IT EMPTIES ITSELF. These rows live in `my_contest_cards`' two-week window,
   * so the section is here while the results are news and gone once they are
   * history — which is what earns it the top of the sheet without permanently
   * pushing this week's contests down.
   */
  const finished = (mine ?? []).filter((m) => m.field.final && m.field.high > 0);

  /**
   * WHAT YOU ARE IN AND STILL PLAYING, which is everything else you have filed.
   *
   * `recap` rows are excluded rather than merely unlikely: a contest the board
   * has moved past belongs to the section above whether or not the sweep has
   * reached it, and a finished week appearing under "entered" would be an offer
   * to go and watch a game that is over.
   */
  const playing = (mine ?? []).filter(
    (m) => !m.recap && !(m.field.final && m.field.high > 0),
  );

  const live = (contests ?? []).filter((c) => !c.recap);
  /* WHICH WEEK THESE CONTESTS ARE, taken off the slate rather than from a
     clock: the lobby is whatever `contest_lobby` says is enterable, and asking
     the device what week it is would be a second opinion that can differ. */
  const week = live.length > 0 ? weekTitleOf(live[0].seasonType, live[0].week) : undefined;
  const open = live.filter((c) => c.kind !== 'free' && c.mine === null);

  /**
   * THE BAR, WITH THE COUNTS ON IT.
   *
   * A count only appears where there is something to count: a `0` beside a tab
   * is a number the reader has to read before learning there is nothing there,
   * where the absence of one says the same thing without being read at all.
   * `Friendly` never carries one — it is a promise, and a promise with a
   * quantity on it is a different and much bigger claim.
   */

  const context =
    view === 'recap'
      ? reading
        ? weekLabel(reading.seasonType, reading.week)
        : undefined
      : view === 'history'
        ? historySummary(history.entries, history.loading, history.done)
        : /* THE RULE, ALWAYS. The count used to share this line because there
             was nowhere else to put it; it rides on the `Open` tab now, and a
             subtitle repeating a number that is visible two rows down is the
             sheet saying one thing twice. */
          'One card plays one contest a week';

  return (
    /* `surface` — THE PINNED STRIP IS THE BAND, CONTINUED. Without it the
       header that survives a scroll reverts to `surfaceSheet`, so the top of
       the screen changes colour the moment the real band leaves it: the same
       seam this sheet has now spent three passes closing, reappearing as soon
       as you scroll. */
    <PlayerSheetFrame
      surface={c.backgroundElement}
      title={
        view === 'recap' ? (reading?.name ?? 'Contest') : view === 'history' ? 'Recent contests' : 'Contests'
      }
      /* The count, or the rule when there is nothing to count. The sheet's
         subtitle is the one line a reader gets before the list, so it says
         whichever of the two is news. */
      subtitle={context}
      onClose={onClose}
      closeLabel="Close contests">
      {view === 'recap' && reading ? (
        <ContestRecapPanel
          entry={reading}
          /* NO `onOpenEntry` ANY MORE, and it was the last push on this path.
             A rival's team was a route, then a frame on this sheet's stack, and
             is now drawn where it is asked for — inside the row of the field
             that names them. See the header on `ContestFieldPanel`. */
          onBack={() => setView('history')}
        />
      ) : view === 'history' ? (
        <ContestHistoryPanel
          {...history}
          onBack={() => setView('open')}
          onOpen={(e) => {
            setReading(e);
            setView('recap');
          }}
        />
      ) : (
        <>
      {error ? <ErrorLine message={error} /> : null}

      {/* THE HEADER IS A BLOCK THAT ENDS ON THE TABS, which is the set sheet's
          arrangement and the reason its header reads as one object rather than
          as a title with loose rows under it. Everything inside the band
          answers "what is my run"; everything below it is contests.

          THE RUN IS THE SUBJECT because nothing under it can be read without
          it: every stake on this sheet is priced in hearts, and a player
          deciding whether to risk one needs to know how many are left in the
          same glance. It is also the only full rack left on a phone now that
          the masthead has stopped drawing one — see `AppHeader`. The carousel
          shows the hearts a contest you are IN has on the line; this shows the
          run they come out of, which is the fact you need before entering
          another.

          A DEAD RUN IS NOT PART OF THE HEADER. It is a call to action with
          cards hanging on it, and it belongs where the eye lands after the
          header rather than inside a block about standings — see `RunRail`. */}
      {/* THE HEADER IS A BAND AND THE PAGE IS FOUR NAMED LISTS.
          It was a band that ended on a four-tab bar — Open, Entered, Recent,
          Friendly — and that bar was a real answer to a real problem: the four
          shelves had been four stacked panels, so the sheet was four lists deep
          and the one you came for was wherever the file happened to declare it.
          Tabs made them peers, one tap apart.

          What tabs cost is that three quarters of the page is always hidden,
          and on this sheet the hidden part is the part that changes. The old
          bar's own comment conceded the ranking problem and then declined to
          rank — Sunday wants Entered, Monday wants Recent, every other day
          wants the open lobby.

          SO THE SHELVES SURVIVED AND THE BAR DID NOT. They are headings on one
          scroll, in the order a week is lived: what you are IN, what has
          FINISHED, what you can still enter, and the lobby that does not exist
          yet. Nothing is behind a tap, and the ranking a tab bar refused to
          make is made by the order.

          AN EARLIER DRAFT MERGED ENTERED AND RECENT into one "Your contests"
          list on the argument that they are the same object at two moments.
          They are, and it still read wrong: `recap_slate()` keeps LAST week's
          result on screen until there is new football, so a settled preseason
          contest sat under a heading about this week, inside its count. Two
          headings cost one line and stop the page claiming a week it is not
          about. */}
      {/* THE BAND CLIMBS OVER THE GRABBER AND INTO THE OVERSCROLL, which is
          what `SheetToneBand` is for and why the header goes back inside it.
          Painting the plane inside `LobbyHero` got the colour right and the
          EXTENT wrong: the sheet's floating handle stayed on `surfaceSheet`
          above a `backgroundElement` header, so the top of the screen was two
          greys with a seam across it — and a hard flick back to the top
          rubber-banded the sheet's colour into the gap above the band. This
          reaches `HANDLE_BLOCK + OVERSCROLL_REACH` above its own content
          precisely so neither can happen. A surface rather than a tone: see
          the prop's own note. */}
      <SheetToneBand surface={c.backgroundElement}>
        <LobbyHero run={run} rungs={rungs} week={week} />
      </SheetToneBand>

      {run?.awaitingCarry ? <DeadRun run={run} onClaim={() => router.push('/run-over')} /> : null}

      <Section
        label="Entered"
        count={playing.length}
        hint="Filed for this week. Tap one to see the field.">
        <View style={styles.stack}>
        {playing.length > 0 ? (
          playing.map((m) => (
            <LiveEntry key={m.id} entry={m} onPress={() => onOpenContest(m.code)} />
          ))
        ) : loading ? null : (
          <SectionEmpty text="Nothing filed yet. What you enter shows up here for the week." />
          )}
        </View>
      </Section>

      {/* THE ARCHIVE RIDES THE HEADING, right-aligned. It was tried on its own
          line under the list, on the argument that a door and a title are two
          unrelated things to share a row. On screen the opposite reads better:
          a bare link floating between two shelves has nothing to belong to,
          while up here it is unmistakably the rest of THIS list — the two-week
          window is inline, the season is one tap further on. */}
      <Section
        label="Recent"
        count={finished.length}
        hint="Settled, with what each one paid."
        action={<ArchiveLink onPress={() => setView('history')} />}>
        <View style={styles.stack}>
        {finished.length > 0 ? (
          finished.map((m) => (
            <SettledEntry key={m.id} entry={m} onPress={() => onOpenContest(m.code)} />
          ))
        ) : loading ? null : (
          <SectionEmpty text="Results land here when the week is swept." />
          )}
        </View>
      </Section>

      {/* COMMUNITY, because that is what it is: the lobby everybody shares, as
          opposed to the one you assemble yourself below. It was called "Open",
          which described its STATE rather than its kind — and once Friendly
          sits under it on the same scroll, "open" stops distinguishing the two
          (a friendly contest is open too). */}
      <Section
        label="Community"
        count={open.length}
        hint="Open to every manager. A new slate each week.">
        <View style={styles.stack}>
        {open.length > 0 ? (
          open.map((c) => (
            <ContestEntry key={c.id} contest={c} coins={coins} onPress={() => onOpenContest(c.code)} />
          ))
        ) : loading ? null : (
          <SectionEmpty
            text={
              playing.length > 0
                ? "You're in everything this week's slate has."
                : 'Extra contests appear here each week.'
            }
          />
          )}
        </View>
      </Section>
      {/* THE EXCLUSIVITY RULE SITS UNDER THE COMMUNITY LIST and nowhere else.
          It is about what entering ANOTHER contest costs you, which is a
          sentence for somebody looking at a list of contests to enter. */}
      <Footnote />

      {/* FRIENDLY, NAMED BEFORE IT EXISTS.
          A previous pass deleted this as "an empty shelf naming a feature that
          does not exist". That was the wrong call: a lobby with one kind of
          contest in it does not tell a player the other kind is coming, and the
          shelf is one quiet row. It is the cheapest possible promise. */}
      <Section label="Friendly" count={0} hint="Play a week against people you invite.">
        <ComingSoon />
      </Section>

        </>
      )}
    </PlayerSheetFrame>
  );
}

/**
 * A run that has ended and is waiting to be settled.
 *
 * ---------------------------------------------------------------------------
 * IT IS THE ONLY RUN STATE LEFT IN THIS FILE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * A live run used to be drawn here too — as a status line, then as a filled
 * panel, then as a one-row rail — and it is the header now (`LobbyHero`). The
 * two states were never variations of each other and the split makes that
 * legible rather than merely true.
 *
 * A LIVE RUN IS A STANDING. Hearts, a record, a ladder: read every week, asking
 * for nothing, and therefore something to put in a header where a reader takes
 * it in on the way past.
 *
 * A DEAD RUN IS A QUESTION WITH CARDS HANGING ON IT. Nothing with hearts on it
 * can be entered until it is answered, and `current_run` will not start a new
 * run over it — so it is drawn in the negative colour, given a button, and
 * placed BELOW the header where the eye lands after reading it rather than
 * inside a block about standings.
 *
 * It does not replace the lobby or block it. The free contest is still live and
 * still needs a lineup — see the note on presentation in `_layout` for why a
 * death is never allowed to become a lockout.
 */
function DeadRun({
  run,
  onClaim,
}: {
  run: NonNullable<ReturnType<typeof usePlayer>['run']>;
  onClaim: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onClaim}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.dead,
        { borderColor: c.negative },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowText}>
        <Text style={[Type.strong, { color: c.text }]}>Your run ended</Text>
        <Text style={[Type.fine, { color: c.textSecondary }]}>
          {run.carrySlots > 0
            ? `${run.wins} wins — bring ${run.carrySlots} card${run.carrySlots === 1 ? '' : 's'} back.`
            : 'Nothing comes back. Start the next one.'}
        </Text>
      </View>
      <StatusChip label="Open" tone="warning" />
    </Pressable>
  );
}

/** The loader's failure, said once at the top rather than per panel. */
function ErrorLine({ message }: { message: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <Text style={[Type.fine, { color: c.negative }]}>{message}</Text>;
}

/**
 * One contest you could enter, as a card.
 *
 * IT WAS A ROW AND THAT WAS THE PROBLEM. A lobby row and the card that appears
 * over your lineup once you enter were two different-looking objects describing
 * one contest — so the moment a player most needs to recognise what they just
 * joined was the moment it changed shape. The card is the contest's identity
 * now, and the lobby draws the same one, minus the scoring band it has nothing
 * to put in.
 *
 * THIS FUNCTION OWNS ONE THING: what is still WRONG. Everything else the row
 * used to compose by hand — the price, the win condition, the seats, the stake
 * — is the card's, built from `contest-model` so that no two surfaces can word
 * the same fact differently.
 */
function ContestEntry({
  contest,
  coins,
  onPress,
}: {
  contest: Contest;
  /** The reader's balance, so the shortfall can be said as a number. */
  coins: number;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* ONE STATE, BECAUSE THIS SHELF ONLY HOLDS ONE KIND OF ROW. It used to test
     four — "Not set", "5 of 8", "Lineup in", "Not enough coins" — and three of
     them have been unreachable since the list started filtering on `mine ===
     null`: a contest you have entered is under Entered. What is left is the
     only question this tab asks.

     AND IT IS NOT "ENTER". Every card here can be entered; a word saying so on
     each of them is the door with the word "door" written on it, and it spent
     the corner that the one card you CANNOT enter needs.

     THE SHORTFALL IS A NUMBER, NOT A CONDITION. "Not enough coins" tells you to
     go and count; `40 COINS SHORT` tells you what the trip is for. It falls
     back to the words when the arithmetic does not come out positive — the
     server owns `affordable`, and a balance that has moved under a cached row
     must not produce `0 COINS SHORT`. */
  const short = contest.entryFeeCoins - coins;
  const blocked = contest.entryFeeCoins > 0 && !contest.affordable;

  /* NOT DISABLED, DIMMED. The contest page behind this is where you find out
     what the entry buys and how far off you are — it is worth reading before
     you can afford it, so the card stays live and merely stops competing with
     the ones you can act on. */
  return (
    <View style={blocked ? styles.blocked : undefined}>
      <ContestCard
        name={contest.name}
        terms={termsOfContest(contest)}
        /* NO SCORING BAND. There is no score, no standing and no pace on a
           contest you have not entered — the band drew NOT ENTERED over ninety
           points of reserved air, which on a list of four was most of the list.
           Everything else about the card is identical to the one that appears
           over your lineup the moment you enter. */
        scoring={false}
        /* THE CORNER, EMPTY OR HOLDING THE ONE THING THAT STOPS YOU. Explicit
           null rather than nothing: an absent prop asks the card to draw its
           own status, and `list_open_contests` carries no lock to count down
           with, so it would draw a divider against a blank. */
        status={
          blocked ? (
            <StatusWord
              text={short > 0 ? `${short} COINS SHORT` : 'NOT ENOUGH COINS'}
              color={c.warning}
              numeric={short > 0}
            />
          ) : null
        }
        onPress={onPress}
      />
    </View>
  );
}

/**
 * A contest you are in and still playing.
 *
 * COLLAPSED, LIKE EVERY OTHER CARD ON THIS SHEET. The scoring band belongs to
 * the two surfaces that are ABOUT one contest — the carousel over the lineup it
 * belongs to, and the contest's own page — and a lobby is a list of contests
 * rather than a stack of scoreboards. Tapping opens the page where the band is
 * drawn, which is the same bargain the recent cards make.
 *
 * THE CORNER ANSWERS "IS THERE ANYTHING FOR ME TO DO", in the order the answers
 * matter. A week that has started is `LIVE` and there is nothing to do but
 * watch. Before that, a lineup with an empty slot is the only actionable thing
 * on this whole sheet — it is a contest you have already paid for that cannot
 * win — so it is said as the count, in the same warning colour the open list
 * uses for a contest you cannot afford. A complete lineup says so quietly.
 *
 * NO COUNTDOWN, and that is a data fact rather than a design one. The card's
 * corner draws a deadline where it is given one, and `my_contest_cards` carries
 * no kickoff time — the board computes that from the slate it is already
 * holding. Inventing one here would mean a second source for the one number a
 * reader would act on.
 *
 * NO WEEK LABEL EITHER. Everything in this section is the current week, which
 * the sheet is already about; the recent cards name their week precisely
 * because they are the ones that are not.
 */
function LiveEntry({ entry, onPress }: { entry: MyContest; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const playing = entry.field.high > 0;
  const short = entry.filled < entry.slotCount;

  return (
    <ContestCard
      name={entry.name}
      terms={termsOfEntry(entry)}
      scoring={false}
      status={
        playing ? (
          <StatusWord text="LIVE" color={c.live} />
        ) : short ? (
          <StatusWord text={`${entry.filled} OF ${entry.slotCount}`} color={c.warning} numeric />
        ) : (
          <StatusWord text="LINEUP IN" color={c.textSecondary} />
        )
      }
      onPress={onPress}
    />
  );
}

/**
 * A week that is over, as the card it was while it was live.
 *
 * THE SAME COMPONENT THE BOARD DRAWS, built the same way, from the same read —
 * see the settled branch in `ContestCarousel`. The two must not diverge: a
 * result that says WON on the board and something else in the lobby is the
 * two-surfaces-one-fact bug the whole of `contest-model` exists to close.
 *
 * COLLAPSED, LIKE EVERY OTHER CARD IN THIS LIST. It kept its scoring band for
 * about an hour, on the argument that a finished week's band IS the answer —
 * the total, the line, and which side of it you came down on. That is true
 * about the band and wrong about this screen: it made one 153pt card sit in a
 * column of 64pt ones, so the section that is over drew the eye harder than the
 * section you can still act on, and the sheet had two card shapes in it for no
 * reason a reader could name.
 *
 * THE COLLAPSED CARD STILL CARRIES THE RESULT. `settled` puts WON or LOST in
 * the head's corner and turns the foot to STAKED and WON, so the row says which
 * week, whether you took it, what it cost and what it paid — everything except
 * the arithmetic. The arithmetic is a tap away, on the contest's own page,
 * where the same card draws with its band open.
 *
 * SETTLED IS KEYED ON THE WEEK, NOT ON THE ROW BEING A RECAP, and the two
 * figures in it are settlement's own — `result` from `contest_results`,
 * `myCoins` from the slots the payout stamped. Both are legitimately null for a
 * while after the last whistle, and the card words that state rather than
 * guessing at it.
 *
 * IT ALWAYS NAMES ITS WEEK. On the board `period` is set only on a recap card,
 * because a live card needs that corner for its countdown. Nothing here is
 * counting down, every card in this section is a week that is over, and a lobby
 * contest is named after its FORMAT — so without it the section can hold two
 * cards both titled "Flex Three" with nothing on either saying which week.
 */
function SettledEntry({ entry, onPress }: { entry: MyContest; onPress: () => void }) {
  return (
    <ContestCard
      name={entry.name}
      terms={termsOfEntry(entry)}
      period={entry.weekLabel}
      /* NO BAND, AND SO NO `entry` EITHER. The scoring band is the only thing
         that reads it, and handing a card a distribution it has been told not
         to draw is how the two come apart later. */
      scoring={false}
      prize={entry.myPrize}
      settled={settlementOf(entry)}
      onPress={onPress}
    />
  );
}

/**
 * A shelf: its name, how much is on it, one line on what it holds, and the list.
 *
 * ---------------------------------------------------------------------------
 * IT IS ONE CHILD OF THE SCROLLER, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 *
 * The head and the list used to be siblings, and `PlayerSheetFrame`'s content
 * container sets `gap: Spacing.three` between every child it holds. So the page
 * put 16pt between a heading and the list it names — the same distance it puts
 * between two unrelated blocks — and no amount of `paddingBottom` on the head
 * could take it away, because padding adds to a gap rather than replacing it.
 * Two rounds of tightening moved 4pt and left 16 untouched.
 *
 * Wrapping the pair makes the container's gap do what it is for: separating
 * SHELVES. Inside one, the spacing is this component's own — `Spacing.two`
 * between the name block and the list, and nothing but the type's own leading
 * between the name and its description.
 */
function Section({
  label,
  count,
  hint,
  action,
  children,
}: {
  label: string;
  count: number;
  hint: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.section}>
      <View>
        <View style={styles.sectionTop}>
          <Text style={[Type.figure, { color: c.text }]}>{label}</Text>
          {count > 0 ? (
            <Text style={[Type.figure, NUMERIC, { color: c.textTertiary }]}>{String(count)}</Text>
          ) : null}
          <View style={styles.sectionSpacer} />
          {action}
        </View>
        <Text style={[Type.body, { color: c.textTertiary }]}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * A section with nothing in it, in one line.
 *
 * `EmptyState` is a title, a body and room around them — right for a whole
 * screen with nothing on it, far too much for one of four shelves that happens
 * to be empty this week. Four of those on a page a reader is scrolling past
 * would be more empty state than contest.
 */
function SectionEmpty({ text }: { text: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <Text style={[Type.body, styles.sectionEmpty, { color: c.textTertiary }]}>{text}</Text>;
}

/**
 * The friendly lobby's one row: an empty shelf that says what will be on it.
 */
function ComingSoon() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.soon, { borderColor: c.border }]}>
      <Text style={[Type.strong, { color: c.textTertiary }]}>Coming soon</Text>
    </View>
  );
}


/**
 * The door to the season, on the title row rather than in the list.
 *
 * IT IS A LINK AND NOT A ROW, because what is behind it is no longer the point
 * of this section — the cards are. A row of its own would be a second object
 * competing with the results it sits among, at the exact size that says "read
 * me first".
 */
function ArchiveLink({ onPress }: { onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel="See every week you have finished"
      onPress={onPress}
      style={[Type.fine, { color: c.textSecondary }]}>
      All weeks ›
    </Text>
  );
}


/**
 * The exclusivity rule, said once, under the list.
 *
 * It is a footnote rather than a banner because it is a rule of the game and
 * not a warning about the current state — a banner would be shouting the same
 * sentence at somebody who has read it every week since the lobby opened.
 *
 * IT NO LONGER STATES THE RULE, only what the rule COSTS. Seen on a device, the
 * sheet's own sticky subtitle says "One card plays one contest a week" a
 * thumb's width above this, so the footnote's first sentence was the screen
 * saying the same thing twice within one scroll. The subtitle is the better
 * home for it — it is pinned, so it is there whichever part of the list you are
 * looking at — and what only this line ever said is the consequence: that a
 * second entry is paid for out of the BENCH. That is the half worth keeping,
 * and it is the whole argument for the lobby existing.
 */
function Footnote() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text style={[Type.fine, styles.footnote, { color: c.textSecondary }]}>
      Entering more means playing deeper into your roster, not playing the same
      cards twice.
    </Text>
  );
}

const styles = StyleSheet.create({
  /* NO HORIZONTAL PADDING OF ITS OWN. The sheet's scroller already insets its
     children by `Spacing.three`, and the card stacks take it as given — so a
     heading that added its own sat 32pt in while the cards it named sat at 16,
     and every heading on the page was visibly out of line with its own list.
     The band escapes the same inset with a negative margin; this just accepts
     it. */
  /* `Spacing.three` on top, not `four`. A shelf is already separated from the
     one before it by an 18pt name and a line of grey under it; 24pt of air as
     well read as a gap between two pages rather than between two lists. */
  /* `Spacing.two` between the name block and its list, and NOTHING between the
     name and its description — both lines carry their own leading (18 set on
     22, 12 on 16), so about 4pt of air is already baked in and a gap on top of
     it pays for the same space twice. The 16pt that separates one shelf from
     the next is the scroller's own `gap`, which is why this is one child. */
  section: { gap: Spacing.two },
  sectionTop: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  sectionSpacer: { flex: 1 },
  sectionEmpty: { paddingBottom: Spacing.two },
  /* The same shape as the dead-run row above it — a block of text and one
     affordance on the right — because they are the same kind of object: a thing
     on this sheet that opens a different screen. */
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 56,
  },
  /* The contest page's own tab rule, so the two sheets do not draw two
     different lines under the same control. */
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
  /* Cards separated by space rather than by rules. A hairline between two
     bordered cards reads as a third edge; the gap is what says these are
     separate objects rather than rows of one table. */
  stack: { gap: Spacing.two },
  /* Takes the room the chip does not, so a long line truncates rather than
     pushing the status off the right edge. */
  rowText: { flex: 1, gap: 2 },
  /**
   * THE RUN GETS A PANEL NOW, and the note it overturns was right about its own
   * layout: "no panel, no border — a live run is a status line, and a box
   * around it would give it the weight of something that needs acting on."
   *
   * It was a status line while it was one 11pt row under the masthead's rack.
   * It is the first block on the sheet now and it is the frame every price
   * below it is read through — a stake of one heart means nothing until you
   * know whether you hold three or hold this one — so it is the thing the sheet
   * opens WITH rather than a caption over the list.
   *
   * `surface` and no border: it is lifted off the sheet by material, the way a
   * `Panel` is, rather than outlined like the two rows under it. Those are
   * doors and this is not.
   */
  /**
   * THE RUN'S BLOCK: a rail, and the warning it grows on the last heart.
   *
   * NO FILL, NO BORDER, NO RADIUS — see `RunRail`. It was a panel and the panel
   * was the problem: a boxed 130pt block is an object on the page, and the run
   * is a STATUS, which is a thing you read past. The board's rail under the
   * carousel is drawn the same way and for the same reason.
   */
  run: { gap: Spacing.two, paddingHorizontal: Spacing.one },
  /* Count at one end, rack at the other, exactly as the lineup rail sets its
     own two ends. */
  runRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  /* The rack never gives; a long count truncates before the pips move. */
  runCount: { flexShrink: 1, minWidth: 0 },
  /* A card you cannot pay for, still readable and no longer competing. */
  blocked: { opacity: 0.7 },
  /**
   * The card's width, radius and gutter, none of its material — see
   * `ComingSoon`.
   *
   * 64 is not a round number, it is the LOBBY CARD'S HEIGHT: 34 of head, 29 of
   * foot and the hairline between them. The empty shelf holds exactly the space
   * one contest will take, which is the only way an empty section can say how
   * much is coming.
   */
  soon: {
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.three,
    height: 64,
  },
  /* The dead state gets the box the live one does not, because it IS the thing
     that needs acting on. */
  dead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  pressed: { opacity: 0.6 },
  footnote: { marginTop: Spacing.two },
});
