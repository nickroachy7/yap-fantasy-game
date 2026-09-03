/**
 * The contest builder: eight decisions, one preview, one button.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS ONE SCROLL AND NOT A WIZARD
 * ---------------------------------------------------------------------------
 *
 * The obvious shape for eight controls is a stepper — name, then roster, then
 * stakes, then invites — and it is wrong here for a specific reason: the
 * decisions are COUPLED. The legal fee depends on how many slots you built. The
 * legal `top N` depends on how many seats the room has. A wizard hides the
 * control that has just invalidated the one you are looking at, and the only
 * way it can tell you is to send you back a page.
 *
 * On one scroll the fee row re-reads "90–119 coins" the moment a seventh slot
 * lands, and the reader sees the rule as a relationship rather than as a
 * rejection. Everything that constrains something else is above the thing it
 * constrains.
 *
 * ---------------------------------------------------------------------------
 * THE PREVIEW IS THE REAL CONTEST CARD
 * ---------------------------------------------------------------------------
 *
 * `ContestCard` draws every row in the lobby, and the preview at the bottom of
 * this screen is that same component fed a `ContestTerms` assembled from the
 * draft. Not a mock-up of one: the same component, so the thing a player is
 * agreeing to build is drawn by the code that will draw it afterwards.
 *
 * That is also what makes the terms honest without this file writing a single
 * sentence about them. `winLine`, `fillLine` and `topPrize` in `contest-model`
 * are where "top 3 win, paid steeply" is worded, and they are worded once.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REFUSED HERE IS REFUSED IN THE SAME WORDS THE SERVER USES
 * ---------------------------------------------------------------------------
 *
 * `draftProblems` re-implements the server's validation — see the header on
 * `friendly.ts` for why that duplication is deliberate — and this screen shows
 * its output verbatim above the button, with the button disabled while any
 * remain. A player should never press a build button that is going to fail.
 *
 * The build can still fail: the week can turn over, the fifth contest can
 * already exist, a friendship can end mid-sheet. That error is shown in the
 * same place, in the server's own words.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { StatusChip } from '@/components/ui/StatusChip';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { BackRow } from './ContestRecapPanel';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer } from '@/context/PlayerContext';
import { useFriends } from '@/components/friends/use-friends';
import type { PayoutCurve, WinCondition } from './contest-model';
import { fillLine, winLine } from './contest-model';
import {
  createFriendly,
  draftProblems,
  feeRange,
  MAX_ENTRANTS,
  MAX_SLOTS,
  MIN_ENTRANTS,
  POSITIONS,
  PRIZE_POOL_BPS,
  shapeName,
  suggestedFee,
  type ContestDraft,
  type DraftSlot,
  type SlotPosition,
} from './friendly';

/**
 * The shapes the game already runs, offered as starting points.
 *
 * NOT A SHORTCUT — A VOCABULARY. A blank slot list is a hard first move: a
 * player who has never thought about roster construction does not know that
 * three flex slots is a format, and the empty state cannot teach them. These
 * are the lobby's own shapes, so the first contest somebody builds is one they
 * have already played, and every one of them is EDITABLE once loaded.
 *
 * They are also exactly the shapes `create_friendly_contest` deduplicates onto
 * the seeded format rows — build "Flex Three" unchanged and the contest says
 * "Flex Three", not "3×FLEX". That is not special-cased anywhere; it falls out
 * of the slot names and eligibility matching.
 */
const FLEX: SlotPosition[] = ['RB', 'WR', 'TE'];
const PRESETS: { label: string; slots: DraftSlot[] }[] = [
  {
    label: 'Flex Three',
    slots: [
      { slot: 'FLEX1', positions: FLEX },
      { slot: 'FLEX2', positions: FLEX },
      { slot: 'FLEX3', positions: FLEX },
    ],
  },
  {
    label: 'WR Room',
    slots: [
      { slot: 'WR1', positions: ['WR'] },
      { slot: 'WR2', positions: ['WR'] },
      { slot: 'WR3', positions: ['WR'] },
    ],
  },
  {
    label: 'Superflex',
    slots: [
      { slot: 'QB', positions: ['QB'] },
      { slot: 'FLEX', positions: FLEX },
      { slot: 'SFLEX', positions: ['QB', 'RB', 'WR', 'TE'] },
    ],
  },
  {
    label: 'Full Squad',
    slots: [
      { slot: 'QB', positions: ['QB'] },
      { slot: 'RB1', positions: ['RB'] },
      { slot: 'RB2', positions: ['RB'] },
      { slot: 'WR1', positions: ['WR'] },
      { slot: 'WR2', positions: ['WR'] },
      { slot: 'TE', positions: ['TE'] },
      { slot: 'FLEX', positions: FLEX },
    ],
  },
];

