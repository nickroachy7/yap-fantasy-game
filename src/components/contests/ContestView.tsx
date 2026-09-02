/**
 * A contest, opened off a row in the lobby or off the card over your lineup.
 *
 * IT IS A VIEW INSIDE `ContestSheet`, NOT A ROUTE. It was `contest/[code]` and
 * it kept its own presented sheet, which meant opening a contest from the lobby
 * put a sheet on top of a sheet — two ✕s, two grabbers, and a back gesture that
 * dismissed a thing the reader had not opened. The route still exists and is
 * still the way in from the board's carousel; it hands this view to the sheet
 * as the bottom of a stack rather than as a second layer.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE READS IN THE ORDER SOMEBODY ASKS ABOUT A CONTEST
 * ---------------------------------------------------------------------------
 *
 *     the card        which contest is this, and where do I stand in it
 *     your lineup     the cards you filed for that week — entered only
 *     the field       who else is in it, and what did they play
 *     how it works    what it costs, how it is won, when it locks
 *     the editor      the cards, and only while there is one to build
 *     the bar         the two things you can still do about it
 *
 * YOUR OWN TEAM SITS SECOND, AND IT USED NOT TO BE HERE AT ALL. Entered, this
 * page drew a card, a leaderboard and nine rules, and nowhere on it the eight
 * players the week actually turned on — the one thing every rival's row on the
 * field opens to show, withheld from the only entry the reader owns. The
 * argument for withholding it was about the EDITOR ("a second copy would be two
 * editors for one entry with no way to know which you were changing", which is
 * still true and still why the editor is not here), and it was quietly applied
 * to the lineup itself. Reading is not editing. This is `EntryLineup`, the same
 * read-only panel a rival's team is drawn with, pointed at your own row.
 *
 * The lineup is the one section that comes and goes. It sits last because it is
 * the LONGEST — eight slots and a thirty-card bench — and anything placed after
 * it is unreachable in practice. See the note on it below.
 *
 * That is a change of PREMISE and not only of order. This page used to be a
 * decision — "read what the contest asks of you, act once, put it down" — and
 * it was built to be closed. But a contest is a week long, and after the entry
 * is filed this is the only surface in the app that is about it: the board
 * shows you your own lineup and a distribution, and nothing anywhere showed you
 * the people. So it is a PLACE now, and it has to be worth coming back to on
 * Sunday as well as on Wednesday.
 *
 * ---------------------------------------------------------------------------
 * THE CARD IS THE WHOLE CARD, NOT A PANEL OF ITS TERMS
 * ---------------------------------------------------------------------------
 *
 * `ContestTermsPanel` was this page's head: the win condition, the fill, and
 * the trade band lifted out of `ContestCard`. It existed because the sheet's
 * own title bar was already saying the contest's name and format, so drawing
 * the whole card would have said both twice.
 *
 * What it cost was the SCORING BAND — the one thing on the card that changes
 * through the week, and the entire reason to open this page after Thursday. A
 * player could be third of twelve with the community twenty points behind and
 * read a page that showed neither. The card is the contest's identity
 * everywhere else in the app; there is no argument for it being a different
 * object on the contest's own page.
 *
 * ---------------------------------------------------------------------------
 * ENTERING IS `set_lineup`, NOT AN `enter_contest`
 * ---------------------------------------------------------------------------
 *
 * The lineup row IS the entry record — `lineups_user_id_contest_key` already
 * enforces one per player per contest, so a separate entries table would be a
 * second copy of a fact the first one already holds. The fee is taken on the
 * CREATE path, which is what makes it idempotent against the client's autosave.
 * See `20260825050000`.
 *
 * So this screen has no enter button at all: you fill the lineup below and the
 * fee goes with the first submission that names a card. Saying "Pay 40 coins" on
 * a control would be describing a charge that has not happened, and a separate
 * confirm step would be a second thing to press for one decision.
 *
 * THE EDITOR IS THE SAME COMPONENT AS THE BOARD'S. Two lineup editors would be
 * the parallel-copy problem `sections.ts` warns about, applied to the most
 * complicated screen in the game — `LineupEditor` is the extraction, and it
 * draws no carousel when pinned to one contest.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContestAbout } from './ContestAbout';
import { ContestCard } from './ContestCard';
import { coin, formatRoster, runWiped } from '@/components/icons/glyphs';
import { ContestFieldPanel } from './ContestFieldPanel';
import { EntryLineup } from './EntryLineup';
import { formatLine, settlementOf } from './contest-model';
import { termsOfContest, useContests } from './use-contests';
import { useContestField, useContestLineup } from './use-contest-field';
import { useMyContests } from './use-my-contests';
import { LineupEditor, type EntryActions, type EntryOffer } from '@/components/lineup/LineupEditor';
import { BarAction, GlassBar, GlassPill } from '@/components/ui/GlassBar';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { BackRow } from './ContestRecapPanel';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';


export function ContestView({
  code,
  backLabel,
  onBack,
  onClose,
  dismissible,
}: {
  code: string;
  /**
   * What is under this one in the stack, or undefined when nothing is.
   *
   * A BACK ROW ONLY WHEN THERE IS SOMETHING TO GO BACK TO. Opened from the
   * board's carousel this view IS the sheet, and a row offering to go back to a
   * lobby the reader never opened would be inventing a history.
   */
  backLabel?: string;
  onBack: () => void;
  onClose: () => void;
  /** False while this view sits on top of another — see `dismissible`. */
  dismissible?: boolean;
}) {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { run } = usePlayer();
  const { contests, loading, error, reload } = useContests();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const contest = useMemo(
    () => contests?.find((ct) => ct.code === code) ?? null,
    [contests, code],
  );

  /**
   * YOUR STANDING IN IT, which the lobby row does not carry.
   *
   * `contest_lobby` answers "what is open and can I afford it"; the scoring
   * band needs a distribution, a cut and a settled prize, which is
   * `my_contest_cards`. Both are already loaded on the board this page opens
   * over — asking again here is one small round trip for the one band that
   * makes the page worth reopening mid-week.
   */
  const { contests: mine, reload: reloadMine } = useMyContests(
    typeof code === 'string' ? code : undefined,
  );
  const entry = useMemo(() => mine?.find((m) => m.code === code) ?? null, [mine, code]);

  /**
   * THE FIELD IS FETCHED HERE RATHER THAN INSIDE THE PANEL, because two things
   * on this page need it and neither should ask twice: the leaderboard, and the
   * bar at the bottom — which may only offer to leave while your own lineup is
   * still unlocked, and reads that off your own row rather than guessing at the
   * fixtures.
   */
  const {
    entrants,
    loading: fieldLoading,
    error: fieldError,
    reload: reloadField,
  } = useContestField(contest?.id ?? null);
  const myRow = useMemo(() => entrants?.find((e) => e.isMe) ?? null, [entrants]);

  /* Straight to the board with this contest in front. `dismissTo` rather than
     push: the sheet was the way IN, not a step to come back through, and
     leaving it on the stack would put a contest you have already entered
     behind the lineup you entered it with. */
  const toBoard = useCallback(
    (contestCode: string) =>
      router.dismissTo({ pathname: '/fantasy/compete', params: { contest: contestCode } }),
    [router],
  );

  /**
   * THE COUNT RIDES ON `Rankings`, because it is the one tab whose contents
   * change without the reader doing anything — entries arrive all week — and a
   * number beside the label is how you find that out without opening it.
   *
   * THE THIRD IS `Rules`, NOT `Scoring rules`. What is under it is the roster
   * limit, the win condition, the pool, the stake, the lock and the scoring, so
   * naming it after one of the six would promise the smallest of them. Scoring
   * proper is a page of its own, which that tab links to.
   */

  /* WHETHER THE WEEK IS OVER, from the one helper every surface uses — see
     `settlementOf`. Null while it is still a live offer, which is what keeps
     the card in the present tense. */
  const settled = entry ? settlementOf(entry) : null;
  const entered = contest?.mine != null;

  /**
   * THE EIGHT CARDS YOU FILED, read through the same RPC a rival's team is.
   *
   * GATED ON BEING ENTERED, which is what makes it free on the page a reader
   * most often opens: a contest you are looking at from the lobby has no lineup
   * to fetch, and `useContestLineup` idles on a null contest rather than asking
   * for one. Keyed to its own request inside the hook, so swiping from one
   * finished contest to another cannot draw last one's team under this one's
   * card — see the note there.
   */
  /**
   * THE ENTRY OFFER, LIFTED OUT OF THE EDITOR SO IT CAN FLOAT.
   *
   * "Enter for 40 coins" used to sit at the BOTTOM of the editor, which on this
   * page means below three empty slots and a twenty-nine card bench — the one
   * control the reader came to press, four screens down, under the list they
   * have to scroll to reach it. Floating it puts it where the tab bar is on
   * every other screen: over the content, always in reach, in the same glass.
   *
   * THE EDITOR STILL OWNS THE DECISION. What crosses is a description of the
   * offer and a ref holding the current `submit` — see `EntryOffer`. This page
   * never learns how a lineup is composed and cannot get the rule about a full
   * lineup wrong, because it is not the one applying it.
   */
  const [offer, setOffer] = useState<EntryOffer | null>(null);
  const acts = useRef<EntryActions | null>(null);

  /**
   * WHICH OF THE THREE THIS PAGE IS SHOWING.
   *
   * IT OPENS ON THE LINEUP, always, and that is a choice rather than a default
   * falling out of the order. The three faces peak at different moments — the
   * rules before you enter, the field on a Sunday, your own team on the Monday
   * after — and a page that guessed which one you wanted would be wrong two
   * times in three while also being unpredictable. The lineup is the one face
   * that is about YOU on every one of those days, and it is where the thing you
   * came to DO lives: the editor before you enter, the way to the board after.
   */

  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const { slots: myLineup, loading: lineupLoading } = useContestLineup(
    entered ? (contest?.id ?? null) : null,
    me,
  );
  const full =
    contest?.maxEntrants != null && contest.entrants >= contest.maxEntrants && !entered;
  const broke = Boolean(contest && !entered && !contest.affordable);
  /* The two states where there is nothing to fill in. Both are refusals
     `set_lineup` would make anyway on the first submission — this is only so
     the reader meets them before spending ten minutes picking a lineup. */
  const barred = full || broke;

  /**
   * LEAVING GIVES THE COINS BACK, so this is not a destructive act in the sense
   * the dialog means — but it does delete a lineup somebody built, which is
   * why it asks at all rather than acting on one press.
   *
   * Refused server-side once any of your cards has kicked off. The bar no
   * longer OFFERS it in that state — `myRow.locked` is the same computation the
   * refusal uses — but the error is still surfaced in the dialog, because the
   * kickoff can pass between the page loading and the button being pressed.
   */
  const leave = useCallback(async () => {
    if (!contest) return;
    setBusy(true);
    setLeaveError(null);
    const { error: err } = await supabase.rpc('leave_contest', {
      p_contest_code: contest.code,
    });
    setBusy(false);
    if (err) {
      setLeaveError(err.message);
      return;
    }
    setLeaving(false);
    reload();
    reloadMine();
    reloadField();
    /* LEAVING PUTS THE VIEW DOWN, not the sheet — where there is something
       under it. The lineup is gone and this page is now about a contest you
       are not in; the lobby behind it is exactly where that reader is going
       next. Opened straight onto this contest there is nothing under it, and
       the sheet closes as it always did. */
    if (backLabel) onBack();
    else onClose();
  }, [contest, reload, reloadMine, reloadField, backLabel, onBack, onClose]);

  return (
    <PlayerSheetFrame
      title={contest?.name}
      /* THE FORMAT, from the same `formatLine` the card's head uses. It lives
         up here alone: the card's head dropped it for the win condition. */
      subtitle={contest ? formatLine(termsOfContest(contest), contest.name) : undefined}
      onClose={onClose}
      dismissible={dismissible}
      closeLabel="Close contest"
      /* THE ONLY THING THAT FLOATS IS THE ENTRY, and only while there is one to
         make: the one act this page exists for, which was buried under a
         bench before it was pinned.

         TWO OFFERS, ONE BAR. Entering gets Clear / Pick for me / Enter;
         an entry you can still change gets Leave / Edit my lineup. They are
         the same material in the same place because they are the same kind of
         moment, and because the sets sheet has drawn its own actions this way
         since `CardExits` — a second bar shape for the same job would be the
         divergence this app keeps closing.

         NOTHING ONCE IT IS PLAYING. Locked or settled, the footer is
         undefined: a disabled bar takes the same room while refusing to work,
         so a recent contest gets a page with no glass on it at all. */
      footerGlass
      footer={
        offer ? (
          <GlassBar>
            {/* CLEAR IS A MARK AND NO WORD, which is what fits three actions on
                one row without the other two abbreviating themselves. It is
                also the quietest of the three by rank — the only one that
                undoes rather than does — so a circle at the near end is the
                right weight for it. `runWiped` is the app's own glyph for a
                board being emptied. */}
            <GlassPill compact>
              <BarAction
                glyph={runWiped}
                hint="Empty every slot"
                enabled={offer.canClear && !offer.busy}
                onPress={() => acts.current?.clear()}
              />
            </GlassPill>
            {/* THE HELPER, NAMED FOR WHAT IT DOES FOR YOU. "Auto fill" is what
                the feature is called in a settings screen; "Pick for me" is what
                the reader is actually asking for, and it says who is doing the
                picking — which matters here because the app is choosing cards
                out of their collection. The roster glyph is the same mark the
                Full Roster format wears on its card. */}
            <GlassPill>
              <BarAction
                glyph={formatRoster}
                label="Pick for me"
                hint="Fill every empty slot with the best card available"
                enabled={offer.canAutofill && !offer.busy}
                onPress={() => acts.current?.autofill()}
              />
            </GlassPill>
            {/* THE ACT, PRICED IN THE CARD'S OWN VOCABULARY. `Enter` beside the
                coin glyph and a figure is exactly how the card above states its
                RISK, so the bar and the card cannot word the same 40 coins two
                different ways.

                UNREADY IT STATES A CONDITION, NOT AN ORDER. "Fill 3 more" is an
                instruction on a control that refuses to be pressed; "3 slots
                left" is the reason it refuses, which is the thing the reader
                needs in order to do something about it. */}
            <GlassPill grow>
              <BarAction
                glyph={offer.ready ? coin : undefined}
                label={offer.ready ? `Enter for ${offer.fee}` : `${offer.slots - offer.filled} slots left`}
                hint={offer.ready ? `Enter this contest for ${offer.fee} coins` : `Fill all ${offer.slots} slots to enter`}
                primary
                enabled={offer.ready && !offer.busy}
                onPress={() => acts.current?.submit()}
              />
            </GlassPill>
          </GlassBar>
        ) : entered && !myRow?.locked && !settled ? (
          /* ENTERED, AND STILL CHANGEABLE. The same bar in the same place,
             because it is the same kind of moment: the one act this page
             exists for, at the bottom of the sheet where the reader's thumb
             already is.

             It was two plain buttons in the flow — `ContestActions` — on the
             argument that a pinned bar following a reader through the field
             and the rules is navigation OUT of a page they are still reading.
             That argument belonged to the tabbed version: the bar could not
             know which face was open, so it hung over a leaderboard offering
             to spend coins. On one page there is nothing to follow the reader
             through; the page IS the lineup, with the field and the rules
             under it, and the bar is about the lineup at the top of it.

             LOCKED OR SETTLED, NO BAR AT ALL. There is nothing to do once the
             cards are playing, and a disabled bar that hovers is worse than no
             bar — it is a control that takes up the same room while refusing
             to work. A recent contest gets a page with no glass on it. */
          <GlassBar>
            {/* THE ACT FIRST, THE WAY OUT AFTER IT. Leaving led the row while
                it was a bare glyph, borrowing Clear's position from the entry
                bar — but Clear is a step INSIDE the thing you came to do and
                leaving is the opposite of it. Ordered this way the row reads
                as the offer and then the escape, which is the order a reader
                wants them in.

                AND IT SAYS "LEAVE". The glyph alone was unreadable: `runCashout`
                means something specific about a run and nothing obvious about
                an entry, so the one destructive control on the page was the one
                nobody could identify. It is not `compact` any more either —
                that variant is sized for a mark with no word beside it. */}
            <GlassPill grow>
              <BarAction
                glyph={formatRoster}
                label="Edit my lineup"
                hint="Edit your lineup for this contest on the board"
                primary
                enabled={!busy}
                onPress={() => contest && toBoard(contest.code)}
              />
            </GlassPill>
            {contest && contest.kind === 'lobby' ? (
              <GlassPill>
                <BarAction
                  label="Leave"
                  hint={
                    contest.entryFeeCoins > 0
                      ? `Leave this contest and take back ${contest.entryFeeCoins} coins`
                      : 'Leave this contest'
                  }
                  enabled={!busy}
                  onPress={() => setLeaving(true)}
                />
              </GlassPill>
            ) : null}
          </GlassBar>
        ) : undefined
      }>
      {error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      ) : loading && !contest ? null : !contest ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          That contest is no longer open.
        </Text>
      ) : (
        <View style={styles.body}>
          {/* THE WAY BACK, as the first thing in the view rather than a control
              on the frame — the same row the archive draws, one level along.
              The sheet's ✕ still means "put the whole thing down". */}
          {backLabel ? <BackRow label={backLabel} onPress={onBack} /> : null}

          {/* THE CONTEST, AS THE CARD. Not pressable: this IS where the card
              goes when you press it, and a card that opened the page it is on
              would be a door back into the room you are standing in. */}
          {/* THE CARD, WITH ITS SCORING BAND OPEN — and this page is the only
              place that band is drawn on a contest you can reach from the
              lobby. Every card in the lobby is collapsed to a head and a foot,
              deliberately, so that a list of them is a list rather than a
              stack of scoreboards. The score is what you came HERE for: the
              tap on a collapsed card is the request to see it. */}
          <ContestCard
            name={contest.name}
            terms={termsOfContest(contest)}
            /* Entered, the corner counts down — or says LIVE, FINAL, LOCKED.
               In the lobby it answers the question the lobby is asking
               instead: can I get into this. Same corner, same one row. */
            status={entered ? undefined : <StatusChip {...lobbyStatus(contest.mine, contest)} />}
            /* WHICH WEEK, once there is no countdown left to draw. A lobby
               contest is named after its FORMAT, so a finished "Flex Three"
               opened out of the recent list would otherwise be titled exactly
               like the one still open upstairs. */
            period={settled ? entry?.weekLabel : undefined}
            /* No `at` to count down to — the slate's next kickoff belongs to
               the board, which has the lineup to compute it from. What this
               page knows is whether YOUR lineup has locked, which is the tail
               state the tag draws as LOCKED. `now` is only ever read against
               `at`, so it is zero rather than a clock reading: `Date.now()` in
               a render is an impure call the lint rule rejects, and it would be
               buying a number this tag cannot use. */
            lock={entered ? { at: null, locked: Boolean(myRow?.locked), now: 0 } : null}
            entry={
              entered && entry
                ? {
                    myPoints: entry.field.myPoints,
                    /* NO PROJECTIONS EXIST. The slot is real and the value is
                       null — see `Entry.projected`. */
                    projected: null,
                    field: entry.field,
                    cut: entry.cut,
                  }
                : null
            }
            prize={entry?.myPrize ?? null}
            /* THE TENSE OF THE WHOLE CARD. `RISK`/`WIN` become `STAKED`/`WON`
               and the corner says the outcome — the same settlement the lobby's
               collapsed card carries, from the same helper, so the two cannot
               come to disagree about a week they both draw. */
            settled={settled}
          />

          {/* ONE PAGE, IN THE ORDER A CONTEST IS READ.
              It was three tabs — Lineup, Rankings, Rules — and the argument for
              them was real: the page had been four screens of stacked panels,
              and whichever went second buried the other two. Tabs made them
              peers, one tap apart.

              What tabs cost here is the same thing they cost the lobby. Two
              thirds of the page is always hidden, the bar at the bottom cannot
              know which face is open (which is why it was gated on `offer` and
              why the entered actions ended up loose in the flow instead), and
              "how does my lineup compare" is answered by tapping between two
              faces rather than by scrolling between two sections.

              The ranking that tabs refused to make is made by the order, and it
              is not arbitrary: your lineup, then the field it is measured
              against, then the rules that decide it. That is the sentence the
              contest is, and each section is shorter than the tab version
              because none of them has to stand alone any more. */}
          <>
              {/* YOUR TEAM. The card says how the week went; this says what it
                  went on, which is why they are the two things a reader lands
                  on. THE HINT NAMES THE WEEK once there is nothing left to say
                  about editing it: before kickoff the useful fact is whether
                  these cards can still change, and after settlement that
                  question is closed and the one thing needed is WHICH week —
                  which matters here because a lobby contest is named after its
                  format and two of them can be titled alike.

                  NO HEADING. The tab above it is the heading. */}
              {entered ? (
                <EntryLineup
                  title=""
                  slots={myLineup ?? []}
                  loading={lineupLoading && myLineup === null}
                  placeholder={contest.slotCount}
                  hint={
                    settled
                      ? (entry?.weekTitle ?? 'Final')
                      : myRow?.locked
                        ? 'Locked in'
                        : 'Can still change before kickoff'
                  }
                  emptyBody="You have not put any cards in this one yet."
                />
              ) : null}

              {contest.entryFeeCoins > 0 && !entered && !barred ? (
                <Text style={[Type.fine, { color: c.textSecondary }]}>
                  The {contest.entryFeeCoins} coins are taken when you submit your first
                  lineup, not now.
                </Text>
              ) : null}

              {barred ? (
                <Text style={[Type.body, { color: c.textSecondary }]}>
                  {full
                    ? 'This contest is full.'
                    : `You need ${contest.entryFeeCoins} coins to enter.`}
                </Text>
              ) : null}

              {/* THE EDITOR, WHILE THERE IS STILL A LINEUP TO BUILD.

                  It used to go LAST on the page, and the note that put it there
                  is worth keeping: it is not eight rows, it is eight slots AND
                  the whole bench, so anything after it was unreachable in
                  practice. Under a tab that argument dissolves — nothing is
                  after it, because the field and the rules are no longer below
                  it. They are beside it.

                  ENTERED, THERE IS NO EDITOR HERE AT ALL. The one for this
                  contest is on the Compete board; a second copy would be two
                  editors for one entry with no way to know which you were
                  changing. What you get here is the read-only lineup above and
                  the way to the board below it. */}
              {entered || barred ? null : (
                <LineupEditor
                  pinnedContest={contest.code}
                  frame="plain"
                  onEntryOffer={setOffer}
                  entryRef={acts}
                  onEntered={(enteredCode) => toBoard(enteredCode)}
                />
              )}

          </>

          {/* WHO ELSE IS IN IT — the half of a contest that nothing else in the
              app draws. A row opens that manager's lineup IN PLACE, readable
              from the moment they file it; see `20260830010000`.
              It carries its own heading again: the tab above it used to be the
              heading, and with the tab gone a bare list of managers under a
              lineup has nothing saying which is which. */}
          <ContestFieldPanel
            entrants={entrants}
            loading={fieldLoading}
            error={fieldError}
            slotCount={contest.slotCount}
            contestId={contest.id}
          />

          {/* Everything the card prices in eight characters, said in sentences.
              Last, because it is the section a reader needs once and the other
              two are the ones they come back for. */}
          <ContestAbout
            terms={termsOfContest(contest)}
            name={contest.name}
            prizePoolBps={contest.prizePoolBps}
            leavable={contest.kind === 'lobby' && !contest.recap}
            /* The rack the reader is staking, drawn the way every other surface
               draws it — see the note on `run` in `ContestAbout`. */
            run={run}
          />
        </View>
      )}
      <ConfirmDialog
        visible={leaving}
        title={`Leave ${contest?.name ?? 'this contest'}?`}
        body={
          contest && contest.entryFeeCoins > 0
            ? `Your lineup is deleted and ${contest.entryFeeCoins} coins go back to your balance. You can enter again while the games are still ahead.`
            : 'Your lineup for this contest is deleted.'
        }
        warning="The cards go back to your bench and can be played somewhere else this week."
        confirmLabel="Leave"
        destructive
        busy={busy}
        error={leaveError ?? undefined}
        onConfirm={() => void leave()}
        onCancel={() => {
          setLeaving(false);
          setLeaveError(null);
        }}
      />
    </PlayerSheetFrame>
  );
}

