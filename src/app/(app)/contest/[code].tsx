/**
 * A contest, opened off a row in the lobby or off the card over your lineup.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE READS IN THE ORDER SOMEBODY ASKS ABOUT A CONTEST
 * ---------------------------------------------------------------------------
 *
 *     the card        which contest is this, and where do I stand in it
 *     the field       who else is in it, and what did they play
 *     how it works    what it costs, how it is won, when it locks
 *     your lineup     the cards, and only while there is one to build
 *     the bar         the two things you can still do about it
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
 * fee goes with the first submission that names a card. Saying "Pay 40 gems" on
 * a control would be describing a charge that has not happened, and a separate
 * confirm step would be a second thing to press for one decision.
 *
 * THE EDITOR IS THE SAME COMPONENT AS THE BOARD'S. Two lineup editors would be
 * the parallel-copy problem `sections.ts` warns about, applied to the most
 * complicated screen in the game — `LineupEditor` is the extraction, and it
 * draws no carousel when pinned to one contest.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContestAbout } from '@/components/contests/ContestAbout';
import { ContestActions } from '@/components/contests/ContestActions';
import { ContestCard } from '@/components/contests/ContestCard';
import { ContestFieldPanel } from '@/components/contests/ContestFieldPanel';
import { formatLine } from '@/components/contests/contest-model';
import { termsOfContest, useContests } from '@/components/contests/use-contests';
import { useContestField } from '@/components/contests/use-contest-field';
import { useMyContests } from '@/components/contests/use-my-contests';
import { LineupEditor } from '@/components/lineup/LineupEditor';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer } from '@/context/PlayerContext';

export default function ContestSheet() {
  const { code } = useLocalSearchParams<{ code: string }>();
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

  /* Guarded for the same reason as the set checklist: `back()` on an empty
     stack does nothing, so a contest opened from a link or a refreshed tab had
     a close button that did not close.

     THE BOARD IS THE LANDING, not the lobby it was. The lobby became a sheet,
     and dismissing one sheet onto another leaves the reader inside a stack of
     two things they never opened. Compete is the page underneath both. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/compete');
  }, [router]);

  /* Straight to the board with this contest in front. `dismissTo` rather than
     push: the sheet was the way IN, not a step to come back through, and
     leaving it on the stack would put a contest you have already entered
     behind the lineup you entered it with. */
  const toBoard = useCallback(
    (contestCode: string) =>
      router.dismissTo({ pathname: '/fantasy/compete', params: { contest: contestCode } }),
    [router],
  );

  const entered = contest?.mine != null;
  const full =
    contest?.maxEntrants != null && contest.entrants >= contest.maxEntrants && !entered;
  const broke = Boolean(contest && !entered && !contest.affordable);
  /* The two states where there is nothing to fill in. Both are refusals
     `set_lineup` would make anyway on the first submission — this is only so
     the reader meets them before spending ten minutes picking a lineup. */
  const barred = full || broke;

  /**
   * LEAVING GIVES THE GEMS BACK, so this is not a destructive act in the sense
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
    close();
  }, [contest, reload, reloadMine, reloadField, close]);

  return (
    <PlayerSheetFrame
      title={contest?.name}
      /* THE FORMAT, from the same `formatLine` the card's head uses. It lives
         up here alone: the card's head dropped it for the win condition. */
      subtitle={contest ? formatLine(termsOfContest(contest), contest.name) : undefined}
      onClose={close}
      closeLabel="Close contest"
      /* PASS NOTHING RATHER THAN AN EMPTY NODE — a component that renders null
         still arrives as a truthy element, and the frame would pin an empty
         strip to the bottom of the sheet. Before you have entered, the action
         is the editor in the page, not a button on a bar. */
      footer={
        contest && entered ? (
          <ContestActions
            entryFeeGems={contest.entryFeeGems}
            locked={Boolean(myRow?.locked)}
            canLeave={contest.kind === 'lobby'}
            busy={busy}
            onLineup={() => toBoard(contest.code)}
            onLeave={() => setLeaving(true)}
          />
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
          {/* THE CONTEST, AS THE CARD. Not pressable: this IS where the card
              goes when you press it, and a card that opened the page it is on
              would be a door back into the room you are standing in. */}
          <ContestCard
            name={contest.name}
            terms={termsOfContest(contest)}
            /* Entered, the corner counts down — or says LIVE, FINAL, LOCKED.
               In the lobby it answers the question the lobby is asking
               instead: can I get into this. Same corner, same one row. */
            status={entered ? undefined : <StatusChip {...lobbyStatus(contest.mine, contest)} />}
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
          />

          {contest.entryFeeGems > 0 && !entered && !barred ? (
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              The {contest.entryFeeGems} gems are taken when you submit your first
              lineup, not now.
            </Text>
          ) : null}

          {barred ? (
            <Text style={[Type.body, { color: c.textSecondary }]}>
              {full
                ? 'This contest is full.'
                : `You need ${contest.entryFeeGems} gems to enter.`}
            </Text>
          ) : null}

          {/* WHO ELSE IS IN IT — the half of a contest that nothing else in the
              app draws. A row opens that manager's lineup, readable from the
              moment they file it; see `20260830010000`. */}
          <ContestFieldPanel
            entrants={entrants}
            loading={fieldLoading}
            error={fieldError}
            slotCount={contest.slotCount}
            onOpen={(e) =>
              router.push({
                pathname: '/entry/[contest]/[user]',
                params: { contest: contest.id, user: e.userId, name: contest.name },
              })
            }
          />

          {/* THE RULES, last: everything the card prices in eight characters,
              said in sentences. */}
          <ContestAbout
            terms={termsOfContest(contest)}
            name={contest.name}
            prizePoolBps={contest.prizePoolBps}
            leavable={contest.kind === 'lobby' && !contest.recap}
            /* The rack the reader is staking, drawn the way every other
               surface draws it — see the note on `run` in `ContestAbout`. */
            run={run}
          />

          {/* THE LINEUP, WHILE THERE IS STILL ONE TO BUILD, and it goes LAST.

              IT WAS SECOND, DIRECTLY UNDER THE CARD, on the argument that a
              reader who tapped Enter in the lobby should not have to scroll
              past a leaderboard and nine rules to reach a slot. That argument
              was right about the cost and wrong about the size of it: the
              editor is not eight rows, it is eight slots AND the whole bench —
              thirty cards on this account — so putting it second buried the
              field and the terms about forty rows down. The two things this
              page exists to say became the two things nobody would ever reach.

              The field and the rules are under two screens. The bench is not.
              Whichever way round it goes somebody scrolls; this way the thing
              being scrolled past is short and is the reason you opened the
              page.

              ENTERED, THERE IS NO EDITOR HERE AT ALL. The one for this contest
              is on the Compete board — a second copy would be two editors for
              one entry with no way to know which you were changing — and the
              bar at the bottom is the way to it. */}
          {entered || barred ? null : (
            <LineupEditor
              pinnedContest={contest.code}
              frame="plain"
              onEntered={(enteredCode) => toBoard(enteredCode)}
            />
          )}
        </View>
      )}
      <ConfirmDialog
        visible={leaving}
        title={`Leave ${contest?.name ?? 'this contest'}?`}
        body={
          contest && contest.entryFeeGems > 0
            ? `Your lineup is deleted and ${contest.entryFeeGems} gems go back to your balance. You can enter again while the games are still ahead.`
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
 * that says "Not enough gems" in the list and something else on its own page is
 * the two-surfaces-one-fact bug `contest-model` exists to close. It lives here
 * rather than being imported because `contests.tsx` derives it inside its row
 * component; if a third surface ever needs it, it moves to `contest-model`.
 */
function lobbyStatus(
  mine: { filled: number } | null | undefined,
  contest: { entryFeeGems: number; affordable: boolean; slotCount: number },
): { label: string; tone: 'positive' | 'warning' | 'neutral' } {
  if (!mine) {
    if (contest.entryFeeGems > 0 && !contest.affordable) {
      return { label: 'Not enough gems', tone: 'neutral' };
    }
    return { label: contest.entryFeeGems > 0 ? 'Enter' : 'Not set', tone: 'warning' };
  }
  return mine.filled < contest.slotCount
    ? { label: `${mine.filled} of ${contest.slotCount}`, tone: 'warning' }
    : { label: 'Lineup in', tone: 'positive' };
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
});