const CONDITIONS: { value: WinCondition; label: string; blurb: string }[] = [
  { value: 'median', label: 'Beat the median', blurb: 'Even money. Everyone above the middle of the field splits the pool.' },
  { value: 'top_n', label: 'Top places', blurb: 'Only the first few finishers win. Most of the room goes home.' },
  { value: 'top_pct', label: 'Top share', blurb: 'A percentage of the field wins, so the places scale with how many enter.' },
  { value: 'target', label: 'Beat a score', blurb: 'No field needed — it settles even if you are the only one who files.' },
];

const CURVES: { value: PayoutCurve; label: string; blurb: string }[] = [
  { value: 'flat', label: 'Even split', blurb: 'Every winner takes the same. Squeaking in pays what running away with it pays.' },
  { value: 'linear', label: 'Sliding', blurb: 'A gentle ladder — first takes more than last, but everybody who won is paid.' },
  { value: 'steep', label: 'Steep', blurb: 'First takes most of it. Second takes half of that, and so on down.' },
  { value: 'winner_take_all', label: 'Winner takes all', blurb: 'One prize, one winner, nothing for anybody else.' },
];

const emptyDraft = (): ContestDraft => ({
  name: '',
  slots: PRESETS[0].slots.map((s) => ({ ...s, positions: [...s.positions] })),
  entryFee: suggestedFee(3),
  maxEntrants: 8,
  winCondition: 'median',
  winRank: null,
  winPct: null,
  targetPoints: null,
  payoutCurve: 'flat',
  invite: [],
});

