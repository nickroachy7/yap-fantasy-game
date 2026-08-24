/**
 * The recap, as pure presentation.
 *
 * SPLIT OUT OF THE SCREEN so that `gallery` can draw it. Every other surface in
 * this app is checkable against fixtures on a route that needs no session; the
 * recap is a root route inside the auth gate, so without this it would be the
 * one screen nobody could look at without signing in — and it is the screen
 * whose whole job is how it reads.
 *
 * It takes a fully-parsed `Recap` and does no loading, no RPC and no error
 * handling. The only decisions here are visual ones.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TierMark } from '@/components/cards/TierMark';
import { finishLabel, multiplierText, type Recap, type RecapCard } from '@/components/recap/recap';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RecapBody({ recap }: { recap: Recap }) {
  const router = useRouter();

  return (
    <>
      <Header recap={recap} />

      <Panel title="Your players" hint={recap.scored ? undefined : 'Still being scored'}>
        {recap.cards.map((card) => (
          <CardRow
            key={card.cardInstanceId}
            card={card}
            onPress={() => router.push(`/card/${card.cardInstanceId}`)}
          />
        ))}
      </Panel>

      {recap.closestSets.length > 0 ? (
        <Panel title="Closest sets" hint="Cards you hold right now">
          {recap.closestSets.map((s) => (
            <SetRow key={s.code} set={s} onPress={() => router.push(`/set/${s.code}`)} />
          ))}
        </Panel>
      ) : null}

      {recap.roster ? <RosterLine recap={recap} /> : null}
    </>
  );
}

/** A rung the reader could finish today, and what finishing it pays. */
function SetRow({
  set,
  onPress,
}: {
  set: Recap['closestSets'][number];
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.setRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.grow}>
        <Text style={[Type.strong, { color: c.text }]} numberOfLines={1}>
          {set.name}
        </Text>
        <Text style={[Type.fine, { color: c.textSecondary }]}>
          {set.committed} of {set.nextAt} —{' '}
          {set.readyNow > 0 ? `${set.readyNow} ready to commit` : 'nothing ready yet'}
        </Text>
      </View>
      <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
        {set.nextReward.toLocaleString()}
      </Text>
    </Pressable>
  );
}

/** Points, placing and the two halves of the payout. */
function Header({ recap }: { recap: Recap }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const total = recap.gemsPoints + recap.gemsBonus;
  return (
    <View style={[styles.header, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
      <View style={styles.headerCell}>
        <Text style={[Type.label, { color: c.textTertiary }]}>POINTS</Text>
        <Text style={[Type.page, NUMERIC, { color: c.text }]}>
          {recap.totalPoints.toFixed(1)}
        </Text>
        {recap.rank && recap.of ? (
          <Text style={[Type.fine, { color: c.textSecondary }]}>
            {recap.rank} of {recap.of}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerDivider, { backgroundColor: c.border }]} />
      <View style={styles.headerCell}>
        <Text style={[Type.label, { color: c.textTertiary }]}>GEMS</Text>
        <Text style={[Type.page, NUMERIC, { color: c.text }]}>{total.toLocaleString()}</Text>
        {/* Split out only when there is a bonus: "+0 bonus" is noise. */}
        <Text style={[Type.fine, { color: c.textSecondary }]}>
          {recap.gemsBonus > 0
            ? `${recap.gemsPoints} points · ${recap.gemsBonus} bonus`
            : recap.scored && total === 0
              ? 'not paid yet'
              : 'from points'}
        </Text>
      </View>
    </View>
  );
}

/**
 * One player. The gem column is deliberately the only bold figure on the right:
 * points are why it was earned, gems are what the row is FOR.
 */
function CardRow({ card, onPress }: { card: RecapCard; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const mult = multiplierText(card.gemMultiplier);
  const finish = finishLabel(card.positionRank, card.position);
  const paid = (card.gems ?? 0) + (card.bonusGems ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.rowTop}>
        <Text style={[Type.label, styles.slot, { color: c.textTertiary }]}>{card.slot}</Text>
        <TierMark tier={card.tierAtAward ?? card.tierNow} />
        <View style={styles.grow}>
          <Text style={[Type.strong, { color: c.text }]} numberOfLines={1}>
            {card.playerName}
          </Text>
          <Text style={[Type.fine, { color: c.textSecondary }]}>
            {[card.team, card.position].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={[Type.body, NUMERIC, styles.points, { color: c.textSecondary }]}>
          {card.points.toFixed(1)}
        </Text>
        <View style={styles.gems}>
          {card.awarded ? (
            <>
              <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{paid}</Text>
              {mult ? (
                <Text style={[Type.micro, NUMERIC, { color: c.textTertiary }]}>
                  {mult}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[Type.fine, { color: c.textTertiary }]}>—</Text>
          )}
        </View>
      </View>

      {/* The two things that make a row worth reading twice. Both are rare, so
          neither reserves space when it is absent. */}
      {finish && (card.bonusGems ?? 0) > 0 ? (
        <Text style={[Type.fine, styles.note, { color: c.positive }]}>
          {card.wasWeekMvp ? '★ Week MVP · ' : ''}
          {finish} +{card.bonusGems}
        </Text>
      ) : null}
      {card.promoted ? (
        <Text style={[Type.fine, styles.note, { color: c.warning }]}>
          ⬆ {card.careerFp.toFixed(0)} career FP — promoted to {card.tierNow.toUpperCase()}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Where the roster stands against the cap. Three states, because they need
 * three different amounts of a player's attention: over (lineups are blocked
 * and that has to be said outright), near (a heads-up), and fine (a quiet
 * count, so the number is familiar before it ever matters).
 */
function RosterLine({ recap }: { recap: Recap }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const r = recap.roster!;
  const tone = r.isOver ? c.negative : r.isNear ? c.warning : c.textSecondary;

  return (
    <Pressable
      onPress={() => router.push('/(app)/(tabs)/fantasy/collection')}
      style={({ pressed }) => [
        styles.roster,
        { backgroundColor: c.surface, borderColor: r.isOver ? c.negative : c.borderStrong },
        pressed && { opacity: 0.6 },
      ]}>
      <View style={styles.grow}>
        <Text style={[Type.label, { color: c.textTertiary }]}>ROSTER</Text>
        <Text style={[Type.strong, { color: tone }]}>
          {r.isOver
            ? `${r.overBy} over the limit — lineups are locked`
            : r.isNear
              ? `${r.remaining} slots left`
              : `${r.held} of ${r.cap} cards`}
        </Text>
        {r.isOver ? (
          <Text style={[Type.fine, { color: c.textSecondary }]}>
            Commit {r.overBy} to a set or sell them to set your lineup again.
          </Text>
        ) : null}
      </View>
      <Text style={[Type.figure, NUMERIC, { color: tone }]}>
        {r.held}/{r.cap}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.three,
  },
  headerCell: { flex: 1, alignItems: 'center', gap: Spacing.half },
  headerDivider: { width: StyleSheet.hairlineWidth },
  row: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  slot: { width: 34 },
  points: { width: 44, textAlign: 'right' },
  gems: { width: 56, alignItems: 'flex-end' },
  // Indented past the slot label and tier mark so a note reads as belonging to
  // the row above rather than as a new one.
  note: { marginTop: Spacing.half, marginLeft: 34 + Spacing.two },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  roster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
});
