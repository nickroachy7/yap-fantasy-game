/**
 * Collection · Shop — buy and open packs.
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
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { Gem } from '@/components/shell/AppHeader';
import { useTabBarInset } from '@/components/shell/useResponsive';
import {
  Colors,
  NUMERIC,
  Spacing,
  TierColors,
  Type,
  type CardTier,
} from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { PlayerCard, type PlayerCardModel } from './PlayerCard';

type Pack = {
  id: string;
  code: string;
  name: string;
  gem_cost: number;
  card_count: number;
  once_per_user: boolean;
  guaranteed_positions: Json;
};

type Pulled = {
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

type Coverage = { position: string; count: number };

/** `guaranteed_positions` is jsonb, so it is `unknown` until proven otherwise. */
function coverageOf(raw: Json): Coverage[] {
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

function countPositions(cards: Pulled[]): Coverage[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const position = card.position_abbreviation?.toUpperCase() ?? '—';
    counts.set(position, (counts.get(position) ?? 0) + 1);
  }

  return coverageOf(Object.fromEntries(counts) as Json);
}

export function ShopPanel() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  // Single source of truth for the balance: the header reads the same value, so
  // fetching it separately here is how the two drift apart.
  const { gems, refresh } = usePlayer();

  const [packs, setPacks] = useState<Pack[] | null>(null);
  /** pack_id -> how many times this player has opened it. */
  const [openings, setOpenings] = useState<Map<string, number>>(() => new Map());
  const [silverAt, setSilverAt] = useState<number>(200);
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Pulled[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* This one reports its own failures rather than handing them to useLoader:
     the shelf and the pack-opening share a single error line, and splitting
     them into two states would leave one of them stale on screen. */
  const load = useCallback<Load>(async (live) => {
    const [packRes, openedRes, tierRes] = await Promise.all([
      supabase
        .from('packs')
        // is_active is filtered here rather than displayed: open_pack() rejects
        // an inactive pack outright, so listing one is offering a button whose
        // only possible outcome is an error.
        .select('id, code, name, gem_cost, card_count, once_per_user, guaranteed_positions')
        .eq('is_active', true)
        .order('gem_cost'),
      // RLS scopes this to the caller, so it is exactly "packs I have opened".
      supabase.from('pack_openings').select('pack_id'),
      // The silver floor is tunable in the database; reading it beats baking
      // 200 into the client and having the card lie after a balance change.
      supabase.from('tier_thresholds').select('min_career_fp').eq('tier', 'silver').maybeSingle(),
    ]);
    if (!live()) return;
    if (packRes.error) return void setError(packRes.error.message);
    if (openedRes.error) return void setError(openedRes.error.message);

    setError(null);
    setPacks(packRes.data as Pack[]);
    const counts = new Map<string, number>();
    for (const row of openedRes.data ?? []) {
      counts.set(row.pack_id, (counts.get(row.pack_id) ?? 0) + 1);
    }
    setOpenings(counts);
    if (!tierRes.error && tierRes.data) setSilverAt(Number(tierRes.data.min_career_fp));
  }, []);

  // Quiet by design: the shelf that is already drawn stays drawn while it is
  // re-read after a pack is opened.
  const { refresh: reloadShelf } = useLoader(load);

  const open = useCallback(
    async (code: string) => {
      setOpeningCode(code);
      setError(null);
      setPulled(null);
      // All RNG, gem math and minting happen inside this one call, server-side.
      const { data, error: err } = await supabase.rpc('open_pack', { p_pack_code: code });
      if (err) {
        setError(err.message);
      } else {
        setPulled((data ?? []) as Pulled[]);
        // The cards this just minted are in the collection now, and the
        // inventory holds it for the session — so the held copy is wrong until
        // it is dropped. See `invalidateCollection`.
        invalidateCollection();
        // Five new cards can move six sets, so the held progress is wrong too.
        invalidateSets();
        // Both matter: `load` re-reads the openings so a one-per-player pack
        // flips to Claimed, `refresh` re-reads the balance the header shows.
        await Promise.all([reloadShelf(), refresh()]);
      }
      setOpeningCode(null);
    },
    [reloadShelf, refresh],
  );

  const toModel = useCallback(
    (p: Pulled): PlayerCardModel => ({
      playerName: p.player_name ?? 'Unknown player',
      positionAbbreviation: p.position_abbreviation,
      teamAbbreviation: p.team_abbreviation,
      // A freshly pulled card has never been started, so it starts at the floor.
      tier: MINT_TIER,
      careerFp: 0,
      tierFloorFp: 0,
      nextTierAt: silverAt,
      nextTierLabel: NEXT_TIER_LABEL,
    }),
    [silverAt],
  );

  const tabInset = useTabBarInset();

  const pulledPositions = useMemo(() => (pulled ? countPositions(pulled) : []), [pulled]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: tabInset + Spacing.four }]}
      keyboardShouldPersistTaps="handled">
      {packs === null && !error ? <ActivityIndicator /> : null}

      <View style={styles.shelf}>
        {packs?.map((p) => (
          <PackCard
            key={p.id}
            pack={p}
            gems={gems}
            opened={openings.get(p.id) ?? 0}
            busy={openingCode === p.code}
            // Any open in flight blocks every pack: the balance is about to
            // change, so a second purchase would be decided against a stale one.
            locked={openingCode !== null}
            onOpen={() => void open(p.code)}
          />
        ))}
      </View>

      {packs !== null ? (
        <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
          Pull rates are not published yet. Which cards a pack can contain is decided server-side —
          the position guarantees above are the only promise a pack makes about its contents today.
        </Text>
      ) : null}

      {error ? (
        <View style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surface }]}>
          <View style={styles.noticeText}>
            <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
            <Text style={[Type.body, { color: c.text }]}>{error}</Text>
          </View>
          {/* Only when the shelf itself failed to load. Offering "try again"
              after "insufficient gems" invites the player to retry something
              that cannot succeed until the balance changes. */}
          {packs === null ? (
            <Pressable
              onPress={() => void reloadShelf()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: c.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.text }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {pulled ? (
        <View style={styles.pulledBlock}>
          <View style={styles.pulledHead}>
            <Text style={[Type.section, { color: c.text }]}>
              {pulled.length === 1 ? 'You pulled 1 card' : `You pulled ${pulled.length} cards`}
            </Text>
            <Pressable
              onPress={() => router.push('/collection/inventory')}
              accessibilityRole="button"
              accessibilityLabel="See these cards in your inventory"
              style={({ pressed }) => [pressed && styles.pressed]}>
              <Text style={[Type.strong, { color: c.textSecondary }]}>See in Inventory →</Text>
            </Pressable>
          </View>

          {/* What arrived, by position — the same shape the pack promised. */}
          <View style={styles.chipRow}>
            {pulledPositions.map((entry) => (
              <CoverageChip key={entry.position} entry={entry} />
            ))}
          </View>

          <View style={styles.grid}>
            {pulled.map((p) => (
              <PlayerCard key={p.card_instance_id} model={toModel(p)} size="grid" />
            ))}
          </View>
          <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
            New cards start at bronze. Start them in a lineup to earn their way up.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function CoverageChip({ entry }: { entry: Coverage }) {
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  // Packs sit side by side wherever there is room. maxWidth stops two packs
  // stretching to 570pt each on a monitor, which reads as a banner, not a shelf.
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  pack: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 240,
    maxWidth: 480,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
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
    borderRadius: 8,
    minWidth: 128,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  money: { flexShrink: 1 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.two + 2,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  noticeText: { gap: Spacing.half },
  retry: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two - 2 },
  // Sentences, not a grid: hold them to a readable line even at measure 'grid'.
  measure: { maxWidth: 560 },
  pulledBlock: { gap: Spacing.two + 2 },
  pulledHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
