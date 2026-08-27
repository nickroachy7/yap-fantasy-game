/**
 * The bar under the deck: the two speeds, then the two sweeps, then the way on.
 *
 * WHY THERE IS A BAR AT ALL
 *
 * Every control the pull used to have was attached to something — the reveal-all
 * chip sat in a counter row above the deck, the exits sat under each card, the
 * "open another" pair sat at the bottom of a scrolling sheet, so it was below
 * the fold on a phone. Nothing was where a thumb is. The bar is one fixed strip
 * at the bottom of the page that always holds THE thing to do next, and what
 * that is changes exactly three times:
 *
 *   1. CARDS STILL FACE DOWN — reveal, at two speeds. `Reveal` turns over the
 *      one in front of you and stops; `Reveal all` cascades through the rest.
 *      Both are here because "slowly, one at a time" and "just show me" are
 *      both legitimate ways to open a pack and neither should be the only one.
 *
 *   2. ALL TURNED OVER, WITH SPARES LEFT — the two sweeps. Adding eight cards
 *      to sets one at a time is eight presses of the same decision; this is one.
 *      See `pull-plan` for what each button will actually do.
 *
 *   3. NOTHING LEFT TO DECIDE — where to go: another pack, or the inventory.
 *
 * A SWEEP CONFIRMS IN PLACE. Pressing `Add 6 to sets` does not fire six writes;
 * it turns the bar into a sentence naming exactly what is about to happen and a
 * button that does it. Same pattern as the per-card exits, and for the same
 * reason: a second surface for a thing you do with your thumb on a page you are
 * scrolling is worse than a second tap.
 *
 * NOTHING HERE COMPUTES A FIGURE. The counts and the gems are the plan's, which
 * are the server's. See `pull-plan` and `card-actions`.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Sweep } from './pull-plan';
import type { Sweeping } from './use-pull-actions';

/** Which sweep the bar is asking about, or none. */
type Asking = 'commit' | 'sell' | null;

export function PullBar({
  total,
  hidden,
  cascading,
  plan,
  planning,
  sweep,
  busy,
  earned,
  onRevealNext,
  onRevealAll,
  onCommitAll,
  onSellAll,
  onAgain,
  onInventory,
}: {
  total: number;
  /** How many cards are still face down. */
  hidden: number;
  cascading: boolean;
  plan: Sweep;
  /** The offers have not landed yet, so the plan is not yet the truth. */
  planning: boolean;
  sweep: Sweeping | null;
  /** A single-card write is in flight somewhere in the deck. */
  busy: boolean;
  /** Gems this pack has paid out so far. */
  earned: number;
  onRevealNext: () => void;
  onRevealAll: () => void;
  onCommitAll: () => void;
  onSellAll: () => void;
  onAgain: () => void;
  onInventory: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const [asking, setAsking] = useState<Asking>(null);

  /* A QUESTION THE PLAN CAN NO LONGER ANSWER IS NOT A QUESTION, and it is
     dropped during render rather than cleared by an effect watching for it.
     Selling a card by hand while the sweep confirm is up changes what "sell 4
     spares" means, and an effect gets to draw one frame of the stale sentence
     before it corrects itself — over a button that commits to it. */
  const question: Asking =
    (asking === 'commit' && plan.commits.length === 0) ||
    (asking === 'sell' && plan.sells.length === 0)
      ? null
      : asking;

  const locked = busy || sweep !== null;

  /* ---- a sweep is running -------------------------------------------- */
  if (sweep) {
    return (
      <Frame earned={earned}>
        <View style={[styles.progress, { backgroundColor: c.backgroundElement }]}>
          <ActivityIndicator />
          <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
            {`${sweep.kind === 'sell' ? 'Selling' : 'Adding'} ${sweep.done} of ${sweep.total}`}
          </Text>
        </View>
      </Frame>
    );
  }

  /* ---- confirming a sweep --------------------------------------------- */
  if (question === 'commit') {
    const spares = plan.commits.filter((x) => x.spare).length;
    return (
      <Frame earned={earned}>
        <Text style={[Type.fine, styles.measure, { color: c.textSecondary }]}>
          {`Adds ${count(plan.commits.length, 'card')} to ${count(plan.setCount, 'set')} for ${plan.commitGems} gems. A card in a set is burnt and cannot be started again.`}
          {spares > 0
            ? ` ${count(spares, 'of these uses', 'of these use')} a spare copy you already hold, so ${spares === 1 ? 'that card stays' : 'those cards stay'} in your collection.`
            : ''}
        </Text>
        <View style={styles.row}>
          <Button label="Not now" onPress={() => setAsking(null)} tone={c.backgroundElement} ink={c.text} />
          <Button
            label={`Add ${plan.commits.length}`}
            gems={plan.commitGems}
            onPress={() => {
              setAsking(null);
              onCommitAll();
            }}
            tone={gold}
            ink="#17130A"
            grow
          />
        </View>
      </Frame>
    );
  }

  if (question === 'sell') {
    return (
      <Frame earned={earned}>
        <Text style={[Type.fine, styles.measure, { color: c.textSecondary }]}>
          {`Sells ${count(plan.sells.length, 'card')} for ${plan.sellGems} gems. Selling is permanent — a future copy starts again at bronze. No card a set can still use is in this.`}
        </Text>
        <View style={styles.row}>
          <Button label="Keep them" onPress={() => setAsking(null)} tone={c.backgroundElement} ink={c.text} />
          <Button
            label={`Sell ${plan.sells.length}`}
            gems={plan.sellGems}
            onPress={() => {
              setAsking(null);
              onSellAll();
            }}
            tone={c.negative}
            ink={c.background}
            grow
          />
        </View>
      </Frame>
    );
  }

  /* ---- cards still face down ------------------------------------------ */
  if (hidden > 0) {
    return (
      <Frame earned={earned}>
        <View style={styles.row}>
          <Button
            label="Reveal all"
            onPress={onRevealAll}
            tone={c.backgroundElement}
            ink={c.text}
            disabled={cascading}
            a11y={`Turn over the remaining ${hidden} cards`}
          />
          <Button
            label={hidden === total ? 'Reveal' : `Reveal · ${hidden} left`}
            onPress={onRevealNext}
            tone={gold}
            ink="#17130A"
            grow
            disabled={cascading}
            a11y="Turn over the next card"
          />
        </View>
      </Frame>
    );
  }

  /* ---- everything turned over, and something to sweep ------------------ */
  const canCommit = plan.commits.length > 0;
  const canSell = plan.sells.length > 0;

  if (canCommit || canSell) {
    return (
      <Frame earned={earned}>
        <View style={styles.row}>
          {canCommit ? (
            <Button
              label={`Add ${plan.commits.length} to sets`}
              gems={plan.commitGems}
              onPress={() => setAsking('commit')}
              tone={gold}
              ink="#17130A"
              grow
              disabled={locked}
              a11y={`Add ${plan.commits.length} cards to sets for ${plan.commitGems} gems`}
            />
          ) : null}
          {canSell ? (
            <Button
              label={canCommit ? `Sell ${plan.sells.length}` : `Sell ${plan.sells.length} spares`}
              gems={plan.sellGems}
              onPress={() => setAsking('sell')}
              tone={c.backgroundElement}
              ink={c.text}
              /* The gem is gold on every surface it can be — see `gemInk`. */
              gemInk={gold}
              border={c.border}
              grow={!canCommit}
              disabled={locked}
              a11y={`Sell ${plan.sells.length} spare cards for ${plan.sellGems} gems`}
            />
          ) : null}
        </View>
        {/* The one line that stops "Sell 4" reading as "sell the pack". */}
        {canCommit && canSell ? (
          <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
            Selling leaves out every card a set can still use.
          </Text>
        ) : null}
      </Frame>
    );
  }

  /* ---- nothing left to decide ----------------------------------------- */
  return (
    <Frame earned={earned}>
      <View style={styles.row}>
        <Button
          label="See in inventory"
          onPress={onInventory}
          tone={c.backgroundElement}
          ink={c.text}
        />
        <Button label="Open another" onPress={onAgain} tone={c.text} ink={c.background} grow />
      </View>
      {planning ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>Checking what your sets need…</Text>
      ) : null}
    </Frame>
  );
}