export function CreateContestView({
  backLabel,
  onBack,
  onClose,
  dismissible,
  onBuilt,
}: {
  backLabel?: string;
  onBack: () => void;
  onClose: () => void;
  dismissible?: boolean;
  /** Where to go once it exists: the contest's own page. */
  onBuilt: (code: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { coins } = usePlayer();
  const { friends } = useFriends();

  const [d, setD] = useState<ContestDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const set = <K extends keyof ContestDraft>(k: K, v: ContestDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const band = feeRange(d.slots.length || 1);
  const problems = useMemo(() => draftProblems(d), [d]);
  const ready = problems.length === 0 && !busy;

  /**
   * THE DRAFT, AS TERMS. Fed to the same `winLine` / `fillLine` the lobby uses,
   * so the preview cannot word a rule differently from the row it becomes.
   *
   * `prizePool` is 0 and that is the truth rather than a placeholder: a contest
   * nobody has entered has collected nothing, and the pool is 90% of fees taken
   * — never a grant. See `20260901020000`.
   */
  const terms = useMemo(
    () => ({
      formatName: shapeName(d.slots),
      slotCount: d.slots.length,
      entryFeeCoins: d.entryFee,
      heartsAtRisk: 0,
      heartsOnWin: 0,
      winCondition: d.winCondition,
      winRank: d.winRank,
      winPct: d.winPct,
      targetPoints: d.targetPoints,
      payoutCurve: d.payoutCurve,
      scoreRate: 0,
      prizePool: 0,
      podiumCoins: 0,
      entrants: 0,
      maxEntrants: d.maxEntrants,
    }),
    [d],
  );

  /** What the pool holds if the room fills. The number people actually ask. */
  const fullPool = Math.floor((d.entryFee * d.maxEntrants * PRIZE_POOL_BPS) / 10000);

  const build = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const built = await createFriendly(d);
      onBuilt(built.code);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not build the contest.');
      setBusy(false);
    }
  };

  const toggleInvite = (userId: string) =>
    setD((prev) => ({
      ...prev,
      invite: prev.invite.includes(userId)
        ? prev.invite.filter((u) => u !== userId)
        : [...prev.invite, userId],
    }));

  const setSlots = (slots: DraftSlot[]) =>
    setD((prev) => {
      /* THE FEE FOLLOWS THE ROSTER, and it has to. The band is a function of
         the slot count, so a seventh slot can put a fee that was legal a moment
         ago outside it — and a builder that silently went invalid on a control
         the reader did not touch is a builder that feels broken. Clamped rather
         than reset: a deliberate 95 stays 95 while 95 is still legal. */
      const { min, max } = feeRange(Math.max(1, slots.length));
      return { ...prev, slots, entryFee: Math.min(max, Math.max(min, prev.entryFee)) };
    });

  return (
    <PlayerSheetFrame
      title="Build a contest"
      subtitle="Your own terms, your own guest list"
      onClose={onClose}
      closeLabel="Close the contest builder"
      dismissible={dismissible}>
      <View style={styles.page}>
        {/* The way back, as a CHILD rather than a frame prop — every view on
            this sheet renders its own, because a frame cannot know whether
            there is anything underneath it. See `ContestSheet`. */}
        {backLabel ? <BackRow label={backLabel} onPress={onBack} /> : null}
        {/* ------------------------------------------------------- name */}
        <Field
          label="Name"
          hint="What the invitation will call it.">
          <View style={[styles.input, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <TextInput
              value={d.name}
              onChangeText={(v) => set('name', v)}
              placeholder="Sunday Six"
              placeholderTextColor={c.textTertiary}
              maxLength={40}
              accessibilityLabel="Contest name"
              style={[Type.body, styles.inputText, { color: c.text }]}
            />
          </View>
        </Field>

        {/* ----------------------------------------------------- roster */}
        <Field
          label="Roster"
          hint={`${d.slots.length} card${d.slots.length === 1 ? '' : 's'} — ${shapeName(d.slots) || 'nothing yet'}`}>
          <View style={styles.chipWrap}>
            {PRESETS.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                accessibilityLabel={`Use the ${p.label} shape`}
                selected={sameShape(d.slots, p.slots)}
                onPress={() => setSlots(p.slots.map((s) => ({ ...s, positions: [...s.positions] })))}
              />
            ))}
          </View>

          <View style={styles.stack}>
            {d.slots.map((s, i) => (
              <SlotRow
                key={i}
                slot={s}
                onRename={(name) =>
                  setSlots(d.slots.map((x, j) => (j === i ? { ...x, slot: name } : x)))
                }
                onToggle={(pos) =>
                  setSlots(
                    d.slots.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            positions: x.positions.includes(pos)
                              ? x.positions.filter((q) => q !== pos)
                              : [...x.positions, pos],
                          }
                        : x,
                    ),
                  )
                }
                onRemove={
                  d.slots.length > 1 ? () => setSlots(d.slots.filter((_, j) => j !== i)) : undefined
                }
              />
            ))}
          </View>

          {d.slots.length < MAX_SLOTS ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setSlots([...d.slots, { slot: `FLEX${d.slots.length + 1}`, positions: [...FLEX] }])
              }
              style={({ pressed }) => [
                styles.add,
                { borderColor: c.border },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.text }]}>+ Add a slot</Text>
            </Pressable>
          ) : (
            <Note text={`Ten slots is the most a contest can ask for.`} />
          )}
        </Field>

        {/* ------------------------------------------------------- room */}
        <Field label="Seats" hint="How many managers it holds, including you.">
          <Stepper
            value={d.maxEntrants}
            min={MIN_ENTRANTS}
            max={MAX_ENTRANTS}
            step={1}
            suffix="managers"
            onChange={(v) => set('maxEntrants', v)}
          />
        </Field>

        {/* -------------------------------------------------------- fee */}
        <Field
          label="Entry fee"
          hint={`Between ${band.min} and ${band.max} coins for ${d.slots.length} card${
            d.slots.length === 1 ? '' : 's'
          }.`}>
          <Stepper
            value={d.entryFee}
            min={band.min}
            max={band.max}
            step={5}
            suffix="coins"
            onChange={(v) => set('entryFee', v)}
          />
          {/* WHY A FRIENDLY CANNOT BE FREE, said once, where the rule bites.
              Every slot filed earns score coins whatever contest it is in, so a
              free contest anybody can mint is a faucet with no tap — see the
              migration header. This is the one economic rule in the builder and
              it deserves its sentence rather than a silent floor. */}
          <Note
            text={`Free contests are not an option: every card you file earns coins whatever it plays in, so a contest with no fee would print them. Ninety per cent of what this takes comes back as the pool — a full room pays out ${fullPool.toLocaleString()}.`}
          />
        </Field>

        {/* ---------------------------------------------------- winning */}
        <Field label="How it is won" hint={winLine(terms) || 'Pick a rule.'}>
          <View style={styles.chipWrap}>
            {CONDITIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                accessibilityLabel={o.blurb}
                selected={d.winCondition === o.value}
                onPress={() =>
                  setD((prev) => ({
                    ...prev,
                    winCondition: o.value,
                    /* THE OTHER THREE ARE CLEARED, because the database will
                       not hold two of them at once
                       (`contests_win_parameter_matches_condition`) and because
                       a stale "top 3" riding under a median contest is a
                       setting the reader cannot see and cannot fix. */
                    winRank: o.value === 'top_n' ? (prev.winRank ?? 3) : null,
                    winPct: o.value === 'top_pct' ? (prev.winPct ?? 50) : null,
                    targetPoints: o.value === 'target' ? (prev.targetPoints ?? 60) : null,
                  }))
                }
              />
            ))}
          </View>
          <Note text={CONDITIONS.find((o) => o.value === d.winCondition)?.blurb ?? ''} />

          {d.winCondition === 'top_n' ? (
            <Stepper
              value={d.winRank ?? 3}
              min={1}
              max={Math.max(1, d.maxEntrants - 1)}
              step={1}
              suffix="places pay"
              onChange={(v) => set('winRank', v)}
            />
          ) : null}
          {d.winCondition === 'top_pct' ? (
            <Stepper
              value={d.winPct ?? 50}
              min={1}
              max={99}
              step={5}
              suffix="% of the field wins"
              onChange={(v) => set('winPct', v)}
            />
          ) : null}
          {d.winCondition === 'target' ? (
            <Stepper
              value={d.targetPoints ?? 60}
              min={5}
              max={400}
              step={5}
              suffix="points to beat"
              onChange={(v) => set('targetPoints', v)}
            />
          ) : null}
        </Field>

        {/* ----------------------------------------------------- payout */}
        <Field label="How the pool splits" hint="Among whoever wins.">
          <View style={styles.chipWrap}>
            {CURVES.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                accessibilityLabel={o.blurb}
                selected={d.payoutCurve === o.value}
                onPress={() => set('payoutCurve', o.value)}
              />
            ))}
          </View>
          <Note text={CURVES.find((o) => o.value === d.payoutCurve)?.blurb ?? ''} />
        </Field>

        {/* ---------------------------------------------------- invites */}
        <Field
          label="Invite"
          hint={
            d.invite.length > 0
              ? `${d.invite.length} of ${friends?.length ?? 0} friends`
              : 'Anyone you invite, plus anyone you give the code to afterwards.'
          }>
          {friends === null ? (
            <ActivityIndicator />
          ) : friends.length === 0 ? (
            <Note text="You have no friends added yet. Build it anyway — every contest gets a join code you can share." />
          ) : (
            <View style={styles.chipWrap}>
              {friends.map((f) => (
                <Chip
                  key={f.userId}
                  label={f.name}
                  accessibilityLabel={`Invite ${f.name}`}
                  selected={d.invite.includes(f.userId)}
                  onPress={() => toggleInvite(f.userId)}
                />
              ))}
            </View>
          )}
        </Field>

        {/* ---------------------------------------------------- preview */}
        <Field label="What you are building" hint={fillLine(terms)}>
          <View style={[styles.preview, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[Type.strong, { color: c.text }]}>{d.name.trim() || 'Untitled contest'}</Text>
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              {d.slots.length} card{d.slots.length === 1 ? '' : 's'} · {shapeName(d.slots)}
            </Text>
            <Text style={[Type.fine, { color: c.textSecondary }]}>{winLine(terms)}</Text>
            <View style={styles.previewRow}>
              <StatusChip label={`${d.entryFee} coins`} tone="neutral" />
              <StatusChip label={`Pool up to ${fullPool.toLocaleString()}`} tone="positive" />
              {/* SAID OUT LOUD, because it is the reason a friendly is safe to
                  accept from anybody. Every other contest in the lobby that
                  costs coins also costs a heart, so the absence of a stake is
                  news rather than an omission. */}
              <StatusChip label="No hearts" tone="neutral" />
            </View>
          </View>
        </Field>

        {/* ----------------------------------------------------- action */}
        {problems.length > 0 ? (
          <View style={styles.problems}>
            {problems.map((p) => (
              <Text key={p} style={[Type.fine, { color: c.negative }]}>
                {p}
              </Text>
            ))}
          </View>
        ) : null}
        {failed ? <Text style={[Type.fine, { color: c.negative }]}>{failed}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={build}
          style={({ pressed }) => [
            styles.build,
            { backgroundColor: ready ? c.text : c.backgroundElement, borderColor: c.border },
            pressed && styles.pressed,
          ]}>
          {busy ? (
            <ActivityIndicator color={c.background} />
          ) : (
            <Text style={[Type.strong, { color: ready ? c.background : c.textTertiary }]}>
              Build it
            </Text>
          )}
        </Pressable>
        {/* Building is FREE. Entering is what costs, and it costs the same as
            it costs everybody else — a create button that silently took a fee
            would be the ambush the lobby's stake marks exist to prevent. */}
        <Note
          text={`Building costs nothing. You enter it like anyone else, for ${d.entryFee} coins — you hold ${coins.toLocaleString()}.`}
        />
      </View>
    </PlayerSheetFrame>
  );
}

