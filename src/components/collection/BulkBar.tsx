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

import { Gem } from '@/components/shell/AppHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CommitPlan } from './bulk';

export type BulkStage = 'idle' | 'selling' | 'adding';

/** What a finished run did, in the words the bar reports it with. */
export type BulkResult = {
  kind: 'sold' | 'added';
  done: number;
  skipped: number;
  gems: number;
  /** The first refusal's reason, verbatim from the server. */
  firstReason: string | null;
};

export function BulkBar({
  count,
  max,
  sellGems,
  plan,
  planning,
  stage,
  busy,
  error,
  result,
  onSell,
  onAdd,
  onConfirmSell,
  onConfirmAdd,
  onCancelStage,
  onClear,
  onDismissResult,
}: {
  count: number;
  max: number;
  /** What selling the ticked copies pays, summed from their own prices. */
  sellGems: number;
  /** Null until the offers for this selection have been read. */
  plan: CommitPlan | null;
  planning: boolean;
  stage: BulkStage;
  busy: boolean;
  error: string | null;
  result: BulkResult | null;
  onSell: () => void;
  onAdd: () => void;
  onConfirmSell: () => void;
  onConfirmAdd: () => void;
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
              {`${result.done} ${result.kind === 'sold' ? 'sold' : 'added'} for ${result.gems} gems.`}
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
            accessibilityLabel={`Sell ${count} selected cards for ${sellGems} gems`}
            style={({ pressed }) => [
              styles.action,
              { borderColor: c.border, backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
              (busy || count === 0) && styles.dim,
            ]}>
            <Text numberOfLines={1} style={[Type.strong, { color: c.textSecondary }]}>
              Sell
            </Text>
            <Gem size={10} color={gold} />
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{sellGems}</Text>
          </Pressable>
        </View>
      </View>

      <ConfirmDialog
        visible={stage === 'selling'}
        title={count === 1 ? 'Sell 1 card?' : `Sell ${count} cards?`}
        body={`You will receive ${sellGems} gems. Every copy and everything it has earned goes for good, and pulling those players again starts new cards at bronze.`}
        /* The one refusal a grid cannot show. A card that went into a lineup
           since this screen was drawn is skipped rather than sold, and saying so
           here is cheaper than explaining it afterwards. */
        warning="Any copy standing in a lineup that has not been scored yet will be skipped."
        confirmLabel={`Sell for ${sellGems}`}
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
        confirmLabel={plan ? `Add for ${plan.gems}` : ''}
        destructive
        busy={busy}
        error={error}
        onConfirm={onConfirmAdd}
        onCancel={onCancelStage}
      />
    </>
  );
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

  const lead = `Going into ${where}, paying ${plan.gems} gems. A committed card is burnt: it leaves your collection for good and cannot be started or sold again.`;

  const left: string[] = [];
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
