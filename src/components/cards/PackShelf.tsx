/**
 * The pack shelf and the pull that follows it — the two halves of `/packs`.
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
 * What a pack contains is stated from DATA or not at all. `guaranteed_positions`
 * is real and is the one promise we can make about a pack's contents, so it is
 * printed position by position — the old copy said the starter pack "guarantees
 * one card at every lineup position" when the row actually deals RB×2 and WR×3.
 * Pull rates are NOT shown: `packs.odds` holds weights over rarity bands that
 * are still being tuned, and printing them as odds would be a promise the game
 * does not currently keep.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Gem } from '@/components/shell/AppHeader';
import {
  Colors,
  NUMERIC,
  Radius,
  Spacing,
  TierColors,
  Type,
  type CardTier,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Json } from '@/lib/database.types';
import { PlayerCard, type PlayerCardModel } from './PlayerCard';

export type Pack = {
  id: string;
  code: string;
  name: string;
  gem_cost: number;
  card_count: number;
  once_per_user: boolean;
  guaranteed_positions: Json;
};

export type Pulled = {
  card_instance_id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  rarity: string | null;
};

/** Every card is minted at the floor tier; only lineup starts move it. */
const MINT_TIER: CardTier = 'bronze';
const NEXT_TIER_LABEL = 'SILVER';

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
  gems,
  openings,
  openingCode,
  onOpen,
}: {
  /** null while the first read is in flight. */
  packs: Pack[] | null;
  gems: number;
  /** pack_id -> how many times this player has opened it. */
  openings: Map<string, number>;
  /** The pack currently being opened, if any. */
  openingCode: string | null;
  onOpen: (code: string) => void;
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
            busy={openingCode === p.code}
            // Any open in flight blocks every pack: the balance is about to
            // change, so a second purchase would be decided against a stale one.
            locked={openingCode !== null}
            onOpen={() => onOpen(p.code)}
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

/* ---- the pull ---------------------------------------------------------- */

/**
 * What just arrived, and it REPLACES the shelf rather than sitting under it.
 *
 * Two reasons, and the first is the one that was actually broken. On the old
 * page the pulled cards rendered below the shelf inside a scroll view, so on a
 * phone you spent 100 gems and the payoff was off screen — the thing you paid
 * for was the one thing you had to go looking for.
 *
 * The second is the faucet. A shelf still on screen under five new cards puts
 * "Open" a thumb's width from the moment the last one landed, which is the
 * cheapest possible second purchase. `Open another` is the same act made
 * deliberate: one tap further away, and it says what it does.
 */
/** How far apart the cards land, and how long each takes. See `PullResult`. */
const REVEAL_STAGGER_MS = 55;
const REVEAL_MS = 240;

export function PullResult({
  pulled,
  silverAt,
  onAgain,
  onSeeInventory,
}: {
  pulled: Pulled[];
  /** Career FP the next tier starts at, read from `tier_thresholds`. */
  silverAt: number;
  onAgain: () => void;
  onSeeInventory: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const toModel = (p: Pulled): PlayerCardModel => ({
    playerName: p.player_name ?? 'Unknown player',
    positionAbbreviation: p.position_abbreviation,
    teamAbbreviation: p.team_abbreviation,
    // A freshly pulled card has never been started, so it starts at the floor.
    tier: MINT_TIER,
    careerFp: 0,
    tierFloorFp: 0,
    nextTierAt: silverAt,
    nextTierLabel: NEXT_TIER_LABEL,
  });

  return (
    <>
      {/**
        * DEALT, NOT PRINTED.
        *
        * All eight used to arrive in the same frame, which is the one moment in
        * this app where that is the wrong answer: opening a pack is the reward,
        * and a reward that appears as a finished table reads as a query result.
        * The stagger costs nothing and buys the only thing missing — a sense
        * that the cards are being turned over one at a time.
        *
        * SMALL NUMBERS ON PURPOSE. 55ms apart and 240ms each puts the last card
        * of an eight-card pack down just under 0.7s, which is short enough that
        * nobody waits on it and long enough to read as dealing. This is the
        * beta's version of the moment, not the finished one — the full reveal
        * is its own piece of work.
        *
        * `entering` only, no exit: the result is replaced wholesale by the
        * shelf when you open another, and animating cards out would delay the
        * next pack behind an animation about the last one.
        *
        * Reanimated's entering animations are already used in product code (see
        * `ui/collapsible`), so this adds no dependency and nothing new to learn.
        */}
      <View style={styles.grid}>
        {pulled.map((p, i) => (
          <Animated.View
            key={p.card_instance_id}
            entering={FadeInDown.delay(i * REVEAL_STAGGER_MS).duration(REVEAL_MS)}>
            <PlayerCard model={toModel(p)} size="grid" />
          </Animated.View>
        ))}
      </View>

      <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
        New cards start at bronze. Start them in a lineup to earn their way up.
      </Text>

      <View style={styles.afterRow}>
        <Pressable
          onPress={onSeeInventory}
          accessibilityRole="button"
          accessibilityLabel="See these cards in your inventory"
          style={({ pressed }) => [
            styles.after,
            { backgroundColor: c.text },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.background }]}>See in Inventory</Text>
        </Pressable>
        <Pressable
          onPress={onAgain}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.after,
            { backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.text }]}>Open another</Text>
        </Pressable>
      </View>
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

function PackCard({
  pack,
  gems,
  opened,
  busy,
  locked,
  onOpen,
}: {
  pack: Pack;
  gems: number;
  opened: number;
  busy: boolean;
  locked: boolean;
  onOpen: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const claimed = pack.once_per_user && opened > 0;
  const free = pack.gem_cost === 0;
  const affordable = gems >= pack.gem_cost;
  const blocked = locked || claimed || !affordable;
  const coverage = coverageOf(pack.guaranteed_positions);

  const label = claimed ? 'Claimed' : free ? 'Claim free pack' : 'Open';
  /**
   * The one line that answers "can I press this, and what happens to my
   * balance if I do". Stating the shortfall beats "Not enough gems", which
   * leaves the player to do the subtraction against a number in the header.
   */
  const money = claimed
    ? 'Already claimed — one per player'
    : free
      ? 'Free · does not touch your balance'
      : affordable
        ? `${gems.toLocaleString()} → ${(gems - pack.gem_cost).toLocaleString()} gems`
        : `${(pack.gem_cost - gems).toLocaleString()} more gems needed`;

  return (
    <View style={[styles.pack, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.packHead}>
        <View style={styles.packTitle}>
          <Text numberOfLines={2} style={[Type.section, { color: c.text }]}>
            {pack.name}
          </Text>
          <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
            {`${pack.card_count} cards`}
            {pack.once_per_user ? ' · one per player' : ''}
            {opened > 0 && !pack.once_per_user ? ` · opened ${opened}×` : ''}
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

      <View style={styles.actionRow}>
        <Pressable
          onPress={onOpen}
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
            <ActivityIndicator />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  afterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  after: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