/**
 * The lobby's chip, in the lobby's own four states.
 *
 * The same function the lobby row runs, and it has to stay the same: a contest
 * that says "Not enough coins" in the list and something else on its own page is
 * the two-surfaces-one-fact bug `contest-model` exists to close. It lives here
 * rather than being imported because `contests.tsx` derives it inside its row
 * component; if a third surface ever needs it, it moves to `contest-model`.
 */
function lobbyStatus(
  mine: { filled: number } | null | undefined,
  contest: {
    kind: 'free' | 'lobby';
    entryFeeCoins: number;
    affordable: boolean;
    slotCount: number;
  },
): { label: string; tone: 'positive' | 'warning' | 'neutral' } {
  if (!mine) {
    if (contest.entryFeeCoins > 0 && !contest.affordable) {
      return { label: 'Not enough coins', tone: 'neutral' };
    }
    /* THE TEST IS `kind`, NOT THE FEE, and that distinction only started
       mattering with The Warm-Up (`20260901050000`).

       `Not set` is the free contest's word: you are already in it, you did not
       choose to be, and there is nothing to enter — only a lineup you have not
       filled. `Enter` is every other row's word. The fee used to stand in for
       that difference because free and opt-in were the same set, and they are
       not any more: The Warm-Up costs nothing and is still something you decide
       to join. Reading it off the fee would greet the lobby's on-ramp with a
       chip that gives the reader nothing to do. */
    return { label: contest.kind === 'free' ? 'Not set' : 'Enter', tone: 'warning' };
  }
  return mine.filled < contest.slotCount
    ? { label: `${mine.filled} of ${contest.slotCount}`, tone: 'warning' }
    : { label: 'Lineup in', tone: 'positive' };
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  /* A tab's cell: the bar's full height, an equal share of its width, and no
     fill of its own. See `BarAction`. */
  /* The profiles' tab bars lost this rule when their content became hairline
     sections that draw their own — see `players/Section`. This sheet's content
     is still panels, so it keeps the rule that separates the tabs from them. */
});
