/**
 * What you can do with a handful of cards at once.
 *
 * The inventory can put itself into multi-select; this is the bar that appears
 * when it does, and the two confirmations behind it. It sits at the bottom
 * because that is where the thumb already is on the screen you scroll most, and
 * because a bar that pushed the grid down would reflow every row the moment you
 * ticked the first card.
 *
 * BOTH ACTIONS ARE BULK VERSIONS OF ONE THE PLAYER ALREADY HAS, and both go
 * through server functions that are themselves loops over the single-card ones
 * — `sell_cards` over `sell_card`, `commit_cards_to_set` over
 * `commit_card_to_set`. Nothing here re-implements a rule. What it does do is
 * decide which cards go to which set, which is real work with no server
 * equivalent: see `planCommits`.
 *
 * ---------------------------------------------------------------------------
 * THE CONFIRMATION IS THE FEATURE
 * ---------------------------------------------------------------------------
 *
 * A bulk destructive action's danger is not the tap, it is that you cannot see
 * what you are agreeing to. So the dialogs name the whole shape of it before it
 * happens — how many copies, how many sets, what it pays — and, more
 * importantly, what the plan is NOT going to do: copies that belong to no open
 * set, and second copies of a player already going in. Both are common in a
 * real selection and both would otherwise look like the action silently
 * dropping cards.
 *
 * AND PARTIAL SUCCESS IS REPORTED AFTERWARDS. Both server functions skip what
 * their rules refuse and hand back the reasons; a card that went into a lineup
 * since the grid was drawn is the ordinary case. `result` is that report, and
 * it stays on screen until dismissed rather than flashing past.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Coin } from '@/components/shell/AppHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CommitPlan } from './bulk';

/**
 * `leftovers` is the one stage the player does not open themselves.
 *
 * It follows the add — either instead of it, when no set would take anything,
 * or straight after it — and offers to sell exactly the copies a set could not
 * use. That is the moment those cards are known to be spare, and the moment the
 * player is least likely to want to keep them; making them re-tick the same
 * cards on the grid to act on what they have just been told would be the
 * feature refusing to finish its own sentence.
 */
export type BulkStage = 'idle' | 'selling' | 'adding' | 'leftovers';

/** What a finished run did, in the words the bar reports it with. */
export type BulkResult = {
  kind: 'sold' | 'added';
  done: number;
  skipped: number;
  coins: number;
  /** The first refusal's reason, verbatim from the server. */
  firstReason: string | null;
};