/** Whether two slot lists are the same shape AND the same labels. */
function sameShape(a: DraftSlot[], b: DraftSlot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const t = b[i];
    return (
      s.slot.toUpperCase() === t.slot.toUpperCase() &&
      s.positions.length === t.positions.length &&
      s.positions.every((p) => t.positions.includes(p))
    );
  });
}

/** A labelled block with a hint. The builder's one structural unit. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.field}>
      <Text style={[Type.strong, { color: c.text }]}>{label}</Text>
      {hint ? <Text style={[Type.fine, { color: c.textSecondary }]}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Note({ text }: { text: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  if (!text) return null;
  return <Text style={[Type.micro, { color: c.textTertiary }]}>{text}</Text>;
}

/**
 * One slot: what it is called, and what it will take.
 *
 * The name is editable because it is what the reader sees on the lineup board
 * — "FLEX1" and "WR3" are labels on a screen, not internal keys — and because
 * matching the seeded formats' labels exactly is what makes a hand-built Flex
 * Three deduplicate onto the real one.
 */
function SlotRow({
  slot,
  onRename,
  onToggle,
  onRemove,
}: {
  slot: DraftSlot;
  onRename: (name: string) => void;
  onToggle: (pos: SlotPosition) => void;
  onRemove?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.slot, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.slotHead}>
        <TextInput
          value={slot.slot}
          onChangeText={(v) => onRename(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="SLOT"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Slot name"
          style={[Type.strong, NUMERIC, styles.slotName, { color: c.text, borderColor: c.border }]}
        />
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove the ${slot.slot} slot`}
            onPress={onRemove}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
            <Text style={[Type.fine, { color: c.textSecondary }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chipWrap}>
        {POSITIONS.map((p) => (
          <Chip
            key={p}
            label={p}
            accessibilityLabel={`${slot.slot || 'This slot'} accepts ${p}`}
            selected={slot.positions.includes(p)}
            onPress={() => onToggle(p)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * A number with two shoulders.
 *
 * CLAMPED RATHER THAN VALIDATED. Every stepper on this screen is bounded by a
 * rule the server also enforces, and the bound moves — the fee's band follows
 * the slot count, `top N`'s ceiling follows the seat count. Clamping at the
 * control means the reader meets the rule as a button that stops rather than as
 * a sentence in red, which is the difference between a limit and an error.
 */
function Stepper({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (next: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <View style={[styles.stepper, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease, currently ${value} ${suffix}`}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
        style={({ pressed }) => [styles.shoulder, pressed && styles.pressed]}>
        <Text style={[Type.strong, { color: value <= min ? c.textTertiary : c.text }]}>−</Text>
      </Pressable>
      <View style={styles.stepperValue}>
        <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{value.toLocaleString()}</Text>
        <Text style={[Type.micro, { color: c.textSecondary }]}>{suffix}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase, currently ${value} ${suffix}`}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
        style={({ pressed }) => [styles.shoulder, pressed && styles.pressed]}>
        <Text style={[Type.strong, { color: value >= max ? c.textTertiary : c.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.four, paddingBottom: Spacing.six },
  field: { gap: Spacing.two },
  stack: { gap: Spacing.two },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, paddingHorizontal: Spacing.three },
  inputText: { height: 44 },
  slot: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotName: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minWidth: 80,
    paddingVertical: Spacing.one,
  },
  remove: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  add: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
  },
  shoulder: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  stepperValue: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.two },
  preview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  problems: { gap: Spacing.one },
  build: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
});
