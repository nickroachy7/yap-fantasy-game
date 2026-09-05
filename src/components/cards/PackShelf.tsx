/**
 * The pack shelf — the first half of `/packs`, and the only half still here.
 *
 * WHAT THE PULL BECAME. `PullResult` used to live below, drawing every pulled
 * card in one wrapping grid. It is `PackReveal` now, in its own file, because
 * it stopped being a way of DISPLAYING a result and became a thing you move
 * through and act on: cards face down in a deck, turned over one at a time, each
 * with the two exits — sell it, or put it in a set — on the card itself. The
 * shelf and the reveal share nothing but the `Pulled` row type, which stays
 * here beside the RPC's other shapes.
 *
 * WHAT THIS USED TO BE. `ShopPanel`, a `ScrollView` filling
 * `collection/shop` — a whole sub-page, one third of the Collection strip, for
 * a shelf that holds two rows and, once the free Starter Pack is claimed, one.
 * Packs are now a sheet presented over the app (see `app/(app)/packs.tsx`), so
 * everything here is presentational: the frame owns the scrolling, the gutter
 * and the gaps between blocks, and a second `ScrollView` inside it would break
 * both.
 *
 * ---------------------------------------------------------------------------
 * A PACK IS DRAWN AS A CONTEST CARD IS DRAWN, AND THAT IS THE 2026-09-03 PASS
 * ---------------------------------------------------------------------------
 *
 * It was a 230pt panel: a two-line head, a hairline, a three-row spec sheet
 * with a 76pt label gutter, another hairline, a quantity row and an action row
 * whose money line ran to two lines beside the button. Three of those on one
 * sheet is 700pt of shelf, and the second pack was below the fold on a phone.
 *
 * The lobby had the same problem two months earlier and solved it: a contest is
 * a bordered, clipped card divided into ZONES of fixed height, each painting its
 * own fill, separated by hairlines — a head that names the thing and prices it,
 * and a foot that states the trade in token rows. See `ContestCard`, which owns
 * that anatomy and the reasoning behind every measurement in it. This file now
 * borrows the anatomy rather than inventing a second one, so a reader who has
 * learned to scan a contest card can scan a pack without relearning anything:
 *
 *     HEAD    34   glyph · name │ what is in it            price
 *     FOOT    29   GUARANTEED tokens          │  1,900 → 1,800
 *     ACTION  52   ×1 ×5 ×10                        [ Open ]
 *
 * IT IS 115pt AND NOT 63pt, WHICH IS WHAT A COLLAPSED CONTEST CARD COSTS. The
 * difference is the action zone, and it is not padding: a contest card IS the
 * button — the whole card opens a page — while a pack card has to carry the
 * control that SPENDS COINS, and that control cannot be a 29pt strip inside a
 * foot. It gets a zone with a 40pt button in it, which is the smallest honest
 * answer. Everything above the action row is the contest card's geometry to the
 * point.
 *
 * EVERY ZONE IS A FIXED HEIGHT AND NOTHING IN THE CARD WRAPS, which is a bug
 * fix rather than a preference. The first cut gave the foot two `flex: 1` halves
 * holding wrapping token rows; on device the cost half inherited a zero flex
 * basis, rendered zero wide with its coin outside the card's clip, and its
 * tokens — having no width to sit in — wrapped one per line and took a 29pt zone
 * out to ninety. `Guaranteed` has the full account. The rule that came out of it:
 * one field gives and truncates, one field never gives, every flex factor is
 * named rather than inherited from a shorthand, and the zone's height is a
 * number.
 *
 * THE FOOT'S RIGHT FIELD IS ABSENT ON A FREE PACK rather than reading `Free`,
 * which the head says two inches away in green. What the row spends that space
 * on is the starter pack's five position tokens — the only real guarantee in the
 * table today, and otherwise the first thing to get clipped.
 *
 * Behaviour carried across verbatim where it was already right: a daily that
 * has been used up must read as coming back rather than as spent, and a zero
 * coin cost reads as "Free".
 *
 * BUYING SEVERAL AT ONCE is the card's one control beyond the button. See
 * `BULK_COUNTS` and the note on the action zone for which packs get it and why
 * the free ones do not.
 *
 * ---------------------------------------------------------------------------
 * THE PULL RATES ARE ON THE CARD NOW, WHICH IS THE 2026-09-05 PASS
 * ---------------------------------------------------------------------------
 *
 * This file said, at length, that rates were NOT shown: `packs.odds` weighted
 * rarity bands that were still being tuned, and printing them would have been a
 * promise the game did not keep. That was correct and it is no longer true.
 * Rarity is gone as a pull axis; packs roll over four tiers cut from the value
 * model, and `pack_odds()` computes the published rate from the same columns
 * `open_pack` deals from.
 *
 * SO THE MIDDLE BAND IS THE ODDS. It held `GUARANTEED · Any position` on every
 * row of the shelf — the most valuable strip on the sheet, on all four packs at
 * once, spending itself to say we promise you nothing. See `Odds` for why the
 * rates are four numbers rather than a bar, and `Promised` for what took over
 * the guarantee's job now that exactly one pack has one.
 *
 * WHAT A PACK CONTAINS IS STILL STATED FROM DATA OR NOT AT ALL, which is the
 * rule that survived all of it. `guaranteed_positions` is printed position by
 * position — the old copy said the starter pack "guarantees one card at every
 * lineup position" when the row actually deals RB×2 and WR×3 — and a tier
 * guarantee is printed as the tier and the count the row actually holds.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { Coin } from '@/components/shell/AppHeader';
import { packDaily, packPro, packStandard, packStarter } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Json } from '@/lib/database.types';

export type Pack = {
  id: string;
  code: string;
  name: string;
  coin_cost: number;
  card_count: number;
  once_per_user: boolean;
  /** Opens allowed per day, or null for a pack with no daily limit. */
  daily_limit: number | null;
  guaranteed_positions: Json;
  /** `{min_tier, count}`, or an empty object for a pack that promises nothing. */
  guarantee?: Json;
  /** Per tier, from `pack_shelf`. Optional so a fixture need not carry one. */
  odds?: PackOdds | null;
};