/**
 * The bar's shell: a hairline, the payout so far, and whatever the bar is
 * currently for.
 *
 * THE PAYOUT IS DRAWN ONLY ONCE THERE IS ONE. "+0 gems" on an untouched pack
 * reads as a reward that failed to arrive.
 */
function Frame({ earned, children }: { earned: number; children: React.ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  return (
    <View style={[styles.bar, { borderTopColor: c.border, backgroundColor: c.background }]}>
      {earned > 0 ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${earned} gems earned from this pack`}
          style={styles.earned}>
          <Gem size={11} color={gold} />
          <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{`+${earned}`}</Text>
          <Text style={[Type.fine, { color: c.textTertiary }]}>from this pack</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Button({
  label,
  gems,
  onPress,
  tone,
  ink,
  gemInk,
  border,
  grow,
  disabled,
  a11y,
}: {
  label: string;
  /** Printed to the right of the label, never inside it. See `PullDeck`. */
  gems?: number;
  onPress: () => void;
  tone: string;
  ink: string;
  /**
   * The gem's own colour, when it differs from the label's.
   *
   * A gem is gold everywhere else in this app, and on a neutral button it
   * should be here too. It cannot always be: printed ON gold it is a hole in
   * the button, and on the red sell confirm it is a colour clash rather than a
   * currency. So the default is the ink and the exception is named.
   */
  gemInk?: string;
  border?: string;
  grow?: boolean;
  disabled?: boolean;
  a11y?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? (gems === undefined ? label : `${label}, ${gems} gems`)}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        grow ? styles.grow : null,
        { backgroundColor: tone },
        border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: border } : null,
        pressed && styles.pressed,
        disabled && styles.dim,
      ]}>
      <Text numberOfLines={1} style={[Type.strong, styles.label, { color: ink }]}>
        {label}
      </Text>
      {gems === undefined ? null : (
        <>
          <Gem size={10} color={gemInk ?? ink} />
          <Text style={[Type.strong, NUMERIC, { color: ink }]}>{gems}</Text>
        </>
      )}
    </Pressable>
  );
}

/** "1 card" / "3 cards", so no sentence in here has to say "card(s)". */
function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
    /* ITS OWN TAIL, not the safe area's. The page adds the home indicator
       BELOW this bar, and on a browser that inset is zero — so without this the
       last line of the bar sat on the bottom edge of the window. */
    paddingBottom: Spacing.two + 2,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  /* The label shrinks; a gem figure beside it never does. */
  label: { flexShrink: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    minHeight: 48,
  },
  earned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  measure: { maxWidth: 560 },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
