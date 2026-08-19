/**
 * Ownership of this player across the whole game — the part of the DIRECTORY
 * profile that a per-user collection can never show.
 *
 * WHY THIS PANEL EXISTS
 *
 * Every other number on the player profile is a football number: what he did,
 * how his team uses him, how he ranks against other players. Those are the same
 * for everyone and you could read them anywhere. This is the only panel that
 * describes the OBJECT rather than the person — how many copies of him exist,
 * how many are actually being played, and how good the best one in the game has
 * become. In a collection game that is half the reason to open the page.
 *
 * THE ONE DERIVED FIGURE, AND WHY IT IS THE INTERESTING ONE
 *
 * `playedShare` — the fraction of held copies that have ever started — is what
 * separates two players who look identical on a raw count. Forty copies nobody
 * plays is a pack filler; forty copies that all start is a staple. Raw counts
 * alone cannot say which you are looking at.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No owner list, and no prices. The RPC exposes exactly one display name — the
 * holder of the single best copy, on the same basis the leaderboard already
 * publishes names against totals — and nothing else about anybody. There is no
 * trading in this game, so there is no market price to print and inventing one
 * would teach a mechanic that does not exist.
 *
 * TIER IS NEVER COLOUR ALONE, here as everywhere: each bar carries its tier
 * NAME and its COUNT as text, and the accent only makes the ranking faster to
 * read. The bars stay legible in greyscale.
 */
import { StyleSheet, Text, View } from 'react-native';

import { useTierTheme } from '@/components/cards/use-tier-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { playedShare, type MarketTier, type PlayerMarket } from './market';