export function BulkBar({
  count,
  max,
  sellCoins,
  plan,
  planning,
  stage,
  busy,
  error,
  notice,
  result,
  onSell,
  onAdd,
  onConfirmSell,
  onConfirmAdd,
  onConfirmSellLeftovers,
  onCancelStage,
  onClear,
  onDismissResult,
}: {
  count: number;
  max: number;
  /** What selling the ticked copies pays, summed from their own prices. */
  sellCoins: number;
  /** Null until the offers for this selection have been read. */
  plan: CommitPlan | null;
  planning: boolean;
  stage: BulkStage;
  busy: boolean;
  error: string | null;
  /**
   * Why the last tap did not tick anything.
   *
   * SEPARATE FROM `error`, which is a run that failed. This is a press that
   * never became a run — a card in your lineup, which cannot be sold and must
   * not be burnt out of the slot it is standing in. Different news, different
   * tone: `error` is red because something went wrong, this is amber because
   * nothing did and the reader simply asked for something the rules do not
   * allow.
   */
  notice: string | null;
  result: BulkResult | null;
  onSell: () => void;
  onAdd: () => void;
  onConfirmSell: () => void;
  onConfirmAdd: () => void;
  onConfirmSellLeftovers: () => void;
  onCancelStage: () => void;
  onClear: () => void;
  onDismissResult: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const full = count >= max;

  return (
    <>
      <View style={[styles.bar, { backgroundColor: c.surfaceSheet, borderTopColor: c.border }]}>
        {/* WHAT IT DID, above what you can do next, and it survives the
            selection being cleared — the point of the line is to be read after
            the cards have gone. */}
        {result ? (
          <Pressable
            onPress={onDismissResult}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={({ pressed }) => [
              styles.result,
              { borderColor: result.skipped > 0 ? c.warning : c.positive },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.fine, { color: c.text }]}>
              {`${result.done} ${result.kind === 'sold' ? 'sold' : 'added'} for ${result.coins} coins.`}
              {result.skipped > 0
                ? ` ${result.skipped} skipped${result.firstReason ? ` — ${result.firstReason}` : ''}.`
                : ''}
            </Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={[styles.result, { borderColor: c.negative }]}>
            <Text style={[Type.fine, { color: c.text }]}>{error}</Text>
          </View>
        ) : null}

        {/* UNDER a failure rather than instead of one: a run that broke is the
            more urgent of the two, and a refused tap is still worth saying
            while the reader looks at the cell that refused it. */}
        {notice ? (
          <View style={[styles.result, { borderColor: c.warning }]}>
            <Text style={[Type.fine, { color: c.text }]}>{notice}</Text>
          </View>
        ) : null}

        {/* TWO ROWS, ALWAYS, and it is not a phone-only concession. On one
            row the count is the only element that can give, so at 327pt it was
            squeezed to about thirty points and "12 selected" wrapped to one
            character per line while the buttons beside it sat at their full
            size. What the bar says and what the bar does are different jobs;
            stacking them lets each have the width it needs. */}
        <View style={styles.row}>
          <Text numberOfLines={1} style={[Type.strong, NUMERIC, styles.count, { color: c.text }]}>
            {`${count} selected`}
          </Text>
          {/* The ceiling, and only once it is reached. Stating it up front
              would answer a question nobody has yet — both server functions
              refuse past this, so it has to be sayable, but it is news exactly
              once. */}
          {full ? (
            <Text style={[Type.fine, { color: c.textTertiary }]}>{`${max} at a time`}</Text>
          ) : null}
          <Pressable
            onPress={onClear}
            disabled={busy || count === 0}
            accessibilityRole="button"
            accessibilityLabel="Clear the selection"
            style={({ pressed }) => [
              styles.quiet,
              pressed && styles.pressed,
              (busy || count === 0) && styles.dim,
            ]}>
            <Text style={[Type.strong, { color: c.textSecondary }]}>Clear</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={onAdd}
            disabled={busy || count === 0}
            accessibilityRole="button"
            accessibilityLabel={`Add ${count} selected cards to sets`}
            style={({ pressed }) => [
              styles.action,
              { borderColor: gold, backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
              (busy || count === 0) && styles.dim,
            ]}>
            {planning ? (
              <ActivityIndicator />
            ) : (
              <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
                Add to sets
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={onSell}
            disabled={busy || count === 0}
            accessibilityRole="button"
            accessibilityLabel={`Sell ${count} selected cards for ${sellCoins} coins`}
            style={({ pressed }) => [
              styles.action,
              { borderColor: c.border, backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
              (busy || count === 0) && styles.dim,
            ]}>
            <Text numberOfLines={1} style={[Type.strong, { color: c.textSecondary }]}>
              Sell
            </Text>
            <Coin size={10} color={gold} />
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{sellCoins}</Text>
          </Pressable>
        </View>
      </View>

      <ConfirmDialog
        visible={stage === 'selling'}
        title={count === 1 ? 'Sell 1 card?' : `Sell ${count} cards?`}
        body={`You will receive ${sellCoins} coins. Every copy and everything it has earned goes for good, and pulling those players again starts new cards at bronze.`}
        /* The one refusal a grid cannot show. A card that went into a lineup
           since this screen was drawn is skipped rather than sold, and saying so
           here is cheaper than explaining it afterwards. */
        warning="Any copy standing in a lineup that has not been scored yet will be skipped."
        confirmLabel={`Sell for ${sellCoins}`}
        destructive
        busy={busy}
        error={error}
        onConfirm={onConfirmSell}
        onCancel={onCancelStage}
      />

      <ConfirmDialog
        visible={stage === 'adding'}
        title={
          plan
            ? plan.cards === 1
              ? 'Add 1 card to a set?'
              : `Add ${plan.cards} cards to ${plan.legs.length} ${plan.legs.length === 1 ? 'set' : 'sets'}?`
            : ''
        }
        body={plan ? addBody(plan) : undefined}
        /* THE COPY THAT BURNS IS NOT ALWAYS THE COPY YOU TICKED, and across a
           selection that is far easier to miss than it is on one card's own
           page. Only said when it is actually true of this plan. */
        warning={
          plan?.anySpare
            ? 'For players you hold more than one of, the least valuable copy is the one that burns — which may not be the copy you ticked.'
            : null
        }
        confirmLabel={plan ? `Add for ${plan.coins}` : ''}
        destructive
        busy={busy}
        error={error}
        onConfirm={onConfirmAdd}
        onCancel={onCancelStage}
      />

      {/* THE OFFER, and it is a question rather than a report. */}
      <ConfirmDialog
        visible={stage === 'leftovers'}
        title={plan ? leftoverTitle(plan) : ''}
        body={plan ? leftoverBody(plan) : undefined}
        confirmLabel={plan ? `Sell for ${leftoverCoins(plan)}` : ''}
        /* NOT "Cancel". There is nothing here to cancel — the add has already
           happened, or there was never anything to add — so the quiet button is
           the other real choice, which is to keep them. */
        cancelLabel="Keep them"
        destructive
        busy={busy}
        error={error}
        onConfirm={onConfirmSellLeftovers}
        onCancel={onCancelStage}
      />
    </>
  );
}

const leftoverCoins = (plan: CommitPlan): number =>
  plan.leftovers.reduce((n, x) => n + x.sellValue, 0);

/**
 * The title names the DOMINANT reason rather than the total.
 *
 * "4 cards could not be added" is true and says nothing; "3 are already in
 * their sets" is the thing the player did not know and the thing that makes the
 * offer make sense. The body carries the rest.
 */
function leftoverTitle(plan: CommitPlan): string {
  const n = plan.leftovers.length;
  const cards = n === 1 ? '1 card' : `${n} cards`;
  if (plan.alreadyIn >= plan.noSet && plan.alreadyIn >= plan.duplicate) {
    return plan.alreadyIn === n
      ? n === 1
        ? 'That player is already in a set'
        : `Those ${n} players are already in sets`
      : `${cards} could not go into a set`;
  }
  return `${cards} could not go into a set`;
}

function leftoverBody(plan: CommitPlan): string {
  const parts: string[] = [];
  if (plan.alreadyIn > 0) {
    parts.push(
      plan.alreadyIn === 1
        ? '1 is a player already in his set'
        : `${plan.alreadyIn} are players already in their sets`,
    );
  }
  if (plan.duplicate > 0) {
    parts.push(
      plan.duplicate === 1
        ? '1 is a second copy of a player going in on this run'
        : `${plan.duplicate} are further copies of players going in on this run`,
    );
  }
  if (plan.noSet > 0) {
    parts.push(
      plan.noSet === 1
        ? '1 belongs to no set with a slot open for it'
        : `${plan.noSet} belong to no set with a slot open for them`,
    );
  }

  const why = parts.length > 0 ? `${parts.join('; ')}. ` : '';
  return `${why}They are still yours — selling them pays ${leftoverCoins(plan)} coins, and everything they have earned goes with them.`;
}

/**
 * The paragraph under the title, and most of it is about what will NOT happen.
 *
 * A selection of twenty spares routinely contains eight the sets cannot take
 * and three second copies. Left unsaid, the run looks like it dropped them.
 */
function addBody(plan: CommitPlan): string {
  const names = plan.legs.map((l) => l.setName);
  const where =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

  const lead = `Going into ${where}, paying ${plan.coins} coins. A committed card is burnt: it leaves your collection for good and cannot be started or sold again.`;

  const left: string[] = [];
  if (plan.alreadyIn > 0) {
    left.push(
      plan.alreadyIn === 1
        ? '1 is a player already in his set'
        : `${plan.alreadyIn} are players already in their sets`,
    );
  }
  if (plan.duplicate > 0) {
    left.push(
      plan.duplicate === 1
        ? '1 copy is a second copy of a player already going in — a set slot is a player, so it takes one'
        : `${plan.duplicate} copies are further copies of players already going in — a set slot is a player, so it takes one`,
    );
  }
  if (plan.noSet > 0) {
    left.push(
      `${plan.noSet} ${plan.noSet === 1 ? 'belongs' : 'belong'} to no set with a slot open for ${plan.noSet === 1 ? 'it' : 'them'}`,
    );
  }

  return left.length > 0
    ? `${lead} Staying in your collection: ${left.join('; ')}.`
    : lead;
}

const styles = StyleSheet.create({
  /* Pinned by the screen, so this owns only its own inside. The top border is
     the whole separation — a shadow would need a colour that works on the four
     darks this app already has. */
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Takes the room the count line has spare; the ceiling note and Clear sit at
     their own size beside it. */
  count: { flex: 1, minWidth: 0 },
  quiet: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  action: {
    /* Equal halves of the action row. Neither is the primary: putting spares
       into sets and selling them are the same size of decision. */
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 40,
  },
  result: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