/**
 * WHAT A PACK ACTUALLY DEALS, AND WHY THIS FILE DOES NOT WORK IT OUT.
 *
 * These numbers arrive from `pack_shelf`, which folds in `pack_odds()`, which
 * reads exactly the columns `open_pack` rolls over. The shape is deliberate:
 * `tier_odds` is also on the row and this component never touches it, because a
 * published rate the CLIENT derives is a rate that goes wrong the first time
 * either side is touched — and it goes wrong silently, since the number still
 * renders. If these are absent the row draws em-dashes rather than a guess.
 *
 * `per_card` is what one card is likely to be. `at_least_one` is the chance the
 * pack contains one, which is the question a purchase actually asks — a 1.3%
 * elite rate over six cards is a 7.5% pack — and it is carried here unused, for
 * the follow-up that finds it room.
 */
export type PackOdds = Partial<
  Record<'depth' | 'bench' | 'starter' | 'elite', { per_card: number; at_least_one: number }>
>;

export type Pulled = {
  card_instance_id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  rarity: string | null;
};

/**
 * How many of one pack you may buy in a press.
 *
 * THREE, NOT A STEPPER. A stepper is the general answer and it is the wrong one
 * here: it is two controls (a minus and a plus) plus a readout to fit into a
 * card that is 240pt wide at its narrowest, and it invites a player to dial in
 * seven when nothing about the economy rewards seven over five. Three fixed
 * jumps are one tap each, and the jumps are the ones the rest of the game is
 * priced in — a single, a handful, a bulk buy.
 *
 * IT STARTS AT ONE, ALWAYS. A card that remembered ten from the last visit is a
 * card that spends ten times what the player expected on a press they have made
 * before.
 *
 * WHY 1/5/10 AND NOT 1/3/5. A standard pack against a season's income means a
 * bulk buy has to be worth leaving the sheet for; ten is roughly the point at
 * which a paid pack is a session rather than an errand. It is also the largest
 * count that keeps the reveal usable — see `PackReveal`, whose deck is one card
 * at a time, so ten five-card packs is already fifty swipes.
 */
const BULK_COUNTS = [1, 5, 10] as const;

/**
 * THE ZONES, AND THEY ARE `ContestCard`'s OWN NUMBERS.
 *
 * 34 of head and 29 of foot are that card's `HEAD_H` and `FOOT_H` verbatim, for
 * that card's reasons: the head is sized by the 20pt line box a `Type.section`
 * name sits in plus the zone's air, and the foot by a 15pt token row plus the
 * same. Copying the constants rather than importing them is deliberate — a
 * contest card and a pack card are two objects that agree, not one object in two
 * files, and an import would make a change to the lobby's geometry silently
 * resize the shop.
 *
 * `ACTION_H` is the one measurement this card owns, and it is derived rather
 * than chosen: `BUTTON_H` plus `ZONE_PAD` top and bottom.
 *
 * BUTTON_H WAS 40 AND IS 30, and the argument it replaces was "the floor for
 * something a thumb has to hit on the first try". That was never the real
 * floor: 40 is already under the platform's 44, so the button was relying on
 * being 195pt WIDE to be hittable, not on being tall. Six points of height
 * bought nothing a wide target did not already have.
 *
 * What replaces it is the trick the rest of this app uses for exactly this —
 * `Pip` and `DoorChip` both draw small and reach out. The button and the count
 * chips carry vertical `hitSlop`, so the drawn height came down and the touch
 * target went UP, past 44 for the first time.
 */
const HEAD_H = 34;
/**
 * THE ODDS ROW, and it is a zone rather than a line in the foot.
 *
 * 42, AND IT WAS 29 FOR ONE BUILD. At 29 the label and the figure sat side by
 * side, and four equal columns on a 402pt phone give each about 84pt — enough
 * for `STARTER` and `1.4%` to fit and not enough for them to clear the next
 * column, so the row rendered as `STARTER 1.4%ELITE 0.1%`. Stacked, each cell
 * needs only its widest single item and the collision cannot come back at any
 * width.
 *
 * It earns its own band rather than sharing the foot's because the foot's two
 * halves already fight for width — see `Promised` on what happened the last
 * time a field in there was asked to hold four things.
 *
 * THIS IS THE PRODUCT NOW. Every paid pack deals six cards, so the count is no
 * longer what separates a 160-coin pack from a 1,400-coin one; the odds are the
 * only difference and they belong on the face of the card, not behind a tap.
 */