const DASH = '—';

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function CommunityPanel({ market }: { market: PlayerMarket | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!market) return null;

  const { totals, tiers, top, yours, seasons } = market;
  const share = playedShare(totals);

  if (totals.minted === 0) {
    return (
      <Panel title="Across the community">
        <EmptyState
          title="No copies of this player exist yet"
          body="Nobody has pulled him from a pack. Every card enters the game that way, so the first copy is still out there."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Across the community"
      hint={`${totals.minted} minted all time`}>
      <View style={styles.body}>
        <View style={styles.figures}>
          <Figure label="IN CIRCULATION" value={String(totals.held)} hint={heldHint(market)} />
          <Figure
            label="OWNERS"
            value={String(totals.owners)}
            hint={totals.owners > 0 && totals.held > totals.owners ? 'some hold several' : undefined}
          />
          {/* The figure that says whether he is PLAYED, not merely held. */}
          <Figure
            label="EVER STARTED"
            value={share === null ? DASH : pct(share)}
            hint={share === null ? undefined : `${totals.started} of ${totals.held}`}
          />
          <Figure
            label="AVG EARNED"
            value={totals.avgFp === null ? DASH : totals.avgFp.toFixed(0)}
            hint="FP per copy"
          />
        </View>

        {/* ---- tier histogram ------------------------------------------- */}
        <View style={styles.block}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>COPIES BY TIER</Text>
          {tiers.map((t) => (
            <TierBar key={t.tier} row={t} max={Math.max(1, ...tiers.map((x) => x.copies))} />
          ))}
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            Tier is earned by starting a card, so this is a picture of how much this player has
            actually been played — not of how rare he is.
          </Text>
        </View>

        {/* ---- the best copy in the game --------------------------------- */}
        <View style={[styles.best, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>BEST COPY IN THE GAME</Text>
          {top ? (
            <>
              <View style={styles.bestLine}>
                <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
                  {top.careerFp.toFixed(1)}
                </Text>
                <Text style={[Type.fine, { color: c.textSecondary }]}>
                  {`FP over ${top.lineupStarts} start${top.lineupStarts === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Text style={[Type.body, { color: c.textSecondary }]}>
                {top.isYou ? (
                  <Text style={{ color: c.positive }}>That one is yours.</Text>
                ) : (
                  `Held by ${top.displayName}`
                )}
                {top.season ? ` · ${top.season} card` : ''}
                {` · ${top.tier} tier`}
              </Text>
            </>
          ) : (
            /* Every copy on zero means the "highest" is whichever row sorted
               first — noise dressed as a leaderboard. Say the true thing. */
            <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
              Nobody has started a copy of this player yet, so no copy has earned anything. The
              first person to play him takes this spot.
            </Text>
          )}
        </View>

        {/* ---- where you stand ------------------------------------------ */}
        {yours ? (
          <Text style={[Type.body, { color: c.textSecondary }]}>
            {`You hold ${yours.copies} ${yours.copies === 1 ? 'copy' : 'copies'}. Your best is ${yours.bestTier} on ${yours.bestFp.toFixed(1)} FP — `}
            <Text style={{ color: c.text }}>
              {`#${yours.bestRank} of ${totals.held}`}
            </Text>
            {' in circulation.'}
          </Text>
        ) : (
          <Text style={[Type.body, { color: c.textSecondary }]}>You hold no copies of him.</Text>
        )}

        {/* ---- added to the set, per season ------------------------------ */}
        {seasons.length > 0 ? (
          <View style={styles.block}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>ADDED TO THE SET</Text>
            {seasons.map((s) => (
              <View key={s.season} style={styles.seasonRow}>
                <Text style={[Type.body, NUMERIC, styles.seasonYear, { color: c.text }]}>
                  {s.season}
                </Text>
                <Text style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
                  {`${s.held} held`}
                </Text>
                {/* Only worth printing when they differ — otherwise it is the
                    same number twice and reads as a mistake. */}
                {s.minted !== s.held ? (
                  <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
                    {`${s.minted - s.held} sold back`}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

/** "3 sold back" is a fact about the player, so it rides with the headline. */
function heldHint(market: PlayerMarket): string | undefined {
  const gone = market.totals.minted - market.totals.held;
  if (gone <= 0) return undefined;
  return `${gone} sold back`;
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.figure, { backgroundColor: c.backgroundElement }]}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[Type.figure, NUMERIC, { color: c.text }]}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One tier's share of the held copies.
 *
 * The bar is scaled to the BIGGEST tier rather than to the total, because the
 * question is "where do the copies sit", and against a total the three small
 * tiers of a heavily-bronze player all collapse to invisible slivers.
 */
function TierBar({ row, max }: { row: MarketTier; max: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const t = useTierTheme(row.tier);
  const width = row.copies === 0 ? 0 : Math.max(0.04, row.copies / max);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${row.tier} tier, ${row.copies} ${row.copies === 1 ? 'copy' : 'copies'}`}
      style={styles.tierRow}>
      {/* numberOfLines is load-bearing, not defensive: DIAMOND is the longest
          tier name and wrapped to "DIAMON / D" at the original 54pt. */}
      <Text numberOfLines={1} style={[Type.label, styles.tierName, { color: c.textSecondary }]}>
        {row.tier.toUpperCase()}
      </Text>
      <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
        <View
          style={[
            styles.fill,
            { width: `${width * 100}%`, backgroundColor: t.colors.accent },
          ]}
        />
      </View>
      <Text style={[Type.body, NUMERIC, styles.tierCount, { color: c.text }]}>{row.copies}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.two + 2, gap: Spacing.three },
  /* Wraps, for the same reason the profile's own stat row does: four tiles
     across a phone-width sheet leaves too little inside each one to hold both
     the label and the figure. */
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  figure: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 130,
    borderRadius: Radius.chip,
    padding: Spacing.two,
    gap: 1,
  },
  block: { gap: Spacing.one + 2 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tierName: { width: 62 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  tierCount: { width: 32, textAlign: 'right' },
  best: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    padding: Spacing.two + 2,
    gap: Spacing.one,
  },
  bestLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  seasonRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  seasonYear: { width: 44 },
});
