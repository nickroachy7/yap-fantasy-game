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
 * Behaviour carried across verbatim where it was already right: a claimed
 * one-per-player pack must render as a disabled "Claimed" button rather than
 * letting the user fire the RPC and read a raw Postgres error, and a zero gem
 * cost reads as "Free".
 *
 * BUYING SEVERAL AT ONCE is the card's one control beyond the button. See
 * `BULK_COUNTS` and the note on the quantity row for which packs get it and
 * why the free ones do not.
 *
 * What a pack contains is stated from DATA or not at all. `guaranteed_positions`
 * is real and is the one promise we can make about a pack's contents, so it is
 * printed position by position — the old copy said the starter pack "guarantees
 * one card at every lineup position" when the row actually deals RB×2 and WR×3.
 * Pull rates are NOT shown: `packs.odds` holds weights over rarity bands that
 * are still being tuned, and printing them as odds would be a promise the game
 * does not currently keep.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { packDaily, packPro, packStandard, packStarter } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Json } from '@/lib/database.types';

export type Pack = {
  id: string;
  code: string;
  name: string;
  gem_cost: number;
  card_count: number;
  once_per_user: boolean;
  /** Opens allowed per day, or null for a pack with no daily limit. */
  daily_limit: number | null;
  guaranteed_positions: Json;
};

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
  gems,
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
  gems: number;
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

  return (
    <>
      <View style={styles.shelf}>
        {packs.map((p) => (
          <PackCard
            key={p.id}
            pack={p}
            gems={gems}
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

      <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
        Pull rates are not published yet. Which cards a pack can contain is decided server-side —
        the position guarantees above are the only promise a pack makes about its contents today.
      </Text>
    </>
  );
}

/* ---- parts ------------------------------------------------------------- */

export function CoverageChip({ entry }: { entry: Coverage }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${entry.count} ${entry.position}`}
      style={[styles.chip, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <Text style={[Type.label, { color: c.text }]}>{entry.position}</Text>
      <Text style={[Type.label, NUMERIC, { color: c.textTertiary }]}>{`×${entry.count}`}</Text>
    </View>
  );
}

/** One row of the pack's spec sheet: a 9pt label and a value on the same line. */
function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.specRow}>
      <Text style={[Type.micro, styles.specLabel, { color: c.textTertiary }]}>{label}</Text>
      <View style={styles.specValue}>{children}</View>
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
  gems,
  opened,
  dailyAvailable,
  busy,
  progress,
  locked,
  onOpen,
}: {
  pack: Pack;
  gems: number;
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
   * Two kinds of "claimed", and they must not read the same. A once-per-player
   * pack is SPENT — that button is never coming back. A daily is merely used up
   * for now, and telling somebody "already claimed" for something that returns
   * in a few hours is how a reward turns into a dead end.
   *
   * Null while the status is still loading: treated as claimed, because a
   * button that works is the safer thing to arrive at late.
   */
  const claimedToday = isDaily && dailyAvailable !== true;
  const claimed = (pack.once_per_user && opened > 0) || claimedToday;
  const free = pack.gem_cost === 0;

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
   * So the row appears on a repeatable pack you spend gems on, which today is
   * the standard pack and whatever is priced beside it later.
   */
  const bulkable = !pack.once_per_user && !isDaily && pack.gem_cost > 0;
  const [count, setCount] = useState(1);
  /* Never trust the state over the pack: a row that stops being repeatable
     between renders must not keep a 10 the button would then fire. */
  const buying = bulkable ? count : 1;
  const total = pack.gem_cost * buying;

  const affordable = gems >= total;
  const blocked = locked || claimed || !affordable;
  const coverage = coverageOf(pack.guaranteed_positions);

  const label = claimedToday
    ? 'Back tomorrow'
    : claimed
      ? 'Claimed'
      : free
        ? 'Claim free pack'
        : buying > 1
          ? `Open ${buying}`
          : 'Open';
  /**
   * The one line that answers "can I press this, and what happens to my
   * balance if I do". Stating the shortfall beats "Not enough gems", which
   * leaves the player to do the subtraction against a number in the header.
   *
   * THE TOTAL LEADS ON A BULK BUY, because the figure printed at the top of the
   * card is the price of ONE and the press spends `buying` of them. A line that
   * only showed the balance either side of the purchase would leave the player
   * to work out what the difference was for.
   */
  const money = claimedToday
    ? 'Claimed today — a new one every day'
    : claimed
      ? 'Already claimed — one per player'
      : free
        ? 'Free · does not touch your balance'
        : affordable
          ? buying > 1
            ? `${total.toLocaleString()} gems · ${gems.toLocaleString()} → ${(gems - total).toLocaleString()}`
            : `${gems.toLocaleString()} → ${(gems - total).toLocaleString()} gems`
          : `${(total - gems).toLocaleString()} more gems needed`;

  const packGlyph = PACK_GLYPHS[pack.code];

  return (
    <View style={[styles.pack, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.packHead}>
        {/* The mark is keyed off `packs.code`, so a pack added to the table
            without a glyph here simply renders without one rather than
            crashing or falling back to the wrong picture. */}
        {packGlyph ? (
          <Icon
            glyph={packGlyph}
            color={free ? c.positive : c.textSecondary}
            size={28}
            focused
          />
        ) : null}
        <View style={styles.packTitle}>
          <Text numberOfLines={2} style={[Type.section, { color: c.text }]}>
            {pack.name}
          </Text>
          <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
            {`${pack.card_count} cards`}
            {pack.once_per_user ? ' · one per player' : ''}
            {isDaily ? ' · one a day' : ''}
            {opened > 0 && !pack.once_per_user && !isDaily ? ` · opened ${opened}×` : ''}
          </Text>
        </View>

        {free ? (
          <Text style={[Type.label, styles.freeTag, { color: c.positive, borderColor: c.positive }]}>
            FREE
          </Text>
        ) : (
          <View style={styles.price}>
            <Gem size={9} color={accent} />
            <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
              {pack.gem_cost.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.rule, { backgroundColor: c.border }]} />

      <SpecRow label="GUARANTEED">
        {coverage.length > 0 ? (
          <View style={styles.chipRow}>
            {coverage.map((entry) => (
              <CoverageChip key={entry.position} entry={entry} />
            ))}
          </View>
        ) : (
          // An empty guaranteed_positions is a real answer, not missing data:
          // this pack promises nothing about which positions turn up.
          <Text style={[Type.body, { color: c.textSecondary }]}>No position guarantee</Text>
        )}
      </SpecRow>

      <SpecRow label="PULL RATES">
        <Text style={[Type.body, { color: c.textTertiary }]}>Not published yet</Text>
      </SpecRow>

      <View style={[styles.rule, { backgroundColor: c.border }]} />

      {/* HOW MANY, on its own row above the button rather than beside it.

          The action row is a button with a hard 128pt floor and a money line
          that runs to two lines beside it, inside a card that is 240pt at its
          narrowest — there is no third slot in there, and every attempt at one
          either shrank the button below a thumb or pushed the money line to
          three lines. Above it the chips get the full measure and read as what
          they are: the thing you set before you press.

          A CHIP YOU CANNOT AFFORD IS STILL PRESSABLE, and that is deliberate.
          Selecting it is how you find out what ten costs — the money line
          answers with the shortfall and the button goes dead, which is the same
          pair of facts a pack you cannot afford at all already shows. Disabling
          the chip would leave the player guessing at the number. */}
      {bulkable && !claimed ? (
        <View
          style={styles.countRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="How many packs to open">
          {BULK_COUNTS.map((n) => {
            const on = buying === n;
            const reach = pack.gem_cost * n <= gems;
            return (
              <Pressable
                key={n}
                onPress={() => setCount(n)}
                disabled={locked}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: locked }}
                accessibilityLabel={`Open ${n === 1 ? 'one pack' : `${n} packs`}, ${(
                  pack.gem_cost * n
                ).toLocaleString()} gems`}
                style={({ pressed }) => [
                  styles.countChip,
                  {
                    backgroundColor: on ? c.backgroundSelected : 'transparent',
                    borderColor: on ? accent : c.border,
                  },
                  /* Dimmed, not disabled — see the note above. */
                  !reach && !on && styles.outOfReach,
                  locked && styles.disabled,
                  pressed && !locked && styles.pressed,
                ]}>
                <Text
                  style={[Type.label, NUMERIC, { color: on ? c.text : c.textSecondary }]}>
                  {`×${n}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => onOpen(buying)}
          disabled={blocked}
          accessibilityRole="button"
          // The reason a disabled button is disabled lives in the money line
          // next to it, which a screen reader would reach only after the button.
          accessibilityLabel={`${label}: ${pack.name}. ${money}`}
          accessibilityState={{ disabled: blocked, busy }}
          style={({ pressed }) => [
            styles.openButton,
            { backgroundColor: claimed || !affordable ? c.backgroundSelected : accent },
            blocked && styles.disabled,
            pressed && !blocked && styles.pressed,
          ]}>
          {busy ? (
            /* A COUNT RATHER THAN A SPINNER once there is more than one pack in
               flight: ten opens is ten sequential round trips, and a spinner
               that does not move for that long reads as a hang. See
               `PackShelf`'s `progress`. */
            progress && progress.total > 1 ? (
              <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: '#17130A' }]}>
                {`${progress.done} / ${progress.total}`}
              </Text>
            ) : (
              <ActivityIndicator />
            )
          ) : (
            <Text
              numberOfLines={1}
              style={[
                Type.strong,
                { color: claimed || !affordable ? c.textSecondary : '#17130A' },
              ]}>
              {label}
            </Text>
          )}
        </Pressable>
        <Text numberOfLines={2} style={[Type.fine, NUMERIC, styles.money, { color: c.textSecondary }]}>
          {money}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  /* Packs sit side by side wherever there is room — which in a sheet means the
     wide-web dialog and nothing else. maxWidth stops the single remaining pack
     stretching the full 720 once the starter is claimed, which reads as a
     banner rather than as a shelf. */
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  pack: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 240,
    maxWidth: 480,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  packHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  packTitle: { flex: 1, minWidth: 0, gap: 1 },
  price: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  freeTag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: Spacing.one + 1,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  rule: { height: StyleSheet.hairlineWidth },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 20 },
  specLabel: { width: 76 },
  specValue: { flex: 1, minWidth: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: Spacing.one + 1,
    paddingVertical: 2,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  /* Sized off the open button's 40pt minimum rather than off the coverage
     chips beside them: these are things you press, and a 20pt chip in a row of
     things you press is a miss waiting to happen. */
  countChip: {
    minWidth: 52,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
  },
  /* A count the balance does not cover. Still pressable — see the row's note. */
  outOfReach: { opacity: 0.45 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  openButton: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
    minWidth: 128,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  money: { flexShrink: 1 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  // Sentences, not a grid: hold them to a readable line even in the wide dialog.
  measure: { maxWidth: 560 },
});
