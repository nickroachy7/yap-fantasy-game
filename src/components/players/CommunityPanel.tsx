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

import { EarningsScale } from './EarningsScale';
import { Row, Section } from './Section';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type MarketTier, type MarketTop, type PlayerMarket } from './market';

export function CommunityPanel({
  market,
  playerName,
  copy,
}: {
  market: PlayerMarket | null;
  /** Names the population section — "Every Cam Ward" rather than "the community". */
  playerName: string;
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
  if (!market) return null;

  const { totals, tiers, top, yours, seasons } = market;

  /* The copy the scale marks, and the rank that names its position. See `copy`
     above for why the card page passes its own rather than letting this reach
     for the market's. */
  const yoursFp = copy ? copy.careerFp : (yours?.bestFp ?? null);
  /* The rank as a ROW rather than the section's hint: the zone's hint belongs
     to the population above it, and a rank is a fact about one copy. */
  const rankValue = copy
    ? `#${copy.rank} of ${copy.pool} · ${copy.careerFp.toFixed(1)} FP`
    : yours
      ? `#${yours.bestRank} of ${totals.held} · ${yours.bestFp.toFixed(1)} FP`
      : null;

  if (totals.minted === 0) {
    return (
      <Section label={`Every ${playerName}`}>
        <Row
          label="Copies"
          value="None yet — every card enters the game from a pack"
          muted
        />
      </Section>
    );
  }

  return (
    <>
      {/**
        * THREE SECTIONS, IN THE ORDER A READER ASKS THEM.
        *
        * How many exist and at what tier, then where mine sits among them, then
        * who is doing best. It was one block of four figure tiles plus a
        * four-row bar chart plus a best-copy panel plus a paragraph — four
        * headings describing the same population, and no order to them at all.
        */}
      <Section
        label={`Every ${playerName}`}
        hint={`${totals.held} ${totals.held === 1 ? 'COPY' : 'COPIES'} · ${totals.owners} ${totals.owners === 1 ? 'OWNER' : 'OWNERS'}`}>
        <TierComposition tiers={tiers} held={totals.held} />
        <Row label="Minted" value={mintedValue(totals)} />
        <Row label="Ever started" value={`${totals.started} of ${totals.held}`} />
        {seasons.map((s) => (
          <Row
            key={s.season}
            label={`${s.season} printing`}
            value={
              s.minted === s.held
                ? `${s.held} held`
                : `${s.held} held · ${s.minted - s.held} sold back`
            }
          />
        ))}
      </Section>

      {/* Only when there is a position to report. On a player you hold none of,
          the scale would be a chart about other people with no mark on it. */}
      {yoursFp !== null && top && top.careerFp > 0 ? (
        <Section label="Where yours ranks" hint={rankValue ?? undefined}>
          <EarningsScale
            yours={yoursFp}
            average={totals.avgFp}
            best={top.careerFp}
            marks={tiers.map((t) => t.bestFp ?? 0)}
          />
        </Section>
      ) : null}

      <Section label="Best copies">
        {/* ONE COPY, BECAUSE THE SERVER RETURNS ONE. `player_market` gives a
            single `top`; a leaderboard of three needs it to return a list, and
            inventing the other two from the tier bests would be a chart of
            different players' cards dressed as a ranking. */}
        <Row label="Best" value={bestValue(top)} muted={!top || top.careerFp <= 0} />
        {tiers
          .filter((t) => t.copies > 0 && (t.bestFp ?? 0) > 0)
          .map((t) => (
            <Row
              key={t.tier}
              label={`Best ${t.tier}`}
              value={`${(t.bestFp as number).toFixed(0)} FP · ${t.copies} ${t.copies === 1 ? 'copy' : 'copies'}`}
            />
          ))}
      </Section>
    </>
  );
}

/** "18 all time · 3 sold back", or just the count when none have gone. */
function mintedValue(totals: PlayerMarket['totals']): string {
  return totals.sold > 0 ? `${totals.minted} · ${totals.sold} sold back` : String(totals.minted);
}

/**
 * Who holds the best copy and what it has done.
 *
 * Every copy on zero is its own answer rather than a rank: the "highest" would
 * be whichever row sorted first, which is noise dressed as a leaderboard.
 */
function bestValue(top: MarketTop | null): string {
  if (!top || top.careerFp <= 0) return 'None yet — first to play him takes it';
  const over = `over ${top.lineupStarts} start${top.lineupStarts === 1 ? '' : 's'}`;
  return top.isYou
    ? `Yours · ${top.careerFp.toFixed(0)} FP ${over}`
    : `${top.displayName} · ${top.careerFp.toFixed(0)} FP ${over}`;
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
