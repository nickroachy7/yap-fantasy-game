/**
 * The Sets page, minus the network.
 *
 * Split out of `SetsPanel` for the reason `/gallery` exists at all: every
 * product screen is behind the auth gate and fetches from Supabase directly,
 * so the only way to LOOK at this list was to sign in and own the right cards
 * — which puts the three states that matter most (a set ready to claim, a set
 * already claimed, a set at zero) out of reach of anyone reviewing the layout,
 * including the person who wrote it. A pure component takes rows and renders
 * them; the gallery hands it fixtures, the panel hands it `my_sets`.
 *
 * It owns no state and does no arithmetic beyond drawing: `complete` comes off
 * the server, and the ordering comes from `groupSets`. See `sets.ts`.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Coin } from '@/components/shell/AppHeader';

import { Icon } from '@/components/icons/Icon';
import { setDaily, setPosition, setTeam, setWeekly } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { RowCard } from '@/components/ui/RowCard';
import { SectionHead } from '@/components/ui/SectionHead';
import {
  actionableOf,
  groupSets,
  progressOf,
  statusOf,
  type CardSet,
  type SetFamily,
} from './sets';

export function SetsList({
  sets,
  claimingCode,
  onOpenSet,
  onClaim,
}: {
  sets: CardSet[];
  /** The set whose claim is in flight, or null. Blocks every claim button. */
  claimingCode: string | null;
  onOpenSet: (code: string) => void;
  onClaim: (set: CardSet) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const sections = groupSets(sets);

  return (
    <>
      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          {/* THE SAME HEAD THE CONTESTS AND COLLECTION BOARDS USE — a name on
              the left, a count on the right. The group's note used to sit under
              the title: "Three of one position, out of whatever you are
              holding. Gone at midnight." Three of those down one scroll is the
              same prose the lobby just shed, and the rule it states is on the
              set's own page, which is one tap from every row it describes. */}
          <SectionHead
            label={section.title}
            hint={`${section.sets.length} set${section.sets.length === 1 ? '' : 's'}`}
            hintLabel={`${section.sets.length} sets`}
            tone={c.textTertiary}
          />
          {/* A STACK OF CARDS, NOT A DIVIDED TABLE. This was one bordered box
              per group with hairlines between the rows inside it, which says
              the rows are parts of one thing. A set is not part of the set
              above it — it is a separate errand with its own progress and its
              own reward — and the contests page had already settled the shape
              that says so. `RowCard` is that shell, shared. */}
          <View style={styles.stack}>
            {section.sets.map((set) => (
              <SetRow
                key={set.code}
                set={set}
                busy={claimingCode === set.code}
                // Any claim in flight blocks every claim button: the balance is
                // about to change and the list is about to be re-read, so a
                // second press would act on a stale row.
                locked={claimingCode !== null}
                onOpen={() => onOpenSet(set.code)}
                onClaim={() => onClaim(set)}
              />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

/**
 * The page's own summary, in the SAME STRIP the inventory draws — literally the
 * same component, not the same design copied.
 *
 * It was a copy for a while, and the copy is why this note exists: the frame
 * weight, the divider, the label-over-figure cell and the coin slot were written
 * out again here, so when the inventory's strip learned weighted columns and a
 * label that can be a component, this one silently did not. Two tabs of one
 * section had visibly different objects in the same position. `SummaryStrip`
 * owns all of that now and this function is only the four numbers.
 *
 * FOUR CELLS, ALWAYS THE SAME FOUR: a strip whose columns appear and vanish
 * would make the two numbers that matter — slots you can fill, coins you can
 * claim — move around the page between visits. A zero is worth its cell here,
 * because "0 ready" is an answer to the question this screen exists to ask.
 * The inventory's strip is fixed at six for the same reason.
 *
 * TO FILL counts SLOTS, not cards, and the label says so. One duplicate can be
 * the open slot in two different sets, so the number of actions available is
 * genuinely larger than the number of cards they would cost.
 *
 * EQUAL WIDTHS, unlike the inventory's. Weighting is there for a cell that
 * holds five figures beside a coin; the widest thing here is a four-figure coin
 * total in a cell whose label is "CLAIMED", so an even split has room and the
 * default is the honest choice.
 */




/**
 * Set family to glyph. `SetFamily` is a closed union, so this record is total:
 * adding a fifth family fails to compile here rather than rendering nothing.
 */
const FAMILY_GLYPHS: Record<SetFamily, Glyph> = {
  daily: setDaily,
  weekly: setWeekly,
  position: setPosition,
  team: setTeam,
};

/**
 * One set.
 *
 * The row is a TARGET, not a container of controls — pressing anywhere opens
 * the checklist — with one exception: a claimable set carries a button, and a
 * button inside a pressable row is a real hazard on web (a <button> inside a
 * <button> is rejected at runtime, the same trap `PlayerSheetFrame`,
 * `SwapSheet` and `ConfirmDialog` all had to fix). So the row is a Pressable
 * and the claim button is its SIBLING, laid beside it in a flex row.
 */
function SetRow({
  set,
  busy,
  locked,
  onOpen,
  onClaim,
}: {
  set: CardSet;
  busy: boolean;
  locked: boolean;
  onOpen: () => void;
  onClaim: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const status = statusOf(set);
  const progress = progressOf(set);
  /* Committed slots, capped at the bar. The server refuses a commit past the
     requirement, so this cannot exceed it — the clamp is against a stale row
     rather than an expected state. */
  const counted = Math.min(set.committed, set.required);
  /* Cards you hold that could go in today. The whole reason the row is worth
     pressing, and without it thirty-two team sets at 0/32 are indistinguishable
     from each other. */
  const actionable = actionableOf(set);

  const tone =
    status === 'claimed' ? c.textTertiary : status === 'ready' ? c.positive : c.textSecondary;

  return (
    <RowCard style={styles.row}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${set.name}. ${counted} of ${set.required} slots filled. ${
          status === 'claimed'
            ? `Finished, ${set.claimedCoins} coins collected.`
            : status === 'ready'
              ? `${set.claimableCoins} coins ready to claim.`
              : set.nextAt !== null
                ? `Next reward at ${set.nextAt} cards, worth ${set.nextReward} coins.`
                : ''
        }${actionable > 0 ? ` You hold cards for ${actionable} more slots.` : ''}`}
        style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}>
        <View style={styles.rowHead}>
          {/* Keyed off `card_sets.family`, which is a four-value enum in the
              database and in `SetFamily` — so the map is total and a new
              family would be a type error here rather than a blank row. */}
          <Icon
            glyph={FAMILY_GLYPHS[set.family]}
            color={actionable > 0 ? c.positive : c.textTertiary}
            size={22}
            focused
          />
          <View style={styles.rowTitle}>
            <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
              {set.name}
            </Text>
            {/* The subtitle line does double duty, and the actionable half
                wins it: a division never changes and "2 ready to add" is the
                only thing on this row a player can act on this minute. The
                division is still one tap away on the checklist. */}
            {actionable > 0 ? (
              <Text numberOfLines={1} style={[Type.fine, { color: c.positive }]}>
                {actionable === 1 ? '1 card ready to add' : `${actionable} cards ready to add`}
              </Text>
            ) : set.subtitle ? (
              <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                {set.subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.rowCount}>
            <Text style={[Type.strong, NUMERIC, { color: tone }]}>
              {`${counted}/${set.required}`}
            </Text>
            {/* WHERE THE NEXT PAYOUT IS, not the size of the set. A team set's
                requirement IS its membership, so "of 32" beside "3/32" said the
                same number twice; the rung in front of you is the thing the
                figure above cannot say. */}
            <Text style={[Type.micro, NUMERIC, { color: c.textTertiary }]}>
              {set.nextAt === null ? 'COMPLETE' : `NEXT AT ${set.nextAt}`}
            </Text>
          </View>
        </View>

        {/* THREE LAYERS, and the ticks are what make a team set legible at all.
            A club's whole roster is the requirement, so the fill sits at 9% for
            most of a season and a bare bar says nothing; the rung marks give it
            somewhere to be going. Under them: how far your held cards could
            push it today (the ghost), then what is actually filled.

            The ghost is drawn UNDER the fill as a single wider bar rather than
            beside it, so a rounding difference between two percentages cannot
            leave a hairline gap between them. */}
        <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
          {actionable > 0 ? (
            <View
              style={[
                styles.fillBar,
                styles.ghostBar,
                {
                  width: `${Math.round(((set.committed + actionable) / set.required) * 100)}%`,
                  backgroundColor: gold,
                },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.fillBar,
              {
                // A percentage rather than a measured width: the track is the
                // full width of a row whose width nothing here knows.
                width: `${Math.round(progress * 100)}%`,
                backgroundColor:
                  status === 'claimed' ? c.textTertiary : status === 'ready' ? c.positive : gold,
              },
            ]}
          />
          {/* 100% is the end of the track and needs no mark of its own. */}
          {set.milestones
            .filter((m) => m.pct < 100)
            .map((m) => (
              <View
                key={m.pct}
                style={[styles.rung, { left: `${m.pct}%`, backgroundColor: c.background }]}
              />
            ))}
        </View>
      </Pressable>

      <View style={styles.rowAction}>
        {status === 'ready' ? (
          <Pressable
            onPress={onClaim}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={`Claim ${set.claimableCoins} coins for ${set.name}`}
            accessibilityState={{ disabled: locked, busy }}
            style={({ pressed }) => [
              styles.claim,
              { backgroundColor: gold },
              locked && styles.disabled,
              pressed && !locked && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator />
            ) : (
              <>
                <Coin color="#17130A" size={9} />
                <Text style={[Type.strong, { color: '#17130A' }]}>
                  {set.claimableCoins.toLocaleString()}
                </Text>
              </>
            )}
          </Pressable>
        ) : status === 'claimed' ? (
          <View style={styles.claimedTag}>
            <Text style={[Type.label, { color: c.textTertiary }]}>FINISHED</Text>
            <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
              {`+${set.claimedCoins.toLocaleString()}`}
            </Text>
          </View>
        ) : (
          /* THE NEXT RUNG's price, not the whole ladder's. A team ladder totals
             7,100 coins and almost none of it is reachable this season; printing
             the total beside a bar at 9% would be advertising a number nobody
             gets. What is one rung away is the true and useful one.
             Hidden from the reader: the row's own label already says it. */
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.reward}>
            <Coin color={c.textTertiary} size={8} />
            <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
              {(set.nextReward ?? 0).toLocaleString()}
            </Text>
          </View>
        )}
      </View>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  /* The inventory's strip, verbatim in construction: 1.5pt of borderStrong
     outside, hairline dividers within, no fill. Two summaries in one section
     that framed themselves differently is what this is written to prevent. */
  section: { gap: Spacing.two },
  /* The gap between cards. It was `rows` — one bordered box with hairlines
     inside it — and the border moved onto each card, so what is left here is
     the air between them. See the note at the render. */
  stack: { gap: Spacing.one + 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.two + 2,
  },
  /* `minWidth: 0` so a long club name ellipsises instead of pushing the claim
     button off the row. */
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one + 2,
    paddingLeft: Spacing.two + 2,
    paddingVertical: Spacing.two + 2,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rowTitle: { flex: 1, minWidth: 0, gap: 1 },
  rowCount: { alignItems: 'flex-end', gap: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: 4, borderRadius: 2 },
  /* Laid behind the fill, not beside it. Faint enough to read as "could be"
     rather than as a second value. */
  ghostBar: { position: 'absolute', left: 0, top: 0, opacity: 0.28 },
  /* A notch in the track rather than a line over it: painted in the page's own
     background so it cuts the bar wherever the fill has reached, and needs no
     second colour that would have to work over three different fills. */
  rung: { position: 'absolute', top: 0, width: 2, height: 4 },

  /* Fixed, so the bars above stop at the same place down the whole list — a
     ragged right edge on a column of progress tracks reads as noise. */
  rowAction: { width: 96, alignItems: 'flex-end' },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + 2,
    minWidth: 76,
    minHeight: 34,
  },
  claimAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 38,
    marginTop: Spacing.two,
  },
  claimedTag: { alignItems: 'flex-end', gap: 1 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },

  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
});
