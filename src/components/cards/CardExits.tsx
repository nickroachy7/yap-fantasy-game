/**
 * The two ways a card leaves your collection, offered together.
 *
 * SELL IT, OR PUT IT IN A SET. They are the same kind of decision — this copy
 * goes and you are paid for it — and the card profile used to split them: the
 * sale sat at the bottom of the Card tab under the start log, and the set was
 * not offered at all. On a card with fourteen starts that log is most of a
 * screen, so "what can I do with this" was below the fold on the one screen
 * that exists to answer it, and it got reported as the button not existing.
 *
 * NOTHING HERE IS IRREVERSIBLE. Every press hands a decision back to the caller
 * to put behind a `ConfirmDialog`; this component draws the offer and picks
 * which set the offer is about, and that is all. The distance that used to come
 * from having to scroll now comes from the dialog.
 *
 * IT DECIDES NOTHING ABOUT ELIGIBILITY EITHER. `sets` arrives from
 * `card_actions` with `canCommit` already resolved against the same rules
 * `commit_card_to_set` enforces, and the sets that CANNOT take the card arrive
 * with it — named, so the note under the row can say which of the two reasons
 * applies. Dropping them would leave "his slot is filled" indistinguishable
 * from "this card is in no set at all", and only one of those is worth a shrug.
 *
 * WHY IT IS A COMPONENT AND NOT JSX IN THE SCREEN: the card profile is behind a
 * sign-in, so this is the only way any of it can be put in front of a person
 * before it ships. The gallery mounts it directly. That is also why `picking`
 * is internal — a caller should not have to hold a piece of state to see the
 * thing work.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { commitBlockedBy, type CardActionSet } from './card-actions';
import { SetPickRow } from './SetPickRow';

export function CardExits({
  playerName,
  tier,
  sellValue,
  sets,
  burnsThisCopy,
  busy,
  onCommit,
  onSell,
}: {
  playerName: string;
  /** Only for the sell button's screen-reader label. */
  tier: string;
  sellValue: number;
  /** Every set this card belongs to, eligible or not. Straight from the server. */
  sets: CardActionSet[];
  /** False when an older, cheaper copy is the one that would burn. */
  burnsThisCopy: boolean;
  busy: boolean;
  onCommit: (set: CardActionSet) => void;
  onSell: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  /** Open only when there is a choice to make. See the note above. */
  const [picking, setPicking] = useState(false);

  const commitable = sets.filter((x) => x.canCommit);
  const blocked = sets.filter((x) => !x.canCommit);
  /* THREE REASONS NOW, NOT TWO. A weekly refuses a copy for being under its
     tier floor, which is neither "already in" nor "full", and the wording for
     all three lives in `commitBlockedBy` so this view cannot invent a fourth.
     See the note on `CardActionSet.minTier`. */
  const why = blocked.length > 0 ? commitBlockedBy(blocked[0], playerName) : null;
  const spare = !burnsThisCopy;

  return (
    <>
      <View style={styles.exits}>
        {commitable.length > 0 ? (
          <Pressable
            onPress={() => {
              // One set is not a choice, so it does not get a list. More than
              // one is, and the list is the only place the prices can differ
              // visibly — each set pays its own `commit_payout_pct`.
              if (commitable.length === 1) onCommit(commitable[0]);
              else setPicking((open) => !open);
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              commitable.length === 1
                ? `Add ${playerName} to ${commitable[0].name} for ${commitable[0].pays} gems`
                : `Choose one of ${commitable.length} sets to add ${playerName} to`
            }
            accessibilityState={{ disabled: busy, expanded: picking }}
            style={({ pressed }) => [
              styles.exit,
              { borderColor: gold, backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
              busy && styles.dim,
            ]}>
            <Text numberOfLines={1} style={[Type.strong, styles.label, { color: c.text }]}>
              {commitable.length === 1 ? 'ADD TO SET' : 'ADD TO A SET'}
            </Text>
            {commitable.length === 1 ? (
              <>
                <Gem color={gold} size={10} />
                <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                  {commitable[0].pays}
                </Text>
              </>
            ) : (
              /* A COUNT, WITHOUT THE GEM. These sets are priced separately, so
                 there is no single figure this button could print — and a bare
                 number beside a gem would read as gems. */
              <Text style={[Type.strong, NUMERIC, { color: c.textSecondary }]}>
                {commitable.length}
              </Text>
            )}
          </Pressable>
        ) : blocked.length > 0 ? (
          /**
           * THE SLOT STAYS, GREYED, WHEN NOTHING CAN GO IN IT.
           *
           * Dropping the button and printing a sentence instead was the first
           * version, and it read as the feature being missing rather than
           * unavailable: the pair of exits collapsed to one, so the card looked
           * like a card sets had never applied to. Worse for the common case
           * this exists for — a spare of a player you have ALREADY placed —
           * where the honest answer is not "you cannot" but "you already did".
           *
           * So the button holds its place and says which. It is a `Pressable`
           * rather than a `View` on purpose: `disabled` is what makes a screen
           * reader and the browser announce it as a control that is off, where
           * a styled View is just decoration that happens to look like one.
           */
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={why?.body}
            style={[
              styles.exit,
              styles.dim,
              { borderColor: c.border, backgroundColor: c.backgroundElement },
            ]}>
            <Text
              numberOfLines={1}
              style={[Type.strong, styles.label, { color: c.textSecondary }]}>
              {why?.label}
            </Text>
            {/* A tick in the positive tone, because a filled slot is something
                the player DID rather than a refusal. Nothing for the other two —
                neither of those is their doing. */}
            {why?.done ? (
              <Text style={[Type.strong, styles.tick, { color: c.positive }]}>✓</Text>
            ) : null}
          </Pressable>
        ) : null}

        <Pressable
          onPress={onSell}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Sell this ${tier} card for ${sellValue} gems`}
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.exit,
            { borderColor: c.border, backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
            busy && styles.dim,
          ]}>
          <Text numberOfLines={1} style={[Type.strong, styles.label, { color: c.textSecondary }]}>
            SELL THIS COPY
          </Text>
          <Gem color={gold} size={10} />
          <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{sellValue}</Text>
        </Pressable>
      </View>

      {picking ? (
        <View style={styles.picker}>
          {commitable.map((x) => (
            <SetPickRow
              key={x.code}
              set={x}
              busy={busy}
              spare={spare}
              onPress={() => onCommit(x)}
            />
          ))}
        </View>
      ) : null}

      {/* WHICH set, and what is still true of the card. The button above says
          the state in two words; this says which set it is about and — the part
          that stops the greyed button reading as "this card is finished" — that
          the copy is still yours to sell or to start. */}
      {commitable.length === 0 && blocked.length > 0 ? (
        <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>{why?.body}</Text>
      ) : null}

      {/* The spare-copy caveat, on the one path that never opens the picker the
          row version of it lives in. The dialog says it again on the way
          through; this is so it is knowable BEFORE the dialog. */}
      {commitable.length === 1 && spare ? (
        <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
          {`You hold a spare of ${playerName}. Adding him burns your least valuable copy, which is not this one.`}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  /* Equal weight, and they WRAP rather than shrink. Neither is the primary —
     putting a card into a set and selling it are the same size of decision.
     190 is the number that makes the wrap actually happen: at 150 the pair fit
     a 343pt sheet and squeezed instead, so a gold card's `SELL THIS COPY ◆ 150`
     came out `SELL THIS C… ◆ 150` — the label eaten because the price is the
     one thing that must not be. At 190 two of them do not fit a phone and both
     go full width, while the 688pt wide dialog still takes them side by side. */
  exits: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  exit: {
    flexGrow: 1,
    flexBasis: 190,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + 2,
  },
  /* Only the label gives way, so the price on the right can never be
     ellipsised out of the button. Same rule as the pack reveal's. */
  label: { flexShrink: 1, minWidth: 0 },
  /* Nudged to sit on the label's baseline rather than the box's centre. */
  tick: { lineHeight: 17 },
  picker: { gap: Spacing.two },
  measure: { maxWidth: 560 },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.65 },
});
