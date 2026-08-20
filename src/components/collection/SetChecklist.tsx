/**
 * One set's checklist — every card in it, which slots you have filled, and
 * which ones you are holding a card for.
 *
 * Pure, for the same reason `SetsList` is: the route around it is behind the
 * auth gate and needs you to actually hold the right cards, so the states worth
 * reviewing (a filled slot, a fillable one, a set already claimed) are
 * otherwise unreachable for anyone looking at the layout. The route supplies
 * `set_checklist` and owns the confirm dialog; `/gallery` supplies fixtures.
 *
 * NOTHING BURNS UNTIL YOU SUBMIT. Tapping a row TICKS it; the batch is built up
 * and edited first, and only the submit button leads anywhere destructive. That
 * is the whole reason this is a selection rather than a row of ADD buttons —
 * autofill proposes a batch, you take two out and put a third in, and one
 * confirmation covers the lot instead of thirty.
 *
 * A mis-tap therefore costs nothing here. It is a tick, and the next tap undoes
 * it. The `destructive` confirmation lives on the route, once, at the end.
 *
 * WHICH COPY GETS BURNT IS NOT A CHOICE THE PLAYER MAKES, and that is a
 * deliberate protection rather than a missing feature: the server always takes
 * the least valuable copy you hold (see `commit_candidate`), so ticking a
 * player can cost you a bronze duplicate and can never cost you a gold. The row
 * prints the tier of the copy that would actually go, which is how the
 * guarantee is made visible rather than merely true.
 *
 * WHAT THE CHECKLIST IS FOR, WHICH IS NOT WHAT THE PROGRESS BAR IS FOR: the row
 * on the Sets page answers "how close am I". This answers "to what, and what
 * can I do about it now" — and for the position sets, whose membership is most
 * of a position, it doubles as a scouting list. Hence the ordering, which comes
 * off the server: filled slots first, then the ones you can fill, then the best
 * of the rest.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { PositionBadge } from '@/components/ui/PositionBadge';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  actionableOf,
  isAddable,
  planFor,
  progressOf,
  remainingOf,
  statusOf,
  type CardSet,
  type Milestone,
} from './sets';
import type { CardTier } from '@/constants/theme';

/** Exactly what `set_checklist` returns, one row per member card. */
export type SetMember = {
  card_id: string;
  player_id: string;
  player_name: string;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  season_fp: number | null;
  /** This slot is filled. Permanent — the card is in the set for good. */
  committed: boolean;
  /** Copies you still hold and could burn into the slot. 0 means you cannot. */
  held: number;
  /** Gems the commit would pay, from the copy that would actually be burnt. */
  commit_value: number;
  /** That copy's tier, so the row can say what it is about to destroy. */
  commit_tier: CardTier | null;
};

type Filter = 'ALL' | 'IN_SET' | 'CAN_ADD' | 'MISSING';

/**
 * Rows drawn before the "Show all" button appears. Comfortably more than any
 * team set contains (rosters are 27-33), so the button is only ever reached on
 * a position set — which is exactly the case it exists for.
 */
const HEAD = 60;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'IN_SET', label: 'In set' },
  { key: 'CAN_ADD', label: 'Can add' },
  { key: 'MISSING', label: 'Missing' },
];

