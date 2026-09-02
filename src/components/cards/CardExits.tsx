/**
 * The two ways a card leaves your collection, offered together — as the app's
 * glass bar.
 *
 * SELL IT, OR PUT IT IN A SET. They are the same kind of decision: this copy
 * goes and you are paid for it.
 *
 * WHERE THE BAR CAME FROM, AND WHY IT IS THIS BAR
 *
 * These two have now been in three places. At the bottom of the Card tab under
 * the start log they were reported as not existing: on a card with fourteen
 * starts that log is most of a screen, so "what can I do with this" was below
 * the fold on the one screen that exists to answer it. Moved to the TOP of the
 * tab they were found, at the cost of two stacked 56pt slabs above every number
 * on the page — the reading order inverted to fix a scrolling problem.
 *
 * A FLOATING BAR fixes the scrolling problem instead, and the app already has
 * one: `GlassBar` and `GlassPill`, the same material and the same geometry as
 * the tab bar and the contest sheet's entry bar. So this is not a third
 * treatment of a pinned action row, it is the app's one treatment used a third
 * time. `BarAction` moved into `GlassBar` for exactly that reason; if the bar
 * is ever retuned, all three follow without anybody remembering that they
 * should.
 *
 * The pills are UNTINTED, which is `BarAction`'s rule rather than a choice made
 * here: a saturated hue at any useful alpha fills a capsule this small instead
 * of rimming it, and then the glass stops being glass. `coin` and `sets` are
 * the same two marks the rest of the app uses for those two ideas, and the
 * prices are worded `Sell for 8` / `Add for 4` — the contest bar's `Enter for
 * 40` exactly, so three bars cannot state a price three ways.
 *
 * NOTHING HERE IS IRREVERSIBLE. Every press hands a decision back to the caller
 * to put behind a `ConfirmDialog`; this draws the offer and picks which set the
 * offer is about, and that is all. The distance that used to come from having
 * to scroll now comes from the dialog.
 *
 * IT DECIDES NOTHING ABOUT ELIGIBILITY EITHER. `sets` arrives from
 * `card_actions` with `canCommit` already resolved against the same rules
 * `commit_card_to_set` enforces, and the sets that CANNOT take the card arrive
 * with it — named, so `cardExitNote` can say which of the reasons applies.
 * Dropping them would leave "his slot is filled" indistinguishable from "this
 * card is in no set at all", and only one of those is worth a shrug.
 *
 * THE PROSE IS NOT IN THE BAR, AND IT IS NOT PROSE ANY MORE. A caveat set under
 * a floating capsule is a sentence hanging in mid-air over the content it is
 * covering, so `cardExitNote` hands it to the page instead — as a few words for
 * a `Row`, not the paragraph `commitBlockedBy` writes for the dialog.
 *
 * WHY IT IS A COMPONENT AND NOT JSX IN THE SCREEN: the card profile is behind a
 * sign-in, so this is the only way any of it can be put in front of a person
 * before it ships. The gallery mounts it directly. That is also why `picking`
 * is internal — a caller should not have to hold a piece of state to see the
 * thing work.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { sets as setsGlyph } from '@/components/icons/glyphs';
import { Coin } from '@/components/shell/AppHeader';
import { BarAction, GlassBar, GlassPill } from '@/components/ui/GlassBar';
import { Colors, Radius, Spacing, TierColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { commitBlockedBy, type CardActionSet } from './card-actions';
import { SetPickRow } from './SetPickRow';

/**
 * The sentence that goes with the bar, for the page to print in a section.
 *
 * Returns null when there is nothing to say, which is the common case: a card
 * with one open set and no spare needs no explaining. The two cases that do are
 * the ones a reader would otherwise have to infer from a disabled pill, or find
 * out only once the dialog is already open.
 */