const ODDS_H = 42;
const FOOT_H = 29;
const COUNT_CHIP_H = 22;
/**
 * The button and the count tray are ONE height, and it is derived from the
 * chip rather than chosen for the button.
 *
 * They were 34 and 30, which is close enough that the row read as a mistake
 * rather than as a hierarchy — two controls side by side, four points apart,
 * with no reason for either number. The tray is the object with a real
 * constraint in it (a chip has to hold `×10`), so it sets the height and the
 * button matches: `height` on both, and RN's box model counts the tray's
 * hairline inside it, so the two agree exactly rather than to within a border.
 */
const BUTTON_H = COUNT_CHIP_H + 8;
/**
 * The ink on the gold button.
 *
 * `TierColors.dark.gold.onAccent`, written out because the button's fill is the
 * app's gold on BOTH schemes — it is a call to action, not a surface that
 * follows the page — so the text on it cannot be `Colors[scheme].background`
 * the way it was for one build. On light that resolved to near-white, on gold.
 */
const BUTTON_INK = '#17130A';
/** The air inside every zone, top and bottom. One constant, one decision. */
const ZONE_PAD = Spacing.one + 3;
const ACTION_H = BUTTON_H + ZONE_PAD * 2;

/**
 * Lineup order, so coverage reads QB → PK. It cannot come off the jsonb: it
 * sorts keys by length then bytes, so the row comes back PK, QB, RB, TE, WR.
 */
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'PK'];

export type Coverage = { position: string; count: number };

