/**
 * One set's checklist, presented over the app.
 *
 * WHY IT IS A SHEET, AND WHY IT IS THE PROFILE'S SHEET
 *
 * A checklist is something you open off a row, act on, and put down again — the
 * same kind of object as a player profile, so it takes the same presentation
 * rather than a second one invented for it. `PlayerSheetFrame` lives under
 * `components/players` because that is where it was written; it is a general
 * sheet, used by three routes now, and moving it would be churn for a filename.
 *
 * The frame fades its title in on scroll, which assumes something below it
 * carrying the same name at full size. That is exactly the shape here: the set
 * name and its progress are the hero, and the header title takes over once the
 * hero has scrolled away.
 *
 * TWO READS, ONE REQUEST. The set's own row comes from the SAME session cache
 * the list behind this sheet reads, so opening a checklist costs one request
 * (the members) rather than two — and the hero cannot disagree with the row
 * that was pressed. Only `set_checklist` goes to the network.
 *
 * THIS SCREEN OWNS THE ONLY DESTRUCTIVE ACTION IN THE SETS FEATURE, which is
 * why the confirm dialog lives here rather than inside the checklist: adding
 * cards BURNS them, and the dialog says how many, what they pay, how many are
 * the only copy of that player, and names anything above bronze. It is the same
 * `destructive` treatment the sell dialog gets on the card page, because it is
 * the same class of act.
 *
 * IT ALSO OWNS THE SELECTION, and that is deliberate rather than incidental.
 * The checklist draws ticks and reports taps; what is ticked has to outlive a
 * filter change, has to be cleared exactly once — after a submission that
 * worked — and has to be readable by the dialog. Keeping it in the child and
 * reaching in to reset it would be all three of those problems at once.
 *
 * ONE COMMIT PATH, NOT TWO. `commit_cards_to_set` takes an array and handles a
 * single card as happily as twelve, so the per-row commit RPC has no caller
 * here any more — it is the primitive the bulk one loops over, and one path
 * means one confirmation, one error state and one thing to keep right.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  countsOf,
  SetActions,
  SetChecklist,
  SetFilters,
  type SetFilter,
  type SetMember,
} from '@/components/collection/SetChecklist';
import {
  autofillSelection,
  fillWarning,
  lineupWarning,
  planFor,
  remainingOf,
  setTone,
  type CardSet,
} from '@/components/collection/sets';
import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets, useSets } from '@/components/collection/use-sets';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

/** The shape of the nested lineup read in `load`. */
type LineupRead = {
  week: number;
  lineup_slots: { card_instances: { card_id: string } | null }[] | null;
};

