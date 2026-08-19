/**
 * Where one owned copy stands: its tier progress, and its rank among the
 * copies it is actually competing with.
 *
 * TWO POOLS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS
 *
 * "#2 of 47 Caleb Williams cards" tells you whether to keep starting THIS copy
 * or chase a better one. "#310 of 12,400 cards" tells you what you are holding
 * in the game as a whole. A single rank cannot say both, and the second one
 * alone is the sort of number that looks impressive and decides nothing.
 *
 * Both are COMPETITION ranks — copies strictly above this one, plus one — so
 * ties share a place. The pool travels with every rank here for the same reason
 * it does in CareerTable: "#2" on its own is a claim the data does not support.
 *
 * THE PROGRESS BAR MEASURES FROM THE TIER FLOOR, NOT FROM ZERO
 *
 * Measuring from zero makes every silver card look nearly empty and every
 * diamond look full — true about career totals, useless for "how close am I".
 * The bar fills across the tier the card is currently in. At diamond there is
 * no next threshold, so there is no bar: a full one would imply a level above
 * that does not exist.
 */
import { StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards/TierBadge';
import { useTierTheme } from '@/components/cards/use-tier-theme';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { percentile, tierProgress, type CardIdentity, type CardRank } from './card-profile';

export function CardStanding({ card, rank }: { card: CardIdentity; rank: CardRank }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const t = useTierTheme(card.tier);

  const progress = tierProgress(card);
  const toNext = card.nextTierAt === null ? null : Math.max(0, card.nextTierAt - card.careerFp);
  /* Only said when it is actually a distinction. `percentile` is honest at any
     value, but "top 83%" reads as a boast about a card in the bottom fifth —
     the phrasing implies a claim the number contradicts. Above the halfway mark
     the rank and the pool already say everything true. */
  const rawPct = percentile(rank.overall, rank.overallPool);
  const overallPct = rawPct !== null && rawPct <= 50 ? rawPct : null;

  return (
    <Panel title="This copy">
      <View style={styles.body}>
        {/* ---- what it has earned ---------------------------------------- */}
        <View style={styles.headline}>
          <TierBadge tier={card.tier} size="detail" />
          <View style={styles.headlineFigures}>
            <Text style={[Type.page, NUMERIC, { color: c.text }]}>
              {card.careerFp.toFixed(1)}
            </Text>
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              {`FP earned over ${card.lineupStarts} start${card.lineupStarts === 1 ? '' : 's'}`}
              {card.fpPerStart !== null ? ` · ${card.fpPerStart.toFixed(1)} per start` : ''}
            </Text>
          </View>
        </View>

        {/* ---- tier progress --------------------------------------------- */}
        {progress === null || toNext === null || card.nextTierLabel === null ? (
          <Text style={[Type.body, { color: c.textSecondary }]}>
            This copy is at the top tier. There is nothing above diamond.
          </Text>
        ) : (
          <View style={styles.progressBlock}>
            <View style={styles.progressLabels}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>
                {card.tier.toUpperCase()}
              </Text>
              <Text style={[Type.micro, { color: c.textTertiary }]}>
                {card.nextTierLabel.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${progress * 100}%`, backgroundColor: t.colors.accent },
                ]}
              />
            </View>
            <Text style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
              {`${toNext.toFixed(0)} FP to ${card.nextTierLabel} — ${startsToGo(toNext, card)}`}
            </Text>
          </View>
        )}

        {/* ---- standing --------------------------------------------------- */}
        <View style={styles.ranks}>
          <RankTile
            label={`AMONG ${card.playerName.toUpperCase()} CARDS`}
            rank={rank.amongPlayer}
            pool={rank.playerPool}
          />
          <RankTile
            label="AMONG EVERY CARD"
            rank={rank.overall}
            pool={rank.overallPool}
            hint={overallPct === null ? undefined : `top ${overallPct}%`}
          />
        </View>

        {/* The rule this whole screen is a receipt for, said once, plainly. */}
        <Text style={[Type.bodyRelaxed, { color: c.textTertiary }]}>
          A copy earns only in the weeks you start it. Benched weeks add nothing, which is why two
          people holding the same player can hold very different cards.
        </Text>
      </View>
    </Panel>
  );
}

/**
 * The distance to the next tier, in the unit the owner actually controls:
 * starts, not points.
 *
 * Returns a WHOLE clause rather than a fragment to interpolate after "about",
 * because the two branches do not take the same connective — "about 4 more
 * starts" reads, "about start it to find out" does not. A card with no starts
 * has no rate to project from, and dividing by zero starts is not "infinite
 * starts", it is "no answer yet".
 */
function startsToGo(toNext: number, card: CardIdentity): string {
  if (card.fpPerStart === null || card.fpPerStart <= 0) {
    return 'start it and it begins earning';
  }
  const starts = Math.ceil(toNext / card.fpPerStart);
  return `about ${starts} more start${starts === 1 ? '' : 's'} at this rate`;
}

function RankTile({
  label,
  rank,
  pool,
  hint,
}: {
  label: string;
  rank: number;
  pool: number;
  hint?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.rankTile, { backgroundColor: c.backgroundElement }]}>
      <Text numberOfLines={2} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[Type.page, NUMERIC, { color: c.text }]}>
        {`#${rank}`}
      </Text>
      {/* The pool is not optional garnish — see the note at the top. */}
      <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
        {`of ${pool.toLocaleString()}`}
        {hint ? ` · ${hint}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.two + 2, gap: Spacing.three },
  headline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headlineFigures: { flex: 1, minWidth: 0, gap: 1 },
  progressBlock: { gap: Spacing.one + 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  ranks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  rankTile: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 150,
    borderRadius: Radius.chip,
    padding: Spacing.two + 2,
    gap: 2,
  },
});
