/**
 * A contest, opened off a row in the lobby.
 *
 * WHAT IT IS FOR: read what the contest asks of you, what it costs, and enter
 * it. One decision, taken once. That is the same shape as the set checklist
 * and the two profiles, which is why it borrows their frame rather than
 * inventing a presentation of its own.
 *
 * ---------------------------------------------------------------------------
 * THE LINEUP IS DELIBERATELY NOT IN HERE
 * ---------------------------------------------------------------------------
 *
 * Two reasons, and the second is the one that would have hurt.
 *
 * A lineup is not a sheet-sized task: slots, a bench of twenty-odd, per-slot
 * swapping, kickoff locks and an autosave. And `SwapSheet` is ITSELF a bottom
 * sheet under 900px — so editing in here would stack a sheet on a sheet on
 * every phone in the beta.
 *
 * More importantly there would then be two lineup editors, which is the
 * parallel-copy problem `sections.ts` warns about at length, applied to the
 * most complicated screen in the game. Entering dismisses onto this contest's
 * card in the lineup carousel, which is the one editor there is.
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
 * So this screen does not enter anything: it sends you to the board with the
 * contest named, and the fee is taken by the first submission that names a
 * card. That is why the button says "Set your lineup" rather than "Pay 40
 * gems" — the gems go when the lineup does, and a button that claimed to take
 * them here would be describing a charge that has not happened.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useContests, type Contest } from '@/components/contests/use-contests';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ContestSheet() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { contests, loading, error } = useContests();
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

  /* Replaces rather than pushes: the sheet is the way IN to the board, not a
     step you come back through. Leaving it on the stack would put a contest
     you have already entered behind the lineup you entered it with. */
  const open = useCallback(() => {
    if (!contest) return;
    router.dismissTo({
      pathname: '/fantasy/compete',
      params: { contest: contest.code },
    });
  }, [router, contest]);

  const entered = contest?.mine != null;
  const full =
    contest?.maxEntrants != null && contest.entrants >= contest.maxEntrants && !entered;
  const broke = Boolean(contest && !entered && !contest.affordable);

  const action = entered
    ? 'Open your lineup'
    : full
      ? 'Contest is full'
      : broke
        ? `Costs ${contest?.entryFeeGems} gems`
        : 'Set your lineup';

  return (
    <PlayerSheetFrame
      title={contest?.name}
      subtitle={contest ? `${contest.formatName} · ${contest.slotCount} cards` : undefined}
      onClose={close}
      closeLabel="Close contest"
      footer={
        contest ? (
          <FooterButton label={action} disabled={full || broke} onPress={open} />
        ) : null
      }>
      {error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      ) : loading && !contest ? null : !contest ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          That contest is no longer open.
        </Text>
      ) : (
        <View style={styles.body}>
          <Facts contest={contest} />

          {/* THE RULE, said here because here is where somebody decides to
              take it on. It is the reason a second contest costs you something
              real rather than being a second place to put the same eight
              cards, and it is invisible on the board — you meet it there only
              as a refusal. */}
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            A card can only play in one contest a week. Whatever you field here
            comes out of the cards you are not already playing.
          </Text>

          {contest.entryFeeGems > 0 ? (
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              {entered
                ? 'You are in. The entry has been paid.'
                : `The ${contest.entryFeeGems} gems are taken when you submit your first lineup, not now.`}
            </Text>
          ) : null}
        </View>
      )}
    </PlayerSheetFrame>
  );
}

/** The three numbers, as rows rather than prose. */
function Facts({ contest }: { contest: Contest }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const rows: [string, string][] = [
    ['Format', `${contest.formatName} · ${contest.slotCount} cards`],
    ['Entry', contest.entryFeeGems > 0 ? `${contest.entryFeeGems} gems` : 'Free'],
    [
      'Entered',
      contest.maxEntrants != null
        ? `${contest.entrants} of ${contest.maxEntrants}`
        : `${contest.entrants}`,
    ],
  ];

  return (
    <View style={styles.facts}>
      {rows.map(([label, value]) => (
        <View key={label} style={[styles.factRow, { borderBottomColor: c.border }]}>
          <Text style={[Type.fine, { color: c.textSecondary }]}>{label}</Text>
          <Text style={[Type.body, { color: c.text }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function FooterButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? c.surface : c.text,
          color: disabled ? c.textSecondary : c.background,
        },
      ]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  facts: { gap: 0 },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  button: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
