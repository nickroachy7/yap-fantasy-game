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

import { EmptyState } from '@/components/ui/EmptyState';
import { EarningsScale } from './EarningsScale';
import { Section } from './Section';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { playedShare, type MarketTier, type MarketYours, type PlayerMarket } from './market';

export function CommunityPanel({
  market,
  copy,
}: {
  market: PlayerMarket | null;
  /**
   * The ONE copy the page is about, on the card profile.
   *
   * Without it the scale plots your BEST copy, which is what the directory
   * page wants — it is about the player, and if you hold three the interesting
   * one is the best. On `/card/<id>` that would be wrong in the one way that
   * matters: you opened a specific object, and a scale showing a different
   * copy of the same player is a chart about somebody else's decision.
   *
   * The rank travels with it and comes from `card_profile`, NOT from
   * `market.yours.bestRank`. Both RPCs compute a rank among copies of this
   * player, so reading the market's on a page that already holds the card's own
   * is two sources for one number, free to disagree the moment somebody starts
   * a lineup between the two reads.
   */
  copy?: { careerFp: number; rank: number; pool: number } | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!market) return null;

  const { totals, tiers, top, yours, seasons } = market;
  const share = playedShare(totals);

  /* The copy the scale marks, and the rank that names its position. See `copy`
     above for why the card page passes its own rather than letting this reach
     for the market's. */
  const yoursFp = copy ? copy.careerFp : (yours?.bestFp ?? null);
  const rankHint = copy ? `#${copy.rank} OF ${copy.pool}` : standingHint(yours, totals.held);

  if (totals.minted === 0) {
    return (
      <Section label="ACROSS THE COMMUNITY">
        <EmptyState
          title="No copies of this player exist yet"
          body="Nobody has pulled him from a pack. Every card enters the game that way, so the first copy is still out there."
        />
      </Section>
    );
  }

  return (
    <>
      {/**
        * ONE BAR IS THE POPULATION.
        *
        * This was four figure tiles — circulation, owners, ever started, avg
        * earned — each with a sub-hint under it, and then `COPIES BY TIER` as
        * four more bars underneath. Twelve pieces of small type in a strip 60pt
        * tall, followed by a second picture of the SAME fifteen copies. Two
        * visualisations, one population, and neither of them a glance.
        *
        * The stacked bar is the population: composition and total in one
        * object, in the tiers' own colours so it reads without consulting the
        * legend. The three counts that were tiles become one grey line under
        * it, because they are context rather than headline — a reader who wants
        * "how many exist" has already read it in the section's hint.
        */}
      <Section
        label="ACROSS THE COMMUNITY"
        hint={`${totals.held} ${totals.held === 1 ? 'COPY' : 'COPIES'} · ${totals.owners} ${totals.owners === 1 ? 'OWNER' : 'OWNERS'}`}>
        <TierComposition tiers={tiers} held={totals.held} />

        <Text style={[Type.fine, { color: c.textTertiary }]}>
          {[
            `${totals.minted} minted all time`,
            totals.sold > 0 ? `${totals.sold} sold back` : null,
            share === null ? null : `${totals.started} of ${totals.held} ever started`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Section>

      {/**
        * WHERE THIS COPY SITS, which is the question the tiles were failing to
        * answer between them. See `EarningsScale` for why it is a scale rather
        * than the rank it replaced.
        */}
      <Section label="WHAT COPIES HAVE EARNED" hint={rankHint}>
        {top && top.careerFp > 0 ? (
          <EarningsScale
            yours={yoursFp}
            average={totals.avgFp}
            best={top.careerFp}
            marks={tiers.map((t) => t.bestFp ?? 0)}
            bestLabel={
              top.isYou
                ? `The best copy in the game is yours, over ${top.lineupStarts} start${top.lineupStarts === 1 ? '' : 's'}.`
                : `The best is ${top.displayName}'s ${top.tier}, over ${top.lineupStarts} start${top.lineupStarts === 1 ? '' : 's'}.`
            }
          />
        ) : (
          /* Every copy on zero. A scale would put every mark on one point and
             say "you are level with the best copy in the game", which is true
             and deeply misleading. */
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            Nobody has started a copy of this player yet, so no copy has earned anything. The first
            person to play him takes the top of this scale.
          </Text>
        )}
      </Section>

      {/* ---- added to the set, per season --------------------------------- */}
      {seasons.length > 0 ? (
        <Section label="ADDED TO THE SET">
          <View style={styles.block}>
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
        </Section>
      ) : null}
    </>
  );
}

/**
 * The rank, as the scale's hint.
 *
 * Absent when you hold none of the player, because there is no position to
 * report — the scale is then a picture of other people's copies, which is still
 * worth showing to somebody deciding whether to chase one.
 */
function standingHint(yours: MarketYours | null, held: number): string | undefined {
  if (!yours) return undefined;
  return `#${yours.bestRank} OF ${held}`;
}

/**
 * The held copies as one stacked bar.
 *
 * SCALED TO THE TOTAL, not to the biggest tier — the opposite of the bar chart
 * this replaces, and correct for the opposite reason. Those were four separate
 * bars answering "how does bronze compare to gold", where a shared total scale
 * would have collapsed three of them to slivers. This is one bar answering
 * "what is the shape of the population", and there the parts must add up.
 *
 * A tier with no copies contributes no segment at all rather than a zero-width
 * one, and says so in the legend instead. A 2px gap between segments does the
 * separating, so two adjacent tiers of similar colour — bronze against gold on
 * a small bar — never read as one.
 */
function TierComposition({ tiers, held }: { tiers: MarketTier[]; held: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (held <= 0) return null;

  return (
    <View style={styles.block}>
      <View style={styles.stack}>
        {tiers
          .filter((t) => t.copies > 0)
          .map((t) => (
            <View
              key={t.tier}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${t.tier} tier, ${t.copies} ${t.copies === 1 ? 'copy' : 'copies'}`}
              style={[
                styles.segment,
                { flex: t.copies, backgroundColor: TierColors[scheme][t.tier].accent },
              ]}
            />
          ))}
      </View>

      <View style={styles.legend}>
        {tiers.map((t) => (
          <View key={t.tier} style={styles.legendItem}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor:
                    t.copies > 0 ? TierColors[scheme][t.tier].accent : c.backgroundElement,
                },
              ]}
            />
            <Text
              style={[
                Type.fine,
                { color: t.copies > 0 ? c.textSecondary : c.textTertiary },
              ]}>
              {t.tier[0].toUpperCase() + t.tier.slice(1)}
            </Text>
            <Text
              style={[
                Type.fine,
                NUMERIC,
                { color: t.copies > 0 ? c.text : c.textTertiary },
              ]}>
              {t.copies}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two + 2 },
  /* The gap is the separator. Two adjacent segments in neighbouring tier
     colours — bronze against gold at small sizes — otherwise read as one. */
  stack: { flexDirection: 'row', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden' },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
  seasonRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  seasonYear: { width: 44 },
});