export default function SetChecklistScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { refresh: refreshPlayer } = usePlayer();

  const { sets, reload } = useSets();
  const set = useMemo<CardSet | null>(
    () => sets?.find((s) => s.code === code) ?? null,
    [sets, code],
  );

  const [members, setMembers] = useState<SetMember[] | null>(null);
  /**
   * Which slice of the set is on screen.
   *
   * IT LIVES HERE BECAUSE IT IS DRAWN TWICE. The row belongs above the grid,
   * where it reads as the grid's control — but the grid is thirty cards deep
   * and the sheet's bar is the only thing left on screen by the time you are
   * looking at the ones that matter, so the same row appears there once its
   * first copy has scrolled away. One piece of state, two rows; the checklist
   * draws the one in flow and the frame draws the one in the bar.
   */
  const [filter, setFilter] = useState<SetFilter>('ALL');
  /** Where that first row ends, reported by the checklist that drew it. */
  const [filtersEnd, setFiltersEnd] = useState<number | undefined>(undefined);
  /* Whether this set has an action at all. A set you hold no card for offers
     nothing to autofill and nothing to submit, so it gets no bar — see the
     `footer` prop, which must be absent rather than empty. */
  const canAdd = useMemo(() => countsOf(members ?? []).CAN_ADD, [members]);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  /** Card ids ticked for the next submission. */
  const [selected, setSelected] = useState<string[]>([]);
  /** True while the submission's confirmation is open. */
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** What the last submission actually did, kept until the next one starts. */
  const [added, setAdded] = useState<{
    added: number;
    skipped: number;
    paid: number;
    /** Lineup slots the server emptied to make the burn safe. */
    freed: number;
  } | null>(null);
  /**
   * Card ids the player is currently STARTING, in any week not yet scored.
   *
   * By card rather than by copy, and that is the honest granularity available
   * here: `commit_candidate` picks the lowest-earning copy you hold, so with a
   * duplicate the copy that burns may not be the one on the field. The
   * checklist cannot know which without reimplementing that ordering, and a
   * second copy of the rule is exactly the kind of drift this codebase keeps
   * paying for. So the warning is phrased as a possibility and the RESULT
   * reports what actually happened — see `added.freed`.
   */
  const [starting, setStarting] = useState<Set<string>>(() => new Set());

  const load = useCallback<Load>(
    async (live) => {
      if (!code) return 'No set was named.';
      /* The lineup read rides along with the checklist rather than getting its
         own effect: they are drawn by the same screen at the same moment, and
         two loaders would let the grid render before it knows which of its
         cards are on the field. RLS scopes both to the caller. */
      const [checklist, lineups] = await Promise.all([
        supabase.rpc('set_checklist', { p_set_code: code }),
        supabase
          .from('lineups')
          .select('week, lineup_slots(card_instances(card_id))')
          .is('scored_at', null),
      ]);
      if (!live()) return;
      if (checklist.error) return checklist.error.message;
      setMembers((checklist.data ?? []) as SetMember[]);

      /* A failed lineup read costs the warning, not the screen. The server
         refuses or frees the slot on its own either way, so the checklist is
         still correct without it — just quieter than it should be. */
      if (!lineups.error) {
        const ids = new Set<string>();
        for (const row of (lineups.data ?? []) as LineupRead[]) {
          for (const slot of row.lineup_slots ?? []) {
            const cardId = slot.card_instances?.card_id;
            if (cardId) ids.add(cardId);
          }
        }
        setStarting(ids);
      }
    },
    [code],
  );

  const { loading, error, refresh: reloadMembers } = useLoader(load);

  const claim = useCallback(async () => {
    if (!set) return;
    setClaiming(true);
    setClaimError(null);
    // Everything — the completion check, the payout, the ledger row — happens
    // inside this one call, server-side. Nothing is credited here.
    const { error: err } = await supabase.rpc('claim_set_reward', { p_set_code: set.code });
    if (err) setClaimError(err.message);
    // Both matter: the hero redraws as claimed, and the header shows the gems
    // that just landed.
    else await Promise.all([reload(), refreshPlayer()]);
    setClaiming(false);
  }, [set, reload, refreshPlayer]);

  const plan = useMemo(() => planFor(members ?? [], selected), [members, selected]);

  /**
   * One card being added on its own, from a card's plus badge — the shortcut
   * past the batch.
   *
   * HELD SEPARATELY FROM `selected`, deliberately. The obvious shortcut is to
   * set the selection to that one id and open the same dialog, and it quietly
   * throws away whatever the player had already ticked or autofilled. A
   * distinct id means the batch survives a quick add, and the two can even be
   * pending at once without either being surprising.
   */
  const [quick, setQuick] = useState<string | null>(null);

  /* What the dialog is about to do, from whichever path opened it. Everything
     downstream — the title, the warning, the price, the RPC — reads this and
     not `plan`, which is why there is one destructive path rather than two. */
  const confirmPlan = useMemo(
    () => (quick ? planFor(members ?? [], [quick]) : plan),
    [quick, members, plan],
  );

  /**
   * The players in this submission who are currently starting.
   *
   * Named rather than counted: "2 of these are in your lineup" makes the reader
   * go and work out which two, and the whole point of the warning is that they
   * may not have realised any were.
   */
  const startingInPlan = useMemo(() => {
    if (!members) return [];
    const ids = new Set(confirmPlan.cardIds);
    return members
      .filter((m) => ids.has(m.card_id) && starting.has(m.card_id))
      .map((m) => m.player_name);
  }, [members, confirmPlan, starting]);


  const toggle = useCallback((member: SetMember) => {
    setSelected((held) =>
      held.includes(member.card_id)
        ? held.filter((id) => id !== member.card_id)
        : [...held, member.card_id],
    );
  }, []);

  /* PROPOSES, does not decide. It replaces the selection rather than adding to
     it, because "autofill" pressed twice should give the same answer both times
     — an accumulating version would quietly grow past what the player last
     looked at. */
  const autofill = useCallback(() => {
    if (!set) return;
    setSelected(autofillSelection(members ?? [], remainingOf(set)));
  }, [set, members]);

  const submit = useCallback(async () => {
    if (!set || confirmPlan.cardIds.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    /* The server takes the list in order and skips whatever its own rules
       refuse — a card that went into a lineup since this screen was drawn, say
       — rather than failing the whole run. Both halves come back. */
    const { data, error: err } = await supabase.rpc('commit_cards_to_set', {
      p_set_code: set.code,
      p_card_ids: confirmPlan.cardIds,
    });

    if (err) {
      // Held open, with the reason in place. Closing would leave the list
      // unchanged and no explanation, which reads as the button doing nothing.
      setSubmitError(err.message);
      setSubmitting(false);
      return;
    }

    const result = (data ?? {}) as {
      added?: number;
      skipped?: number;
      paid?: number;
      lineup_freed?: number;
    };
    setAdded({
      added: result.added ?? 0,
      skipped: result.skipped ?? 0,
      paid: result.paid ?? 0,
      freed: result.lineup_freed ?? 0,
    });

    /* THREE THINGS MOVED, and all three are held for the session: the checklist
       (those slots are filled), the set list (progress and the cards-ready
       count), and the collection (cards are gone from it). The wallet moved
       too, which is the header's. Missing any one of them shows a card that no
       longer exists. */
    invalidateCollection();
    /* `reloadMembers` re-runs the lineup read as well, which matters here: a
       commit that freed a slot has changed who is starting, and the warning
       must not go on naming a player who is no longer on the field. */
    /* The set LIST too, and its absence here is what made a freshly-committed
       set show its old progress when you went back. The comment above has named
       the set list as one of the three things that moved since this was
       written; `reload()` below re-reads the list this screen holds, but the
       sets tab keeps its own session-cached copy and nothing was dropping it. */
    invalidateSets();
    await Promise.all([reloadMembers(), reload(), refreshPlayer()]);
    /* Cleared only on success. A failed submission must leave the batch intact
       so the player can retry it rather than rebuild it.

       The submitted ids are dropped from the batch rather than the batch being
       emptied, which is what makes a quick add safe to do mid-batch: it takes
       its own card out and leaves the rest ticked. For a batch submit the two
       are the same thing, since every id in the plan came from the batch. */
    const done = new Set(confirmPlan.cardIds);
    setSelected((held) => held.filter((id) => !done.has(id)));
    setQuick(null);
    setSubmitting(false);
    setConfirming(false);
  }, [set, confirmPlan, reloadMembers, reload, refreshPlayer]);

  /* Guarded for the same reason as `packs` and `search`: `back()` on an empty
     stack does nothing, so a checklist opened from a link or a refreshed tab
     had a close button that did not close. Sets is this sheet's landing page. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/sets');
  }, [router]);

  return (
    <PlayerSheetFrame
      title={set?.name}
      subtitle={set?.subtitle ?? undefined}
      /* The club for a team set, the position for a daily — see `setTone`. A
         checklist is about something too, and was the last sheet opening as a
         plain dark panel while its siblings carried a colour. */
      tone={set ? setTone(set) : null}
      /* Only once there is something to filter. A row of chips over an empty
         sheet is furniture, and while the members are loading that is exactly
         what it would be. */
      pinned={
        members && members.length > 0 ? (
          <SetFilters members={members} filter={filter} onFilter={setFilter} />
        ) : undefined
      }
      pinnedAt={filtersEnd}
      onClose={close}
      closeLabel="Close set checklist"
      /* CONDITIONAL, not a component that returns null: the frame draws a bar
         around whatever it is handed, so a footer that rendered nothing would
         pin an empty strip to the bottom of the sheet. A set you hold no card
         for has no action, and therefore no bar. */
      footer={
        canAdd === 0 ? undefined : (
          <SetActions
            set={set}
            members={members ?? []}
            selected={selected}
            submitting={submitting}
            onAutofill={autofill}
            onClear={() => setSelected([])}
            onSubmit={() => {
              setSubmitError(null);
              setAdded(null);
              // The batch path. `quick` must be cleared or a stale one from an
              // earlier badge tap would decide what this dialog submits.
              setQuick(null);
              setConfirming(true);
            }}
          />
        )
      }>
      {loading && members === null ? (
        <View style={styles.centred}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={[Type.section, { color: c.text }]}>Could not load this set</Text>
          <Text style={[Type.body, styles.centredText, { color: c.textSecondary }]}>{error}</Text>
        </View>
      ) : (
        <>
          {/* WHAT THE FILL ACTUALLY DID, which is not always what it offered:
              the server skips any card its rules refuse rather than failing the
              run, so a fill can come back having added fewer than it asked for.
              Saying nothing here would leave the player to spot the difference
              by counting rows. */}
          {added ? (
            <View style={[styles.notice, { borderColor: c.positive, backgroundColor: c.surface }]}>
              <Text style={[Type.micro, { color: c.positive }]}>ADDED</Text>
              <Text style={[Type.body, { color: c.text }]}>
                {`${added.added} ${added.added === 1 ? 'card' : 'cards'} into the set for ${added.paid} gems.${
                  added.skipped > 0
                    ? ` ${added.skipped} could not be added — check the list below.`
                    : ''
                }${
                  /* Stated as fact, because by now it IS one. The dialog could
                     only warn that this might happen — see `starting`. */
                  added.freed > 0
                    ? added.freed === 1
                      ? ' One of them came out of your lineup, leaving an empty slot.'
                      : ` ${added.freed} of them came out of your lineup, leaving empty slots.`
                    : ''
                }`}
              </Text>
            </View>
          ) : null}

          <SetChecklist
            set={set}
            members={members ?? []}
            claiming={claiming}
            claimError={claimError}
            selected={selected}
            submitting={submitting}
            filter={filter}
            onFilter={setFilter}
            onFiltersEnd={setFiltersEnd}
            onClaim={() => void claim()}
            onToggle={toggle}
            onQuickAdd={(member) => {
              setSubmitError(null);
              setAdded(null);
              setQuick(member.card_id);
              setConfirming(true);
            }}
          />
        </>
      )}

      {/* Everything the player is about to give up, before it happens — and
          the only destructive step in the whole feature. Every tap before this
          one is reversible by tapping again. `destructive`, same as selling,
          because it is the same kind of act. */}
      <ConfirmDialog
        visible={confirming}
        title={
          set
            ? confirmPlan.cards === 1
              ? `Add 1 card to ${set.name}?`
              : `Add ${confirmPlan.cards} cards to ${set.name}?`
            : ''
        }
        body={set ? fillWarning(set, confirmPlan) : undefined}
        /* The one consequence that lands on a DIFFERENT screen, so it is set
           apart rather than folded into the paragraph above. See ConfirmDialog. */
        warning={lineupWarning(startingInPlan)}
        confirmLabel={`Add ${confirmPlan.cards} for ${confirmPlan.gems}`}
        destructive
        busy={submitting}
        error={submitError}
        onConfirm={() => void submit()}
        onCancel={() => {
          if (submitting) return;
          setConfirming(false);
          setSubmitError(null);
          // A cancelled quick add leaves nothing behind; the batch is untouched
          // either way because it was never what this dialog was holding.
          setQuick(null);
        }}
      />
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  centredText: { textAlign: 'center' },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    padding: Spacing.two + 2,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