export function SetChecklist({
  set,
  members,
  claiming,
  claimError,
  selected,
  submitting,
  onClaim,
  onToggle,
  onAutofill,
  onClear,
  onSubmit,
}: {
  /** Null until the set's own row is known — the members can arrive first. */
  set: CardSet | null;
  members: SetMember[];
  claiming: boolean;
  claimError: string | null;
  /** Card ids ticked for the next submission. Owned by the route. */
  selected: readonly string[];
  /** A submission is in flight; the list goes inert rather than half-live. */
  submitting: boolean;
  onClaim: () => void;
  onToggle: (member: SetMember) => void;
  onAutofill: () => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const [filter, setFilter] = useState<Filter>('ALL');
  /**
   * How many rows are drawn. See the "Show all" button below for why there is
   * a head at all — the short version is that a position set is up to 398
   * cards and the sheet owns its own scroll container.
   */
  const [limit, setLimit] = useState(HEAD);

  const counts = useMemo(() => {
    let inSet = 0;
    let canAdd = 0;
    for (const m of members) {
      if (m.committed) inSet += 1;
      else if (m.held > 0) canAdd += 1;
    }

    return { inSet, canAdd, missing: members.length - inSet - canAdd };
  }, [members]);

  const shown = useMemo(() => {
    if (filter === 'IN_SET') return members.filter((m) => m.committed);
    if (filter === 'CAN_ADD') return members.filter((m) => !m.committed && m.held > 0);
    if (filter === 'MISSING') return members.filter((m) => !m.committed && m.held === 0);

    return members;
  }, [members, filter]);

  const choose = (next: Filter) => {
    setFilter(next);
    setLimit(HEAD);
  };

  const chosen = useMemo(() => new Set(selected), [selected]);
  /* What the current selection adds up to, computed from the same rows on
     screen so the submit button's numbers and the ticks underneath it cannot
     disagree. */
  const plan = useMemo(() => planFor(members, selected), [members, selected]);

  const remaining = set ? remainingOf(set) : 0;
  /* The ceiling on the selection. The server refuses the commit that would take
     a set past its requirement, so a tick above this is a refusal in waiting —
     better to decline the tick and say why than to accept it and fail later. */
  const roomLeft = remaining - plan.cards;

  const status = set ? statusOf(set) : 'progress';
  /* Once the bar is met the server refuses further commits, so every add button
     has to go dark at the same moment — offering one would be offering an
     error, and worse, offering to burn a card for nothing. */
  const full = set ? remainingOf(set) === 0 : false;

  return (
    <>
      {set ? (
        <View style={styles.hero}>
          <Text style={[Type.page, { color: c.text }]}>{set.name}</Text>
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            {[set.subtitle, set.season].filter(Boolean).join(' · ')}
          </Text>

          <View style={styles.progressRow}>
            <Text style={[Type.page, NUMERIC, { color: c.text }]}>
              {`${Math.min(set.committed, set.required)}/${set.required}`}
            </Text>
            {/* The rule, stated in full, because this is the one screen with
                room for it: what completing means, that it pays along the way,
                and — the part a progress bar cannot say — that filling a slot
                costs the card. */}
            <Text style={[Type.body, styles.rule, { color: c.textSecondary }]}>
              {set.family === 'team'
                ? `A complete set is all ${set.totalCards} ${set.name} cards, and it pays at every quarter of the way. A card added to a set is gone from your collection for good.`
                : `Add ${set.required} of these ${set.totalCards} cards to complete the set, and it pays at every quarter of the way. A card added to a set is gone from your collection for good.`}
            </Text>
          </View>

          <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
            {actionableOf(set) > 0 ? (
              <View
                style={[
                  styles.fillBar,
                  styles.ghostBar,
                  {
                    width: `${Math.round(((set.committed + actionableOf(set)) / set.required) * 100)}%`,
                    backgroundColor: gold,
                  },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.fillBar,
                {
                  width: `${Math.round(progressOf(set) * 100)}%`,
                  backgroundColor:
                    status === 'claimed' ? c.textTertiary : status === 'ready' ? c.positive : gold,
                },
              ]}
            />
            {set.milestones
              .filter((m) => m.pct < 100)
              .map((m) => (
                <View
                  key={m.pct}
                  style={[styles.rung, { left: `${m.pct}%`, backgroundColor: c.background }]}
                />
              ))}
          </View>

          {/* THE LADDER ITSELF, which the list behind this sheet has no room
              for. It is the whole answer to "why would I keep going on a set I
              will never finish": four rungs, what each wants, what each pays,
              and which are behind you. */}
          <View style={[styles.ladder, { borderColor: c.border }]}>
            {set.milestones.map((m, i) => (
              <Rung key={m.pct} milestone={m} committed={set.committed} first={i === 0} />
            ))}
          </View>

          {/* The reward, in whichever of its three states this set is in.
              CLAIMING SWEEPS EVERY RUNG you have reached and not been paid for,
              which is why the button names a total rather than a milestone: a
              single commit can cross two rungs on a short ladder. */}
          {status === 'ready' ? (
            <Pressable
              onPress={onClaim}
              disabled={claiming}
              accessibilityRole="button"
              accessibilityLabel={`Claim ${set.claimableGems} gems for ${set.name}`}
              accessibilityState={{ disabled: claiming, busy: claiming }}
              style={({ pressed }) => [
                styles.claim,
                { backgroundColor: gold },
                claiming && styles.disabled,
                pressed && !claiming && styles.pressed,
              ]}>
              {claiming ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Gem color="#17130A" size={10} />
                  <Text style={[Type.strong, { color: '#17130A' }]}>
                    {`Claim ${set.claimableGems.toLocaleString()} gems`}
                  </Text>
                </>
              )}
            </Pressable>
          ) : status === 'claimed' ? (
            <View style={[styles.rewardRow, { borderColor: c.border }]}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>SET FINISHED</Text>
              <View style={styles.gemRow}>
                <Gem color={c.textTertiary} size={9} />
                <Text style={[Type.strong, NUMERIC, { color: c.textTertiary }]}>
                  {set.claimedGems.toLocaleString()}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.rewardRow, { borderColor: c.border }]}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>
                {(() => {
                  const gap = (set.nextAt ?? set.required) - set.committed;

                  return gap === 1 ? '1 MORE CARD PAYS' : `${gap} MORE CARDS PAY`;
                })()}
              </Text>
              <View style={styles.gemRow}>
                <Gem color={gold} size={9} />
                <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                  {(set.nextReward ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {claimError ? (
            <View style={[styles.notice, { borderColor: c.negative }]}>
              <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
              <Text style={[Type.body, { color: c.text }]}>{claimError}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.list}>
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              selected={filter === f.key}
              label={f.label}
              count={
                f.key === 'ALL'
                  ? members.length
                  : f.key === 'IN_SET'
                    ? counts.inSet
                    : f.key === 'CAN_ADD'
                      ? counts.canAdd
                      : counts.missing
              }
              onPress={() => choose(f.key)}
              accessibilityLabel={`${f.label} cards in this set`}
            />
          ))}
        </ChipRow>

        {/* AUTOFILL PROPOSES, THE TICKS DECIDE. The button seeds a selection
            from the rules in `autofillSelection` — bronze, duplicates first —
            and then gets out of the way: every row is a toggle, so taking two
            out and putting a different one in is two taps rather than a
            different screen. Nothing here is destructive; the submit bar is. */}
        {counts.canAdd > 0 ? (
          <View style={styles.pickRow}>
            {plan.cards > 0 ? (
              <>
                <Pressable
                  onPress={onSubmit}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={`Add the ${plan.cards} selected cards to the set, paying ${plan.gems} gems`}
                  accessibilityState={{ disabled: submitting, busy: submitting }}
                  style={({ pressed }) => [
                    styles.submit,
                    { backgroundColor: gold },
                    submitting && styles.disabled,
                    pressed && !submitting && styles.pressed,
                  ]}>
                  {submitting ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Text style={[Type.strong, { color: '#17130A' }]}>
                        {plan.cards === 1 ? 'Add 1 card' : `Add ${plan.cards} cards`}
                      </Text>
                      <View style={styles.gemRow}>
                        <Gem color="#17130A" size={9} />
                        <Text style={[Type.fine, NUMERIC, { color: '#17130A' }]}>{plan.gems}</Text>
                      </View>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={onClear}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the selection"
                  style={({ pressed }) => [
                    styles.secondary,
                    { borderColor: c.border },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[Type.strong, { color: c.textSecondary }]}>Clear</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={onAutofill}
                disabled={submitting || remaining === 0}
                accessibilityRole="button"
                accessibilityLabel="Select cards to add automatically"
                style={({ pressed }) => [
                  styles.autofill,
                  { borderColor: gold, backgroundColor: c.backgroundElement },
                  (submitting || remaining === 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Autofill</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {plan.cards > 0 ? (
          <Text style={[Type.fine, styles.pickNote, { color: c.textTertiary }]}>
            {roomLeft === 0
              ? `That fills every slot this set has left. Tap a card to swap it out.`
              : `Tap a card to add or remove it. ${roomLeft} more ${roomLeft === 1 ? 'slot' : 'slots'} free.`}
          </Text>
        ) : null}

        {shown.length === 0 ? (
          <Text style={[Type.body, styles.centredText, { color: c.textTertiary }]}>
            {filter === 'IN_SET'
              ? 'Nothing in this set yet.'
              : filter === 'CAN_ADD'
                ? 'None of your cards fit this set right now.'
                : 'You hold a card for every open slot.'}
          </Text>
        ) : (
          <>
            <View style={[styles.rows, { borderColor: c.border }]}>
              {shown.slice(0, limit).map((m, i) => (
                <MemberRow
                  key={m.card_id}
                  member={m}
                  divided={i > 0}
                  picked={chosen.has(m.card_id)}
                  // A row you cannot tick, and the two reasons are different:
                  // the set is full, or the selection already fills it. Either
                  // way the tick would be a refusal in waiting.
                  locked={submitting || full || (roomLeft === 0 && !chosen.has(m.card_id))}
                  onToggle={() => onToggle(m)}
                />
              ))}
            </View>

            {/* NAMED, NOT SILENT. A team set is ~30 cards and never reaches
                this; a position set is up to 398, and mapping all of them into
                a sheet's ScrollView costs a visible stall every time it opens.
                A FlatList is not the fix here — the frame owns the scroll
                container, and nesting a VirtualizedList inside a ScrollView is
                an error rather than an optimisation.

                So the head is drawn and the rest is one press away. The button
                states the real total, because a list that quietly stopped at 60
                would read as "this set has 60 cards" — and the number beside it
                is the whole point of the screen. */}
            {shown.length > limit ? (
              <Pressable
                onPress={() => setLimit(shown.length)}
                accessibilityRole="button"
                accessibilityLabel={`Show all ${shown.length} cards`}
                style={({ pressed }) => [
                  styles.more,
                  { backgroundColor: c.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>
                  {`Show all ${shown.length.toLocaleString()}`}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Text style={[Type.fine, styles.footer, { color: c.textTertiary }]}>
          {set
            ? `Adding a card burns it: it leaves your collection, cannot be started or sold again, and pays back ${set.commitPayoutPct}% of what it would have sold for. The set always takes your lowest-earning copy.${
                set.family === 'team'
                  ? ' Packs are drawn from the whole season pool, so a full roster is a long chase — the rewards along the way are the point of it.'
                  : ''
              }`
            : ''}
        </Text>
      </View>
    </>
  );
}

/**
 * One rung of the ladder: what it wants, what it pays, and where you are.
 *
 * Three states told apart by weight rather than by colour alone — collected
 * (a tick and the amount that actually landed), ready (full-strength, in the
 * positive tone), and ahead of you (secondary, with the gap stated). The gap
 * is the useful half: "6 more" on a rung is a thing you can act on this week,
 * where "25%" of a 32-card roster is arithmetic.
 */
function Rung({
  milestone,
  committed,
  first,
}: {
  milestone: Milestone;
  committed: number;
  first: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const gap = milestone.cards - committed;
  const tone = milestone.claimed
    ? c.textTertiary
    : milestone.reached
      ? c.positive
      : c.textSecondary;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${milestone.pct} per cent, ${milestone.cards} cards. ${
        milestone.claimed
          ? `Collected ${milestone.paid ?? milestone.gems} gems.`
          : milestone.reached
            ? `Ready to claim ${milestone.gems} gems.`
            : `${gap} more cards for ${milestone.gems} gems.`
      }`}
      style={[
        styles.rungRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
      ]}>
      <Text style={[Type.micro, styles.rungPct, { color: c.textTertiary }]}>
        {`${milestone.pct}%`}
      </Text>
      <Text style={[Type.body, NUMERIC, styles.rungCards, { color: tone }]}>
        {`${milestone.cards} cards`}
      </Text>
      <Text numberOfLines={1} style={[Type.fine, styles.rungState, { color: c.textTertiary }]}>
        {milestone.claimed ? 'collected' : milestone.reached ? 'ready' : `${gap} to go`}
      </Text>
      <View style={styles.gemRow}>
        <Gem color={milestone.claimed ? c.textTertiary : gold} size={8} />
        <Text style={[Type.fine, NUMERIC, { color: milestone.claimed ? c.textTertiary : c.text }]}>
          {(milestone.claimed ? (milestone.paid ?? milestone.gems) : milestone.gems).toLocaleString()}
        </Text>
      </View>
      <Text style={[Type.strong, styles.rungMark, { color: tone }]}>
        {milestone.claimed ? '✓' : milestone.reached ? '•' : '–'}
      </Text>
    </View>
  );
}

/**
 * One card on the checklist, in one of three states.
 *
 * They are told apart by WEIGHT and by CONTROL, never by colour alone: a filled
 * slot keeps full-strength text and carries a tick, a fillable one carries the
 * add button, and a missing one drops to secondary with a dash. All three
 * survive greyscale, which is the rule the tier chips and the filter chips
 * already follow.
 *
 * The row is not itself pressable. The obvious tap is "open the player", and
 * the honest answer for a card you do not own is a directory page — but the row
 * already carries a button that destroys something, and putting a second target
 * around it is how a mis-tap becomes a burnt card. The Players boards are one
 * tab away.
 */
function MemberRow({
  member,
  divided,
  picked,
  locked,
  onToggle,
}: {
  member: SetMember;
  divided: boolean;
  picked: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const addable = isAddable(member);
  const fp = member.season_fp === null ? null : Number(member.season_fp);

  const state = member.committed
    ? 'In this set'
    : addable
      ? `${member.held} held${picked ? ', selected' : ''}`
      : 'Missing';

  const body = (
    <>
      <PositionBadge label={member.position_abbreviation} size={22} />

      <View style={styles.memberName}>
        <Text
          numberOfLines={1}
          style={[Type.strong, { color: member.committed || addable ? c.text : c.textSecondary }]}>
          {member.player_name}
        </Text>
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {member.team_abbreviation ?? '—'}
          {fp !== null && fp > 0 ? ` · ${fp.toFixed(1)} FP` : ''}
          {/* Duplicates, and only above one: "×1" is noise, "×3" is what says
              you can spare one of these without giving anything up. */}
          {addable && member.held > 1 ? ` · ×${member.held}` : ''}
          {/* The tier of the copy that would actually go. It only earns its
              place when it is worth more than the floor — every bronze row
              saying "bronze" would be a column of the same word. */}
          {addable && member.commit_tier && member.commit_tier !== 'bronze'
            ? ` · ${member.commit_tier}`
            : ''}
        </Text>
      </View>

      {member.committed ? (
        <View style={styles.tag}>
          <Text style={[Type.label, { color: c.positive }]}>IN SET</Text>
        </View>
      ) : addable ? (
        /* A TICK, NOT A BUTTON — it is a View inside the row's own Pressable.
           Nesting a pressable here would render a <button> inside a <button>
           on web, which React rejects at runtime; the same trap PlayerSheetFrame
           and ConfirmDialog both document. */
        <View
          style={[
            styles.tick,
            picked
              ? { backgroundColor: gold, borderColor: gold }
              : { borderColor: c.borderStrong },
          ]}>
          {picked ? (
            <Text style={[Type.label, { color: '#17130A' }]}>✓</Text>
          ) : (
            <View style={styles.gemRow}>
              <Gem color={c.textTertiary} size={8} />
              <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
                {member.commit_value}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={[Type.strong, styles.mark, { color: c.textTertiary }]}>–</Text>
      )}
    </>
  );

  /* Only an addable row is a target. A committed one has nothing to do and a
     missing one has nothing to do it with, so making either pressable would be
     offering a gesture that does nothing. */
  if (!addable) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${member.player_name}, ${
          member.position_abbreviation ?? 'no position'
        }, ${member.team_abbreviation ?? 'no club'}. ${state}.`}
        style={[
          styles.member,
          divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
          !member.committed && styles.faded,
        ]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      disabled={locked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled: locked }}
      accessibilityLabel={`${member.player_name}, ${
        member.position_abbreviation ?? 'no position'
      }, ${member.team_abbreviation ?? 'no club'}. ${state}. Adding burns your ${
        member.commit_tier ?? 'lowest'
      } copy for ${member.commit_value} gems.`}
      style={({ pressed }) => [
        styles.member,
        divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        picked && { backgroundColor: c.backgroundElement },
        locked && styles.disabled,
        pressed && !locked && styles.pressed,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rule: { flex: 1, minWidth: 0 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 3 },
  ghostBar: { position: 'absolute', left: 0, top: 0, opacity: 0.28 },
  rung: { position: 'absolute', top: 0, width: 2, height: 6 },

  ladder: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.chip, overflow: 'hidden' },
  rungRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 3,
  },
  /* Fixed columns, so four rungs read as a table rather than as four sentences
     of different lengths. 36 rather than 30 because "100%" wrapped to two lines
     at the narrower width and dragged the whole row taller than the other
     three — measured, not guessed. */
  rungPct: { width: 36 },
  rungCards: { width: 68 },
  rungState: { flex: 1, minWidth: 0 },
  rungMark: { width: 14, textAlign: 'center' },

  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
  },
  gemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two + 3,
    minHeight: 40,
  },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    padding: Spacing.two + 2,
    gap: Spacing.half,
  },

  list: { gap: Spacing.two, paddingTop: Spacing.three },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Filled once something is selected, because at that point it IS the page's
     next action. Autofill is outlined: it proposes, and proposing should not
     shout louder than the claim button above it. */
  submit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two + 1,
    minHeight: 38,
  },
  autofill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two + 1,
    minHeight: 38,
  },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    minHeight: 38,
  },
  pickNote: { paddingHorizontal: Spacing.one },
  rows: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
  },
  faded: { opacity: 0.75 },
  memberName: { flex: 1, minWidth: 0, gap: 1 },
  mark: { width: 56, textAlign: 'center' },
  tag: { width: 56, alignItems: 'flex-end' },
  /* Unticked it shows what the card would pay, which is the number worth
     scanning down the column; ticked it is a solid mark, because at that point
     the amount is in the submit button's total instead. */
  tick: {
    width: 56,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingVertical: 3,
  },
  more: {
    alignSelf: 'flex-start',
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  footer: { paddingTop: Spacing.one, maxWidth: 560 },
  centredText: { textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