export function cardExitNote(
  sets: CardActionSet[],
  playerName: string,
  burnsThisCopy: boolean,
): string | null {
  const commitable = sets.filter((x) => x.canCommit);
  const blocked = sets.filter((x) => !x.canCommit);

  /* WHICH set, and in how few words. `commitBlockedBy` writes a full sentence
     for the confirm dialog — "Proven three only takes silver copies or better,
     and yours is not there yet. Start Cam Ward in your lineup and this copy
     will climb." — and that is right where a reader has asked for it and wrong
     in a row, where it wrapped to two lines and then ellipsised the half that
     said what to do. The set's name plus its label is the whole fact: `Proven
     Three · needs silver`. The sentence still exists, in the dialog. */
  if (commitable.length === 0 && blocked.length > 0) {
    const why = commitBlockedBy(blocked[0], playerName);
    return `${blocked[0].name} · ${why.label.toLowerCase()}`;
  }

  /* The spare-copy caveat, on the one path that never opens the picker the row
     version of it lives in. The dialog says it again on the way through; this
     is so it is knowable BEFORE the dialog. */
  if (commitable.length === 1 && !burnsThisCopy) {
    return 'Adding him burns your cheapest copy, not this one';
  }

  return null;
}

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
  /** Only for the sell action's screen-reader label. */
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

  /** Open only when there is a choice to make. */
  const [picking, setPicking] = useState(false);

  const commitable = sets.filter((x) => x.canCommit);
  const blocked = sets.filter((x) => !x.canCommit);
  /* THREE REASONS, NOT TWO. A weekly refuses a copy for being under its tier
     floor, which is neither "already in" nor "full", and the wording for all
     three lives in `commitBlockedBy` so this view cannot invent a fourth. */
  const why = blocked.length > 0 ? commitBlockedBy(blocked[0], playerName) : null;
  const spare = !burnsThisCopy;

  return (
    <>
      {/**
        * THE PICKER SITS ABOVE THE BAR, ON A SOLID SURFACE.
        *
        * It is a list of rows with prices in it, which is content, and content
        * on glass is unreadable the moment something busy scrolls under it. So
        * the capsules float and the list does not: it takes a panel, above the
        * row, inside the same footer — which also means the frame measures the
        * two together and the scroll ends clear of both.
        */}
      {picking && commitable.length > 1 ? (
        <View style={[styles.picker, { backgroundColor: c.surfaceSheet, borderColor: c.border }]}>
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

      <GlassBar>
        {/* SELL FIRST, reading from the lesser act to the greater: a sale pays
            the sell value and ends there, where a commit pays less and puts the
            card into something that is going somewhere. It is also the one of
            the two that is always available, so the near pill never changes
            shape under the thumb. */}
        <GlassPill>
          <BarAction
            /* The masthead's coin, in the masthead's gold — what a sale pays
               is the same currency the balance at the top of the screen counts,
               and it was drawn as the old gem. */
            mark={<Coin size={15} color={busy ? c.textTertiary : TierColors[scheme].gold.accent} />}
            label={`Sell for ${sellValue}`}
            hint={`Sell this ${tier} card for ${sellValue} coins`}
            enabled={!busy}
            onPress={onSell}
          />
        </GlassPill>

        {commitable.length > 0 ? (
          <GlassPill grow>
            <BarAction
              glyph={setsGlyph}
              /* ONE LABEL, WHATEVER THE CARD CAN JOIN. It priced itself —
                 `Add for 4` — which only ever worked for a card with exactly
                 one open set, and a card belongs to as many as the set list
                 grows to. Two labels for one action is also two things for a
                 reader to learn about a button that does the same thing either
                 way. The price is stated where it is actually decided: in the
                 picker when there is a choice, and in the confirm dialog on
                 both paths. */
              label="Add to set"
              hint={
                commitable.length === 1
                  ? `Add ${playerName} to ${commitable[0].name} for ${commitable[0].pays} coins`
                  : `Choose one of ${commitable.length} sets to add ${playerName} to`
              }
              primary
              enabled={!busy}
              onPress={() => {
                // One set is not a choice, so it does not get a list. More than
                // one is, and the list is the only place the prices can differ
                // visibly — each set pays its own `commit_payout_pct`.
                if (commitable.length === 1) onCommit(commitable[0]);
                else setPicking((open) => !open);
              }}
            />
          </GlassPill>
        ) : blocked.length > 0 ? (
          /**
           * THE PILL STAYS, DISABLED, WHEN NOTHING CAN GO IN IT.
           *
           * Dropping it and printing a sentence instead was the first version,
           * and it read as the feature being missing rather than unavailable:
           * the pair of exits collapsed to one, so the card looked like a card
           * sets had never applied to. Worse for the common case this exists
           * for — a spare of a player you have ALREADY placed — where the
           * honest answer is not "you cannot" but "you already did".
           *
           * `BarAction` carries the state properly: `textTertiary` and a real
           * `disabled`, so a screen reader announces a control that is off
           * rather than a decoration that looks like one.
           */
          <GlassPill grow>
            <BarAction
              glyph={setsGlyph}
              label={why?.label}
              hint={why?.body}
              enabled={false}
              onPress={() => {}}
            />
          </GlassPill>
        ) : null}
      </GlassBar>
    </>
  );
}

const styles = StyleSheet.create({
  /* The content's gutter, so the panel lines up with the sections it covers
     rather than with the capsules above it — those are inset further by the
     bar's own row padding, and matching them would put the list out of true
     with the page. */
  picker: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
  },
});
