/**
 * A contest, opened off a row in the lobby.
 *
 * WHAT IT IS FOR: read what the contest asks of you, what it costs, and enter
 * it. One decision, taken once. That is the same shape as the set checklist
 * and the two profiles, which is why it borrows their frame rather than
 * inventing a presentation of its own.
 *
 * ---------------------------------------------------------------------------
 * THE LINEUP IS IN HERE, AND IT IS THE SAME COMPONENT AS THE BOARD'S
 * ---------------------------------------------------------------------------
 *
 * This shipped once without it, on two arguments. The first was wrong:
 * `SwapSheet` is a React Native `Modal`, so it presents ABOVE this sheet
 * rather than nesting inside it — there was never a sheet-on-a-sheet.
 *
 * The second was real — two lineup editors would be the parallel-copy problem
 * `sections.ts` warns about, applied to the most complicated screen in the
 * game — but the answer to it is to extract the editor, not to leave the
 * sheet a dead end that tells you to go somewhere else. `LineupEditor` is that
 * extraction, and it draws no carousel when pinned to one contest: this
 * surface is already about a single contest, and a row of cards for the others
 * would be offering to leave it.
 *
 * ---------------------------------------------------------------------------
 * ENTERING IS `set_lineup`, NOT AN `enter_contest`
 * ---------------------------------------------------------------------------
 *
 * The lineup row IS the entry record — `lineups_user_id_contest_key` already
 * enforces one per player per contest, so a separate entries table would be a
 * second copy of a fact the first one already holds. The fee is taken on the
 * CREATE path, which is what makes it idempotent against the client's
 * autosave. See `20260825050000`.
 *
 * So this screen has no enter button at all: you fill the lineup below and the
 * fee goes with the first submission that names a card. Saying "Pay 40 gems"
 * on a control up here would be describing a charge that has not happened, and
 * a separate confirm step would be a second thing to press for one decision.
 * The line under the facts says when the gems move; the autosave does the rest.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContestTermsPanel } from '@/components/contests/ContestCard';
import { termsOfContest, useContests } from '@/components/contests/use-contests';
import { ContestFieldPanel } from '@/components/contests/ContestFieldPanel';
import { LineupEditor } from '@/components/lineup/LineupEditor';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ContestSheet() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { contests, loading, error, reload } = useContests();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const contest = useMemo(
    () => contests?.find((ct) => ct.code === code) ?? null,
    [contests, code],
  );

  /* Guarded for the same reason as the set checklist: `back()` on an empty
     stack does nothing, so a contest opened from a link or a refreshed tab had
     a close button that did not close. The lobby is this sheet's landing. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/compete/contests');
  }, [router]);

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
   * Refused server-side once any of your cards has kicked off; the dialog does
   * not try to predict that, because the per-player lock moves with the
   * fixtures and a client that guessed would be wrong for the four days an NFL
   * week runs. The error comes back and is shown in the dialog.
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
    close();
  }, [contest, reload, close]);

  return (
    <PlayerSheetFrame
      title={contest?.name}
      subtitle={contest ? `${contest.formatName} · ${contest.slotCount} cards` : undefined}
      onClose={close}
      closeLabel="Close contest">
      {error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      ) : loading && !contest ? null : !contest ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          That contest is no longer open.
        </Text>
      ) : (
        <View style={styles.body}>
          {/* WHAT IT COSTS AND WHAT IT PAYS, in the card's own zone. This page
              used to show Format / Entry / Entered and nothing else — so the
              lobby could warn you a run was on the line and the page you opened
              to think about it never mentioned the heart, the win condition or
              the pool. See `ContestTermsPanel`. */}
          <ContestTermsPanel terms={termsOfContest(contest)} />

          {/* THE RULE, said here because here is where somebody takes it on. It
              is what makes a second contest cost something real rather than
              being a second place to put the same eight cards, and it is
              invisible on the board — there you meet it only as a refusal. */}
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            A card can only play in one contest a week. Whatever you field here
            comes out of the cards you are not already playing.
          </Text>

          {/* WHY YOU ACTUALLY ENTER, said here because the card no longer says
              it. The reward column is gems now — a currency the reader keeps
              score in — and career_fp was the odd line out on it: not a balance
              anybody holds, and next to "40 gems" it read as small print. It is
              still the real return, so it gets a sentence on the one surface
              with room to make the argument rather than a cramped column
              nobody could price. */}
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            The gems are the chase. What an entry actually buys is career FP on
            cards that were earning nothing — the tier those cards climb is the
            one thing packs cannot sell you.
          </Text>

          {contest.entryFeeGems > 0 ? (
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              {entered
                ? 'You are in. The entry has been paid.'
                : `The ${contest.entryFeeGems} gems are taken when you submit your first lineup, not now.`}
            </Text>
          ) : null}

          {barred ? (
            <Text style={[Type.body, { color: c.textSecondary }]}>
              {full
                ? 'This contest is full.'
                : `You need ${contest.entryFeeGems} gems to enter.`}
            </Text>
          ) : entered ? (
            /* ALREADY IN, so no board here. The lineup for this contest is the
               one on the Compete carousel, immediately behind this sheet — a
               second copy of it would be two editors for one entry and the
               reader would have no way to know which one they were changing.
               Entered, this surface is the contest's TERMS and the way out. */
            <Text style={[Type.fine, { color: c.textTertiary }]}>
              Your lineup for this contest is on the Compete board — swipe to its
              card to change it.
            </Text>
          ) : (
            <LineupEditor
              pinnedContest={contest.code}
              frame="plain"
              /* Straight to the board with this contest in front. `dismissTo`
                 rather than push: the sheet was the way IN, not a step to come
                 back through, and leaving it on the stack would put a contest
                 you have already entered behind the lineup you entered it
                 with. */
              onEntered={(code) =>
                router.dismissTo({
                  pathname: '/fantasy/compete',
                  params: { contest: code },
                })
              }
            />
          )}

          {/* WHO ELSE IS IN IT. Under the lineup rather than over it: before
              you have entered, the field is context for a decision the editor
              above is where you take; after you have, it is the reason to come
              back to this page at all. */}
          <ContestFieldPanel contestId={contest.id} />

          {/* Only once you are in, and never on the free contest — that one is
              not a thing you joined. Quiet and at the bottom: it is the exit,
              not an option being offered. */}
          {entered && contest.kind === 'lobby' ? (
            <Pressable
              onPress={() => setLeaving(true)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.leave,
                { borderColor: c.negative },
                pressed && styles.leavePressed,
              ]}>
              <Text style={[Type.body, styles.leaveLabel, { color: c.negative }]}>
                Leave contest
              </Text>
              {contest.entryFeeGems > 0 ? (
                <Text style={[Type.fine, { color: c.textSecondary }]}>
                  {contest.entryFeeGems} gems back
                </Text>
              ) : null}
            </Pressable>
          ) : null}
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

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  /* OUTLINED, NOT FILLED. It was a grey line of `fine` text and read as a
     caption rather than a control — the one thing on the sheet somebody might
     actually need and the quietest thing on it.

     Bordered rather than solid because leaving is not destruction: the gems
     come back in full and you can enter again while the games are still ahead.
     A filled red button would be shouting a warning about an action that is
     completely reversible, and this sheet already has one solid button — the
     entry — which should stay the only one. */
  leave: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  leavePressed: { opacity: 0.6 },
  leaveLabel: { fontWeight: '700' },
});
