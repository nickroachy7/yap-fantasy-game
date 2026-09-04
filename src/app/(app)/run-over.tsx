/**
 * The death screen: what the run did, and which cards survive it.
 *
 * ---------------------------------------------------------------------------
 * THIS SCREEN IS THE FEATURE, AND IT IS A RESTORE
 * ---------------------------------------------------------------------------
 *
 * The loss has already happened. `settle_run_week` wipes in the same statement
 * that ends the run (20260825235000), so there is nothing here to rescue —
 * these cards are gone, and the ladder's allowance buys some of them BACK.
 *
 * It read the other way round first: settlement ended the run and this screen
 * did the wiping. That made the whole mechanic optional, because nothing forced
 * anybody to open it — die, never come here, keep everything forever. The
 * inversion closes that, and it costs the screen nothing, because choosing
 * which two cards come back is the same decision as choosing which two survive.
 * All that is lost is the option not to answer.
 *
 * SO THE CHOICE IS THE WHOLE LAYOUT. The record is a line; what it cost is a
 * line; the grid of cards the run took is the page.
 *
 * ---------------------------------------------------------------------------
 * IT IS A SCREEN, NOT A MODAL, AND IT DOES NOT TRAP ANYBODY
 * ---------------------------------------------------------------------------
 *
 * The obvious build is a dialog nothing dismisses until it is answered — the
 * run is over, so what else is there to do? There is: the free contest. It
 * risks no hearts, belongs to no run, and is specifically the floor a dead
 * player still has (see the seed note in 20260825130000). A modal over the top
 * of the app would take that away and turn a death into a lockout, which is the
 * one thing a weekly game cannot afford — a roguelike whose death screen is
 * followed by nothing to do is a suspension.
 *
 * So it is a route you are pointed at and can leave. The carry does not expire,
 * `current_run` will not start a new run over it, and every contest with a
 * heart on it refuses until it is answered. The pressure is real without the
 * door being locked.
 *
 * ---------------------------------------------------------------------------
 * ZERO SLOTS IS A STATE, NOT AN ERROR
 * ---------------------------------------------------------------------------
 *
 * A run that died under three wins keeps nothing, and that is the common case
 * for a first run — it has to be, or the first death teaches nothing. The page
 * still has to be worth opening: it shows the record, says plainly that nothing
 * carries, and names the rung that would have changed it. "Three wins would
 * have kept a card" is the sentence that makes the next run different.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { runWiped } from '@/components/icons/glyphs';

import { InventoryCard } from '@/components/collection/InventoryCard';
import { invalidateCollection } from '@/components/collection/use-collection';
import { Hearts } from '@/components/runs/Hearts';
import { useLostCards } from '@/components/runs/use-lost-cards';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function RunOverScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { run, refresh, applyCardDelta } = usePlayer();
  const { cards, loading } = useLostCards();

  const [keep, setKeep] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* MEASURED, not derived from the window — the same reasoning as the
     inventory grid, and the same failure if it is not: recomputing the column
     width here would mean restating the frame's content cap and rail width,
     and getting either wrong pushes the last card in every row past the edge.
     Three across, matching the collection, because these are the same cards. */
  const [boxWidth, setBoxWidth] = useState(0);
  const itemWidth = boxWidth > 0 ? Math.floor((boxWidth - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  const slots = run?.carrySlots ?? 0;

  /* What the run took. A committed copy was never in the collection to be
     taken, so it is not in this list — which is the promise the whole feature
     is sold on, and the reason the grid can be labelled without a caveat. */
  const taken = cards ?? [];

  const toggle = useCallback(
    (id: string) => {
      setError(null);
      setKeep((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        /* The allowance is a ceiling the server enforces (`claim_carry` refuses
           an over-long list rather than truncating it). Refusing the tap here
           as well means the player meets the limit at the moment they reach it,
           instead of at the moment they commit. */
        if (prev.length >= slots) return prev;
        return [...prev, id];
      });
    },
    [slots],
  );

  const onClaim = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('claim_carry', {
      p_card_instance_ids: keep,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    /* The collection is session-cached and has just gained the restored copies,
       so it has to be dropped rather than refreshed around — see the note on
       `invalidateCollection`. The player context reloads hearts and the wallet,
       both of which the new run resets. */
    /* A carry RESTORES copies, so this is the one delta that goes up outside a
       pack. `keep` is what the claim asked for and the call has just succeeded,
       so it is also what landed. See `applyCardDelta`. */
    applyCardDelta(keep.length);
    invalidateCollection();
    await refresh();
    setBusy(false);
    /* The board, not the lobby. The lobby is a sheet over this board now, and
       replacing a page with a sheet leaves nothing underneath it to close onto
       — see `CONTESTS` in `sections.ts`. Landing on Compete puts the new run's
       free contest in front of them with the carousel's last card offering the
       lobby one swipe away. */
    router.replace('/fantasy/compete');
  }, [keep, refresh, applyCardDelta, router]);

  /* Nothing to answer. Reachable by deep link, by a back button after claiming,
     and by two devices open at once — all of which end up here rather than at a
     screen describing a death that is already settled. */
  if (run && !run.awaitingCarry) {
    return (
      <Screen title="Run" measure="form">
        <EmptyState
          title="Your run is live"
          body="Nothing to claim. Hearts are shown at the top of every screen."
        />
      </Screen>
    );
  }

  const record = run ? `${run.wins}-${run.losses}` : '—';

  return (
    <Screen title="Run over" measure="grid" context={`${record} · out of hearts`}>
      {/* WHAT HAPPENED, in the order it matters: the hearts are gone, this is
          what the run did, and this is what that buys. */}
      <Panel title="The run">
        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            {/* THE RUN'S OWN RACK, fully broken. Not the ceiling: a run that
                never healed above three should show three cracked hearts, not
                five, or the screen overstates what was lost on the one page
                that must not. */}
            <Hearts hearts={0} rack={run?.rack ?? 3} size={16} />
            {/* The outcome mark sits on the LABEL's line, not the rack's.
                `run-wiped` rather than another broken heart: the rack above is
                already saying the hearts are gone, and a second heart would
                repeat it instead of naming what that meant for the run. */}
            <View style={styles.outcome}>
              <Icon glyph={runWiped} color={c.negative} size={16} focused />
              <Text style={[Type.fine, { color: c.textSecondary }]}>Out of hearts</Text>
            </View>
          </View>
          <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{record}</Text>
        </View>

        {/* PAST TENSE, because it is. The wipe ran at settlement and saying
            "everything else goes" would describe it as pending — which is the
            one thing a player might then try to act on. */}
        <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
          {slots > 0
            ? `The run took ${run?.lostCards ?? 0} card${run?.lostCards === 1 ? '' : 's'} and your coins. ${run?.wins} win${run?.wins === 1 ? '' : 's'} brings ${slots} card${slots === 1 ? '' : 's'} back.`
            : `The run took ${run?.lostCards ?? 0} card${run?.lostCards === 1 ? '' : 's'} and your coins. Under three wins brings nothing back.`}
        </Text>

        {/* SET PROGRESS SURVIVING IS THE PROMISE, so it is stated on the screen
            that would otherwise look like it takes everything. */}
        <Text style={[Type.fine, styles.note, { color: c.textSecondary }]}>
          Your sets are untouched. Committed cards and claimed rewards carry
          across every run.
        </Text>
      </Panel>

      {slots > 0 ? (
        <Panel
          title="Bring back"
          action={`${keep.length} of ${slots}`}>
          {loading && cards === null ? (
            <ActivityIndicator />
          ) : taken.length === 0 ? (
            <EmptyState
              pad={false}
              title="The run took nothing"
              body="There were no cards in your collection when it ended."
            />
          ) : (
            <View
              style={styles.grid}
              onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
              {itemWidth > 0
                ? taken.map((card) => (
                    /* `selecting` is always on here. The inventory turns it on
                       and off because selecting is a mode there; on this screen
                       there is nothing else to do to a card, so a mode would be
                       a switch with one position. */
                    <InventoryCard
                      key={card.id}
                      card={card}
                      width={itemWidth}
                      selecting
                      selected={keep.includes(card.id)}
                      onPress={() => toggle(card.id)}
                    />
                  ))
                : null}
            </View>
          )}
        </Panel>
      ) : null}

      {error ? (
        <View style={[styles.error, { borderColor: c.negative }]}>
          <Text style={[Type.fine, { color: c.text }]}>{error}</Text>
        </View>
      ) : null}

      {/* THE VERB IS "START", NOT "CONFIRM". What the player is agreeing to is
          the next run; the wipe is the price, and it has been named twice
          already. A destructive verb here would make the only way forward read
          as the dangerous option. */}
      <Pressable
        onPress={onClaim}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: c.text, opacity: busy ? 0.5 : 1 },
          pressed && styles.pressed,
        ]}>
        {busy ? (
          <ActivityIndicator color={c.background} />
        ) : (
          <Text style={[Type.strong, { color: c.background }]}>
            {slots > 0 && keep.length > 0
              ? `Bring back ${keep.length} and start a new run`
              : 'Start a new run'}
          </Text>
        )}
      </Pressable>

      {slots > 0 && keep.length < slots ? (
        <Text style={[Type.fine, styles.note, { color: c.textSecondary }]}>
          {`You can still bring back ${slots - keep.length} more.`}
        </Text>
      ) : null}
    </Screen>
  );
}

/* Three across, matching the inventory. The cards being chosen from are the
   same cards, and a different shape here would make them read as a different
   object at the worst possible moment. */
const COLUMNS = 3;
const GAP = Spacing.two;

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  summaryLeft: { gap: Spacing.one },
  outcome: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  note: { marginTop: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  pressed: { opacity: 0.6 },
  error: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.two,
    marginTop: Spacing.two,
  },
  cta: {
    marginTop: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.control,
  },
});