/** `guaranteed_positions` is jsonb, so it is `unknown` until proven otherwise. */
export function coverageOf(raw: Json): Coverage[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  return Object.entries(raw)
    .map(([position, value]) => ({ position: position.toUpperCase(), count: Number(value) }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > 0)
    .sort((a, b) => {
      const ai = POSITION_ORDER.indexOf(a.position);
      const bi = POSITION_ORDER.indexOf(b.position);
      // A position we do not know about sorts last rather than first, which is
      // where indexOf's -1 would otherwise put it.
      return (
        (ai === -1 ? POSITION_ORDER.length : ai) - (bi === -1 ? POSITION_ORDER.length : bi) ||
        a.position.localeCompare(b.position)
      );
    });
}

export function countPositions(cards: Pulled[]): Coverage[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const position = card.position_abbreviation?.toUpperCase() ?? '—';
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  return coverageOf(Object.fromEntries(counts) as Json);
}

/* ---- the shelf --------------------------------------------------------- */

export function PackShelf({
  packs,
  dailyAvailable,
  coins,
  openings,
  openingCode,
  progress,
  onOpen,
}: {
  /** null while the first read is in flight. */
  packs: Pack[] | null;
  /**
   * Whether today's free pack is still available, straight from
   * `daily_pack_status()`. NOT derived from `openings`, which counts every open
   * ever and cannot say what "today" is — the day boundary is the server's, and
   * a client that guessed it would draw a live button that always errors, or a
   * dead one that should work.
   */
  dailyAvailable: boolean | null;
  coins: number;
  /** pack_id -> how many times this player has opened it. */
  openings: Map<string, number>;
  /** The pack currently being opened, if any. */
  openingCode: string | null;
  /**
   * How far through a bulk buy the pack in flight is — `{done, total}` — or
   * null for a single open.
   *
   * IT EXISTS BECAUSE TEN PACKS IS TEN ROUND TRIPS. `open_pack` takes one code
   * and mints one pack, so a bulk buy is a loop (see `packs.tsx`), and a
   * spinner that sat there for ten sequential calls is indistinguishable from a
   * sheet that has hung. A count that moves is the cheapest possible proof that
   * it has not.
   */
  progress: { done: number; total: number } | null;
  onOpen: (code: string, count: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (packs === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }

  /**
   * A SPENT ONCE-PER-PLAYER PACK LEAVES THE SHELF ENTIRELY.
   *
   * It used to stay, drawn in full with a dead "Claimed" button under it — a
   * whole card, permanently, for the one pack in the table that can never be
   * opened again. That is a third of this sheet spent saying no, and it said it
   * on every visit for the rest of the account's life. It is not history worth
   * keeping either: what the starter pack dealt is in the collection, which is
   * the screen this sheet opens over.
   *
   * IT IS KEYED ON `once_per_user`, NOT ON THE CODE. Any pack the table marks
   * as one-per-player is spent the moment it has been opened, so a second one
   * added later disappears on the same rule rather than needing this list
   * amending.
   *
   * A DAILY IS NOT FILTERED, and the distinction is the whole reason this is a
   * filter and not a `claimed` flag. A daily is used up for TODAY and comes back
   * in a few hours; removing it would make a recurring reward look like a
   * feature that had been taken away. It stays, with the button reading "Back
   * tomorrow" — see `claimedToday`.
   */
  const shelf = packs.filter((p) => !(p.once_per_user && (openings.get(p.id) ?? 0) > 0));

  return (
    <>
      {/* A COLUMN, WHICH IS THE LOBBY'S `stack`. The cards were a wrapping row
          at a 300pt flex basis, which is the right layout for tall panels and
          the wrong one for these: at 115pt they are lobby cards, and the lobby
          draws its cards full width one under the other separated by space
          rather than by rules. On the wide-web dialog a full-width card is what
          a contest gets there too. */}
      <View style={styles.shelf}>
        {shelf.map((p) => (
          <PackCard
            key={p.id}
            pack={p}
            coins={coins}
            opened={openings.get(p.id) ?? 0}
            dailyAvailable={dailyAvailable}
            busy={openingCode === p.code}
            progress={openingCode === p.code ? progress : null}
            // Any open in flight blocks every pack: the balance is about to
            // change, so a second purchase would be decided against a stale one.
            locked={openingCode !== null}
            onOpen={(count) => onOpen(p.code, count)}
          />
        ))}
      </View>

      {/* THE APOLOGY IS GONE. This read "Pull rates are not published yet" for
          as long as there were no rates worth printing, and it was the honest
          thing to say while `packs.odds` weighted rarity bands nobody could
          defend. Every card now carries its four rates, so the footnote's job
          changed from admitting an absence to explaining a word. */}
      <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
        A card&apos;s tier is its player&apos;s rank at his own position, scaled to how many of that
        position a lineup starts: elite is the top 2, starter the top 8, bench the top 24. Rates are
        per card and come from the same table the pack is dealt from.
      </Text>
    </>
  );
}

/* ---- parts ------------------------------------------------------------- */

/** Two things side by side, at the width `ContestCard`'s head divider uses. */
function Rule({ tall = false }: { tall?: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.rule, tall && styles.ruleTall, { backgroundColor: c.borderStrong }]} />
  );
}

/**
 * One position the pack promises, as a token rather than as a chip.
 *
 * IT WAS A BORDERED CHIP and the border is what had to go. Five outlined boxes
 * inside a card that is itself an outlined box is three levels of edge in one
 * row, and the contest foot — which states the whole trade in `♥ 1` and `◆ 40`
 * — proved a token needs no container to read as one unit. What separates them
 * is space: the gap between two tokens is four times the gap inside one, which
 * is `ContestCard`'s own ratio and the point below which the eye stops seeing
 * pairs.
 */
export function CoverageToken({ entry }: { entry: Coverage }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${entry.count} ${entry.position}`}
      style={styles.token}>
      <Text style={[Type.fine, { color: c.text }]}>{entry.position}</Text>
      <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>{`×${entry.count}`}</Text>
    </View>
  );
}

/**
 * What the pack promises, as the foot's left field.
 *
 * IT IS THE ONE FIELD THAT GIVES, and it is `flexShrink` on a NOWRAP row rather
 * than a wrapping box. The first cut of this foot was two `flex: 1` halves with
 * wrapping token rows, and it failed on device in the one way a flex bug always
 * fails: `flex: 1` expands to a basis of 0%, a `flex: 0` layered on top of it
 * changes only the grow and shrink factors, so the cost field kept the zero
 * basis, rendered zero wide, spilled its coin outside the card's clip — and its
 * tokens, having no width to sit in, wrapped one per line and pushed a 29pt zone
 * out to ninety. Web tolerated it (`flexBasis: 'auto'` is honoured there); Yoga
 * did not.
 *
 * So nothing here uses the `flex` shorthand and nothing wraps. Every factor is
 * named on its own, the zone takes a fixed height, and the worst a bad
 * measurement can now do is truncate a string.
 */
/**
 * A tier guarantee as a phrase, or null when the pack makes no promise.
 *
 * Built here rather than in SQL — `pack_shelf` passes `{min_tier, count}`
 * through untouched — because a sentence assembled in a view is a sentence
 * nobody can find when the copy needs changing.
 */
function guaranteeOf(raw: Json | undefined): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const tier = (raw as Record<string, unknown>).min_tier;
  const count = Number((raw as Record<string, unknown>).count ?? 0);
  if (typeof tier !== 'string' || !Number.isFinite(count) || count < 1) return null;
  return `${count} ${tier}`;
}

/**
 * WHAT THE PACK PROMISES — and it used to read `GUARANTEED · Any position` on
 * every row of the shelf, which is the whole reason this card was rebuilt.
 *
 * That was the middle band of the most valuable object on the sheet, on all
 * four packs at once, spending itself to say WE PROMISE YOU NOTHING. It was
 * also true: no pack had a guarantee then, and `guaranteed_positions` is empty
 * on everything but the starter pack.
 *
 * Now exactly one pack promises something — the Elite Pack's certain elite,
 * which is the entire reason it costs what it does — and the starter pack still
 * covers positions. So this draws for those two and DRAWS NOTHING FOR THE REST,
 * which is what an empty promise should always have looked like. The zone still
 * holds its shape: `give` stays in the tree as the spacer that keeps the money
 * pinned right.
 */
function Promised({ coverage, guarantee }: { coverage: Coverage[]; guarantee?: Json }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const phrase = guaranteeOf(guarantee);

  if (coverage.length === 0 && !phrase) return <View style={styles.give} />;

  return (
    <View style={styles.give}>
      <Text numberOfLines={1} style={[Type.micro, styles.fieldLabel, { color: c.textTertiary }]}>
        GUARANTEED
      </Text>
      <View style={styles.tokens}>
        {coverage.length > 0 ? (
          coverage.map((entry) => <CoverageToken key={entry.position} entry={entry} />)
        ) : (
          <Text numberOfLines={1} style={[Type.fine, { color: c.text }]}>
            {phrase}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * THE FOUR TIERS, IN ORDER, WITH WHAT SHARE OF A CARD EACH IS.
 *
 * ---------------------------------------------------------------------------
 * IT IS NOT A BAR, AND THAT WAS TESTED RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------
 *
 * A stacked proportion bar is the obvious drawing for four shares that sum to a
 * hundred, and it cannot represent this data. The Base Pack is 93.3 / 6.2 / 0.4
 * / 0.1: across a 340pt card the elite segment is a third of a pixel and the
 * starter segment is one and a half. The pack the shelf sells most would render
 * as one flat block — the exact three tiers a buyer is looking for, invisible.
 *
 * A palette was drawn for it and checked before that was noticed, which is the
 * other half of the answer: a four-step ramp dark enough to be ordered puts its
 * first step at 1.75:1 against this surface. Depth is 93% of the bar and 93% of
 * the bar would have been unreadable.
 *
 * So it is four numbers, in fixed ascending order, in the app's own ink. The
 * order carries the ranking that a colour ramp was there to carry, and the
 * numbers carry what a bar cannot: three orders of magnitude.
 *
 * EQUAL COLUMNS, NOT HUGGING ONES. `flexBasis: 0` with an equal grow puts DEPTH
 * at the same x on every card in the shelf, so reading down the column is
 * reading the ladder — 93.3, 78.9, 31.6, nothing. Hugging cells would stagger
 * the four cards and throw that away for a few points of width.
 *
 * ONE DECIMAL UNDER TEN, NONE AT OR ABOVE IT. `93%` and `0.4%` are both the
 * honest precision at their own size: a decimal on 93.3 is noise, and rounding
 * 0.4 to `0%` would print a promise the pack does not keep.
 */
const ODDS_TIERS = [
  { key: 'depth', label: 'DEPTH' },
  { key: 'bench', label: 'BENCH' },
  { key: 'starter', label: 'STARTER' },
  { key: 'elite', label: 'ELITE' },
] as const;

function pct(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n === 0) return '—';
  return n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
}

function Odds({ odds }: { odds: PackOdds | null | undefined }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  return (
    <View
      style={[styles.zone, styles.odds, { borderTopColor: c.borderStrong }]}
      accessibilityRole="summary"
      accessibilityLabel={ODDS_TIERS.map(
        (t) => `${t.label.toLowerCase()} ${pct(odds?.[t.key]?.per_card)}`,
      ).join(', ')}>
      {ODDS_TIERS.map((t) => {
        const value = odds?.[t.key]?.per_card;
        /* GOLD ON THE TOP TIER'S LABEL ONLY, which is the app's rule for the
           one mark on a row that says an act is worth something — and the only
           colour on this band, so it cannot read as a second axis. Every figure
           stays in text ink: a number wearing a series colour is the thing that
           makes a reader hunt for a legend that is not there. */
        const top = t.key === 'elite';
        return (
          <View key={t.key} style={styles.oddsCell}>
            <Text
              numberOfLines={1}
              style={[Type.micro, { color: top ? gold : c.textTertiary }]}>
              {t.label}
            </Text>
            <Text
              numberOfLines={1}
              style={[Type.strong, NUMERIC, { color: value ? c.text : c.textTertiary }]}>
              {pct(value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Pack code to glyph. Keyed by `packs.code` — the same four values the table
 * holds — so this cannot drift into a parallel list of what packs exist.
 */
const PACK_GLYPHS: Record<string, Glyph | undefined> = {
  starter: packStarter,
  standard: packStandard,
  daily: packDaily,
  pro: packPro,
};

function PackCard({
  pack,
  coins,
  opened,
  dailyAvailable,
  busy,
  progress,
  locked,
  onOpen,
}: {
  pack: Pack;
  coins: number;
  opened: number;
  dailyAvailable: boolean | null;
  busy: boolean;
  /** Where a bulk buy on THIS pack has got to, or null. See `PackShelf`. */
  progress: { done: number; total: number } | null;
  locked: boolean;
  onOpen: (count: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const isDaily = pack.daily_limit !== null;
  /**
   * A daily is merely used up FOR NOW, and telling somebody "already claimed"
   * for something that returns in a few hours is how a reward turns into a dead
   * end. The other kind of claimed — a spent once-per-player pack — is not a
   * state this card can be in any more: the shelf drops those rows before they
   * reach here (see `PackShelf`).
   *
   * Null while the status is still loading: treated as claimed, because a
   * button that works is the safer thing to arrive at late.
   */
  const claimedToday = isDaily && dailyAvailable !== true;
  const free = pack.coin_cost === 0;

  /**
   * WHICH PACKS MAY BE BOUGHT IN BULK: the ones you could buy twice anyway.
   *
   * A once-per-player pack has exactly one open in it, and a daily has one
   * TODAY — offering ×5 on either would be a control whose every option but the
   * first is a guaranteed server refusal. A free pack is both of those in
   * practice (the two free rows are the starter and the daily), and a "×10" on
   * something that costs nothing is a quantity picker for a thing there is no
   * decision to make about.
   *
   * So the row appears on a repeatable pack you spend coins on, which today is
   * the standard pack and whatever is priced beside it later.
   */
  const bulkable = !pack.once_per_user && !isDaily && pack.coin_cost > 0;
  const [count, setCount] = useState(1);
  /* Never trust the state over the pack: a row that stops being repeatable
     between renders must not keep a 10 the button would then fire. */
  const buying = bulkable ? count : 1;
  const total = pack.coin_cost * buying;

  const affordable = coins >= total;
  /* WHAT THE PRESS IS SHORT BY, as a number rather than a condition — the
     lobby's rule for a contest you cannot afford. It falls back to the total
     when the arithmetic does not come out positive, so a balance that has moved
     under a cached row cannot produce `0 coins short`.

     THE BALANCE LINE THIS USED TO SHARE A BLOCK WITH IS GONE. `318 → 68` was a
     subtraction the reader could do themselves, next to a price that was only
     ever right at ×1. See the note on `label`. */
  const shortfall = total - coins;
  const blocked = locked || claimedToday || !affordable;
  const coverage = coverageOf(pack.guaranteed_positions);

  /**
   * THE BUTTON SAYS WHAT IT COSTS, and that is where the price now lives.
   *
   * It was a figure in the head and a `318 → 68` in the foot: three places to
   * look for one fact, one of them arithmetic the reader had to do themselves.
   * The head's figure was also the price of ONE, so it went quietly wrong the
   * moment ×5 was tapped — the total was only ever recoverable by subtracting
   * one end of the balance line from the other.
   *
   * The button is the one thing on this card that knows `buying`, so it is the
   * only honest place for a total. `Purchase for 1,250 coins` at ×5 states the
   * whole transaction in the control that performs it.
   *
   * THE SHORTFALL TOOK THE SAME SEAT for the same reason: `282 coins short` is
   * the lobby's rule — say what the trip to the shop is for, where "Not enough
   * coins" tells you to go and count.
   */
  const label = claimedToday
    ? 'Back tomorrow'
    : free
      ? 'Claim free pack'
      : !affordable
        ? `${(shortfall > 0 ? shortfall : total).toLocaleString()} coins short`
        : /* Unused when affordable — the button composes that state from parts
             so the coin glyph can sit between the verb and the figure. Kept as
             the one string the screen reader announces. */
          `Purchase for ${total.toLocaleString()} coins`;

  const packGlyph = PACK_GLYPHS[pack.code];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
      {/* HEAD — the pack, named and priced. `ContestCard`'s head to the point:
          a mark, the name, a divider, one line on what the thing is, and the
          state at the right end. What a contest puts in that corner is a
          countdown or an outcome; what a pack puts there is what it costs,
          which is the same kind of fact — the one thing about this row that
          decides whether you act on it. */}
      <View style={[styles.zone, styles.head]}>
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            {/* The mark is keyed off `packs.code`, so a pack added to the table
                without a glyph here simply renders without one rather than
                crashing or falling back to the wrong picture. */}
            {packGlyph ? (
              <Icon
                glyph={packGlyph}
                color={free ? c.positive : c.textSecondary}
                size={16}
                focused
              />
            ) : null}
            <Text numberOfLines={1} style={[Type.section, styles.headName, { color: c.text }]}>
              {pack.name}
            </Text>
            <Rule />
            <Text
              numberOfLines={1}
              style={[Type.fine, NUMERIC, styles.headGive, { color: c.textTertiary }]}>
              {/* `1 cards` shipped on the shelf for a day, on the one-card
                  pack the Elite Pack used to be. Every pack deals six now, so
                  the bug cannot recur on today's data — which is exactly the
                  reason to fix it rather than let it hide. */}
              {`${pack.card_count} card${pack.card_count === 1 ? '' : 's'}`}
              {pack.once_per_user ? ' · one per player' : ''}
              {isDaily ? ' · one a day' : ''}
              {/* `opened 69×` LIVED HERE AND IS GONE. It is a fact about the
                  past on a row whose whole job is a decision about the next
                  press, and it sat in the give-field, so on a narrow phone it
                  was the card count that truncated to make room for it. */}
            </Text>
          </View>

          {/* THE PRICE IS NOT HERE ANY MORE — see the note on `label`. What
              stood in this corner was the price of ONE, on a card that can buy
              ten, so it disagreed with the button the moment ×5 was tapped.
              `FREE` went with it rather than being kept as the one survivor:
              the button already reads `Claim free pack`, and a badge repeating
              the control two inches below it is the same fact twice.

              The corner is left empty rather than refilled. A head that has
              nothing to hold is allowed to hold nothing. */}
        </View>
      </View>

      {/* FOOT — what the pack promises, and what the press does to the balance.
          The contest card's foot with one field per side, at that card's
          height, and every measurement in it stated rather than inherited.

          THE RIGHT FIELD IS ONE STRING AND IT NEVER GIVES. It was a labelled
          half holding a coin, a total and an arrow, and three tokens is what
          made it lose the width fight and take the zone's height with it. The
          arrow already says which direction the money goes, so `COST` was a
          label the row could not afford — and the total is the head's job for a
          single buy and the balance's own arithmetic for a bulk one.

          IT IS ABSENT ON A FREE PACK rather than reading `Free`, which the head
          says two inches away in green. What the row spends that space on is the
          starter pack's five position tokens, which are the only real guarantee
          in the table and would otherwise be the one thing that gets clipped. */}
      {/* THE ODDS, between the name and the button, because that is the order
          the decision is made in: what is it, what will it deal, what does it
          cost. See `Odds` for why it is four numbers and not a bar. */}
      <Odds odds={pack.odds} />

      {/* NOT DRAWN EMPTY. A pack that promises no tier and covers no position
          has nothing on either side of this zone, and the band it left behind
          read as a row that had failed to load. */}
      {coverage.length > 0 || guaranteeOf(pack.guarantee) ? (
        <View style={[styles.zone, styles.foot, { borderTopColor: c.borderStrong }]}>
          <Promised coverage={coverage} guarantee={pack.guarantee} />
        </View>
      ) : null}

      {/* ACTION — the one zone a contest card has no use for, because a contest
          card is itself the button. This is the control that spends coins, so it
          gets a row of its own with a 40pt target in it rather than a strip
          inside the foot.

          HOW MANY, THEN THE PRESS, left to right in the order they are used.
          The counts were tried beside the money line and under it; here they
          share the row with the button because the money line has moved into
          the foot, which is what freed the space that never existed before.

          A CHIP YOU CANNOT AFFORD IS STILL PRESSABLE, and that is deliberate.
          Selecting it is how you find out what ten costs — the foot answers with
          the shortfall and the button goes dead, which is the same pair of facts
          a pack you cannot afford at all already shows. Disabling the chip would
          leave the player guessing at the number. */}
      <View style={[styles.zone, styles.action, { borderTopColor: c.borderStrong }]}>
        {bulkable ? (
          <View
            style={[styles.counts, { backgroundColor: c.background, borderColor: c.border }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="How many packs to open">
            {BULK_COUNTS.map((n) => {
              const on = buying === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setCount(n)}
                  disabled={locked}
                  /* Drawn at 22 and reached out past the platform's 44 — the
                     same trade `Pip` and `DoorChip` make. See `BUTTON_H`. */
                  hitSlop={{ top: 10, bottom: 10 }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: locked }}
                  accessibilityLabel={`Open ${n === 1 ? 'one pack' : `${n} packs`}, ${(
                    pack.coin_cost * n
                  ).toLocaleString()} coins`}
                  style={({ pressed }) => [
                    styles.countChip,
                    on && { backgroundColor: c.backgroundSelected },
                    locked && styles.disabled,
                    pressed && !locked && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      Type.label,
                      NUMERIC,
                      { color: on ? accent : c.textTertiary },
                    ]}>
                    {`×${n}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          onPress={() => onOpen(buying)}
          disabled={blocked}
          /* See `BUTTON_H`: 30 drawn, 50 to a thumb. */
          hitSlop={{ top: 10, bottom: 10 }}
          accessibilityRole="button"
          /* The visible label already carries the total, so this adds only what
             the button cannot show: which pack, and what is left afterwards. */
          accessibilityLabel={`${label}: ${pack.name}. ${
            claimedToday
              ? 'Claimed today, a new one every day'
              : free
                ? 'Free, does not touch your balance'
                : affordable
                  ? `Leaves ${(coins - total).toLocaleString()} coins`
                  : `You have ${coins.toLocaleString()}`
          }`}
          accessibilityState={{ disabled: blocked, busy }}
          style={({ pressed }) => [
            styles.openButton,
            { backgroundColor: claimedToday || !affordable ? c.backgroundSelected : accent },
            blocked && styles.disabled,
            pressed && !blocked && styles.pressed,
          ]}>
          {busy ? (
            /* A COUNT RATHER THAN A SPINNER once there is more than one pack in
               flight: ten opens is ten sequential round trips, and a spinner
               that does not move for that long reads as a hang. See
               `PackShelf`'s `progress`. */
            progress && progress.total > 1 ? (
              <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: BUTTON_INK }]}>
                {`${progress.done} / ${progress.total}`}
              </Text>
            ) : (
              <ActivityIndicator />
            )
          ) : free || claimedToday || !affordable ? (
            <Text
              numberOfLines={1}
              style={[Type.strong, { color: blocked ? c.textSecondary : BUTTON_INK }]}>
              {label}
            </Text>
          ) : (
            /* THE VERB, A RULE, THE PRICE — and the verb is `Open`.
               
               It said `Purchase` for one build and that was the wrong word for
               this game. You do not purchase a pack, you OPEN one: it is what
               the button has always said, what the RPC is called, and what the
               whole screen is for. `Purchase` is the word a checkout uses, and
               a checkout is a thing you get through rather than a thing you
               came to do.
               
               The rule between the two halves is this card's own — the same
               hairline the head sets between a name and a card count — and it
               is what lets the verb stay a verb instead of running into the
               figure as `Open 250`. Action on the left, cost on the right, one
               object.
               
               The figure is last because it is the only part that moves: ×5
               grows it without shoving anything else around. */
            <View style={styles.buyLabel}>
              <Text style={[Type.strong, { color: BUTTON_INK }]}>Open</Text>
              <View style={styles.buyRule} />
              <Coin size={11} color={BUTTON_INK} />
              <Text style={[Type.strong, NUMERIC, { color: BUTTON_INK }]}>
                {total.toLocaleString()}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  /* The lobby's `stack`: cards separated by space rather than by rules, because
     a hairline between two bordered cards reads as a third edge. */
  shelf: { gap: Spacing.two },

  /**
   * A WHOLE POINT OF BORDER, and a fill under zones that paint their own.
   *
   * Both are `ContestCard`'s findings rather than fresh decisions. A hairline
   * is one physical pixel — right for a divider between two rows and too little
   * line for the one edge that states the shape of a card. And `overflow:
   * hidden` antialiases the zones against the rounded outline, so without an
   * opaque fill behind the whole card the corners show a hair of the page
   * through the gap between the clip and the border.
   */
  card: {
    borderWidth: 1,
    borderRadius: Radius.panel,
    overflow: 'hidden',
    /* The single remaining pack must not stretch the full 720 of the wide-web
       dialog, which reads as a banner rather than as a shelf. */
    maxWidth: 560,
  },

  /* EVERY ZONE, ONE GEOMETRY — `Spacing.three` of gutter, which is the sheet's
     own and the lobby card's own. */
  zone: {
    paddingHorizontal: Spacing.three,
    paddingVertical: ZONE_PAD,
    justifyContent: 'center',
  },

  head: { height: HEAD_H },
  /* Fixed at the name's own line height, so the price (22pt) and a FREE word
     (13pt) both land on the name's line without moving the zone. */
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: Type.section.lineHeight,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, minWidth: 0, flex: 1 },
  /* `minWidth: 0` is what lets a long name truncate instead of shoving the
     card count off the card. */
  headName: { flexShrink: 1, minWidth: 0 },
  /* The string that gives. The head has nothing that refuses any more — the
     price it used to hold is in the button. */
  headGive: { flexShrink: 1, minWidth: 0 },

  /* A hairline between two fields. The tall variant stretches the foot's full
     content box rather than declaring a height of its own. */
  rule: { width: StyleSheet.hairlineWidth, height: 10, flexShrink: 0 },
  ruleTall: { height: undefined, alignSelf: 'stretch', marginHorizontal: Spacing.two + 2 },

  /**
   * A FIXED HEIGHT, AND NO `flex` SHORTHAND ANYWHERE BELOW IT.
   *
   * Both are the fix for the same bug — see `Guaranteed`. A `minHeight` let a
   * field that had lost its width wrap itself into three lines and take the
   * zone from 29pt to ninety; a height cannot, so the worst a bad measurement
   * does now is truncate a string. And every grow/shrink/basis factor is named
   * on its own, because `flex: 1` sets a basis of 0% that a later `flex: 0`
   * silently keeps.
   */
  /* Four equal columns so DEPTH lands at the same x on every card in the shelf
     — see `Odds`. `flexBasis: 0` with `flexGrow: 1` and never the `flex`
     shorthand, which is this file's standing rule and the reason the foot
     survives a narrow phone. */
  odds: {
    height: ODDS_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  oddsCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    /* A COLUMN, not a row — see the note on `ODDS_H`. */
    justifyContent: 'center',
    gap: 2,
  },

  foot: {
    height: FOOT_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /* THE FIELD THAT GIVES: takes what is left and truncates into it. */
  give: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  /* THE FIELD THAT DOES NOT. A clipped `1,900 → 1,8` is the one string in this
     zone that becomes actively wrong rather than merely shorter. */
  hold: { flexGrow: 0, flexShrink: 0 },
  /* The label names the field; a truncated `GUARAN…` names nothing. It is the
     tokens that give. */
  fieldLabel: { flexGrow: 0, flexShrink: 0 },
  /* NOWRAP, DELIBERATELY — see the zone's note. The gap BETWEEN tokens is four
     times the gap inside one; below about three to one the eye stops reading
     them as pairs and sees a single run of glyphs and digits. */
  tokens: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
    overflow: 'hidden',
  },
  token: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },

  action: {
    height: ACTION_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /**
   * ONE CONTROL WITH THREE SEGMENTS, and it was three separate bordered boxes.
   *
   * Each carried its own hairline and its own radius, so the row read as three
   * buttons the eye had to rank against a fourth — and the fourth was a filled
   * gold slab, which won every time. A quantity picker is not three choices of
   * what to do; it is one setting with three positions, and the app already
   * says that shape with a tray (`SegmentedControl`, `ActionBar`): a recessed
   * container, no border on the cells, the selected one lifted.
   *
   * THE UNAFFORDABLE COUNTS ARE NO LONGER DIMMED. They were at 0.45, which on
   * this surface is most of the way to invisible, and it made a control that
   * works look broken — ×5 and ×10 are still pressable and always were, because
   * selecting one is how you find out what ten costs. The button says what you
   * are short by. That is one place for affordability instead of two, and the
   * picker goes back to being about quantity.
   */
  counts: {
    /* THE SAME NUMBER THE BUTTON TAKES — see `BUTTON_H`. Declared rather than
       left to `padding + chip`, so a change to either cannot drift the two
       controls apart by a point. */
    height: BUTTON_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    paddingHorizontal: 3,
    gap: 2,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  /* Sized off the open button's height rather than off the foot's tokens: these
     are things you press, and a 20pt target in a row of things you press is a
     miss waiting to happen. */
  countChip: {
    minWidth: 40,
    height: COUNT_CHIP_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.chip - 2,
    paddingHorizontal: Spacing.two - 2,
  },
  /* The verb, the coin and the figure. `Spacing.two - 2` between them is the
     app's mark-to-word gap — the same one `DoorChip` sets between its `+` and
     its label. */
  buyLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 1,
  },
  /* The card's own hairline, in the button's ink at a third strength — a
     divider on a saturated fill has to be the fill's own shadow rather than a
     border colour, which would read as a seam. */
  buyRule: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: BUTTON_INK,
    opacity: 0.3,
  },
  /* Takes whatever the counts leave, so a pack with no bulk row gets a
     full-width button and one with a bulk row still gets a wide target. */
  openButton: {
    flex: 1,
    height: BUTTON_H,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  // Sentences, not a grid: hold them to a readable line even in the wide dialog.
  measure: { maxWidth: 560 },
});
