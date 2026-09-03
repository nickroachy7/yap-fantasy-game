/**
 * The friendly-contest builder: settings, a lineup you are inventing, settings.
 *
 * ===========================================================================
 * THE POSITION LIST IS THE COMPETE BOARD, NOT A PICTURE OF IT
 * ===========================================================================
 *
 * The slots in the middle of this screen are `StarterRow` — the same exported
 * component the lineup board draws, given `card={null}`. Same split badge at
 * the same 26/40, same "Choose a RB/WR/TE", same "12 eligible" underneath, same
 * inset rule between rows. Not a lookalike: if the board's empty row changes,
 * this changes with it, because there is one of them.
 *
 * That is the whole idea of the screen. What you are building IS a lineup that
 * does not exist yet, and every earlier draft of this described it instead —
 * slot names in a text field, then position toggles in a chip row. Both were
 * accurate and neither showed you the thing. Now the builder is the board with
 * nothing in it, and pressing a slot does here what pressing an empty slot does
 * there: it asks what goes in it.
 *
 * ---------------------------------------------------------------------------
 * SO THE POSITIONS ARE CHOSEN IN A PICKER, NOT ON THE ROW
 * ---------------------------------------------------------------------------
 *
 * Five toggles on every row made the row a control panel, which is the one
 * thing a lineup row is not. They are `SlotPicker` now — seven named slots, the
 * vocabulary a fantasy player already has (a quarterback, a flex, a superflex)
 * rather than a set of positions to assemble one out of.
 *
 * Seven fixed types rather than free combination costs almost nothing: the
 * arbitrary ones nobody wants (a QB-or-kicker slot) are gone, and every type
 * here maps onto a slot the seeded formats already use — which is what keeps a
 * hand-built standard shape deduplicating onto the real format. Build three
 * flex slots and the contest says "Flex Three", because it IS `flex3`.
 *
 * ===========================================================================
 * WHY THE SETTINGS ARE IN TWO BLOCKS AROUND IT
 * ===========================================================================
 *
 * Name, seats and fee come FIRST because they are what the contest is —
 * everybody knows what they want to call it, how many friends they are asking,
 * and roughly what it should cost, and none of it depends on anything below.
 *
 * How it is won, how the pool splits and what the pool comes to sit AFTER the
 * roster, because they read against it. "Top 3 of 8" means nothing until the
 * seats are set; the fee band is a function of the slot count and moves as you
 * add slots. Putting them last means every number on them is already true when
 * the eye arrives.
 *
 * ===========================================================================
 * WHAT IS REFUSED HERE IS REFUSED IN THE SAME WORDS THE SERVER USES
 * ===========================================================================
 *
 * `draftProblems` re-implements the server's validation — see the header on
 * `friendly.ts` for why that duplication is deliberate — and this screen shows
 * its output verbatim above the button, with the button disabled while any
 * remain. A player should never press a build button that is going to fail.
 */
import { Fragment, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { StatusChip } from '@/components/ui/StatusChip';
import { PositionBadge } from '@/components/ui/PositionBadge';
import { BADGE_SIZE, BADGE_WIDTH, StarterRow } from '@/components/lineup/LineupRow';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { useCollection } from '@/components/collection/use-collection';
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
  PRIZE_POOL_BPS,
  shapeName,
  slotLabels,
  suggestedFee,
  type ContestDraft,
  type DraftSlot,
  type SlotPosition,
} from './friendly';

/**
 * THE SEVEN SLOTS A CONTEST CAN ASK FOR, named the way a fantasy player names
 * them.
 *
 * This replaces five position toggles per row, and the trade is deliberate. The
 * toggles could express thirty-one combinations; twenty-four of them are things
 * nobody has ever wanted (a slot taking a quarterback or a kicker) and the
 * seven that remain are the ones every fantasy site has offered for twenty
 * years. Naming them is what lets the picker say "Superflex" instead of asking
 * somebody to work out that QB+RB+WR+TE is what that means.
 *
 * Every one of them is also a slot the SEEDED formats use, which is not a
 * coincidence and is load-bearing: `slotLabels` derives QB / RB1 / WR1 / TE /
 * FLEX1 / SFLEX from these, those are the names `main`, `flex3`, `wr_room`,
 * `superflex` and `roster7` already carry, and matching them exactly is how the
 * server recognises a hand-built standard shape as the real format rather than
 * as the hundredth copy of it.
 */
type SlotType = {
  key: string;
  /** What the picker calls it. */
  name: string;
  positions: SlotPosition[];
  /** What the board writes: "RB/WR/TE". */
  reads: string;
};

const SLOT_TYPES: SlotType[] = [
  { key: 'QB', name: 'Quarterback', positions: ['QB'], reads: 'QB' },
  { key: 'RB', name: 'Running back', positions: ['RB'], reads: 'RB' },
  { key: 'WR', name: 'Wide receiver', positions: ['WR'], reads: 'WR' },
  { key: 'TE', name: 'Tight end', positions: ['TE'], reads: 'TE' },
  { key: 'K', name: 'Kicker', positions: ['PK'], reads: 'PK' },
  { key: 'FLEX', name: 'Flex', positions: ['RB', 'WR', 'TE'], reads: 'RB/WR/TE' },
  {
    key: 'SFLEX',
    name: 'Superflex',
    positions: ['QB', 'RB', 'WR', 'TE'],
    reads: 'QB/RB/WR/TE',
  },
];

/**
 * BRING EVERY DEPENDENT SETTING BACK INSIDE ITS RANGE.
 *
 * ===========================================================================
 * THE SETTINGS ON THIS SCREEN DEPEND ON EACH OTHER, AND THE DEPENDENCIES RUN
 * DOWNHILL
 * ===========================================================================
 *
 *   slots  →  the legal FEE band is 10–20 coins a slot
 *   seats  →  the most PLACES a top-N contest can pay is one short of them,
 *             because a contest everybody wins is not a contest and
 *             `contest_results` refuses to resolve it
 *
 * Both of those are bounds on a control the reader may have set MINUTES AGO,
 * moved by a control they are touching now. Take a room of eight paying three
 * places and pull the seats down to three: the places stepper is suddenly
 * showing 3 out of a legal maximum of 2, and nothing on screen has changed
 * except a number the reader was not looking at.
 *
 * There are two honest ways to handle that and one dishonest one. The dishonest
 * one is to leave the draft invalid and turn a line red — the reader is then
 * being told off for a rule they did not break. The honest ones are to refuse
 * the change, or to CARRY the dependent setting with it. This carries it.
 *
 * Every setter runs the whole draft through here, so the draft is never
 * internally inconsistent between two renders. What survives in
 * `draftProblems` is therefore only what a person actually has to DECIDE — a
 * contest with no name — rather than arithmetic they were never shown.
 *
 * CLAMPED, NOT RESET. A deliberate 95-coin fee stays 95 for as long as 95 is
 * legal, and only moves as far as it must. A setting that snapped back to a
 * default every time something else changed would be worse than the red line.
 */
function reconcile(d: ContestDraft): ContestDraft {
  const { min, max } = feeRange(Math.max(1, d.slots.length));
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  return {
    ...d,
    entryFee: clamp(d.entryFee, min, max),
    maxEntrants: clamp(d.maxEntrants, MIN_ENTRANTS, MAX_ENTRANTS),
    /* One short of the seats: `friendly_terms_are_playable` refuses `win_rank
       >= max_entrants`, and it is right to — nobody can lose it. */
    winRank:
      d.winRank === null ? null : clamp(d.winRank, 1, Math.max(1, d.maxEntrants - 1)),
    winPct: d.winPct === null ? null : clamp(d.winPct, 1, 99),
    targetPoints: d.targetPoints === null ? null : clamp(d.targetPoints, 5, 400),
  };
}

/** Which of the seven a draft slot is. Falls back to flex for a stray shape. */
const typeOf = (slot: DraftSlot): SlotType =>
  SLOT_TYPES.find(
    (t) =>
      t.positions.length === slot.positions.length &&
      t.positions.every((p) => slot.positions.includes(p)),
  ) ?? SLOT_TYPES[5];

const FLEX = SLOT_TYPES[5];

/**
 * The seven, as rows for `Options` — with a badge each and the count of cards
 * you hold that could fill one.
 *
 * THE COUNT IS THE GUIDANCE. A five-receiver contest is a fine idea until you
 * notice you own four, and this is the only place that fact can be delivered
 * before the contest exists rather than after somebody fails to fill it.
 */
function slotOptions(eligible: Map<string, number> | null) {
  return SLOT_TYPES.map((t) => {
    const n = eligible?.get(t.key);
    return {
      value: t.key,
      label: t.name,
      hint: `${t.reads}${n === undefined ? '' : ` · ${n} of your cards`}`,
      badge: (
        <PositionBadge label={t.key} positions={t.positions} size={BADGE_SIZE} width={BADGE_WIDTH} />
      ),
    };
  });
}

const CONDITIONS: { value: WinCondition; label: string; blurb: string }[] = [
  {
    value: 'median',
    label: 'Beat the median',
    blurb: 'Everyone above the middle of the field splits the pool.',
  },
  {
    value: 'top_n',
    label: 'Top places',
    blurb: 'Only the first few finishers win. Most of the room goes home.',
  },
  {
    value: 'top_pct',
    label: 'Top share',
    blurb: 'A percentage wins, so the places scale with the entries.',
  },
  {
    value: 'target',
    label: 'Beat a score',
    blurb: 'No field needed — it settles even if you are the only one who files.',
  },
];

const CURVES: { value: PayoutCurve; label: string; blurb: string }[] = [
  {
    value: 'flat',
    label: 'Even split',
    blurb: 'Every winner takes the same, however far ahead they finished.',
  },
  {
    value: 'linear',
    label: 'Sliding',
    blurb: 'A gentle ladder — first takes more, but everybody who won is paid.',
  },
  { value: 'steep', label: 'Steep', blurb: 'First takes most of it, then it halves down.' },
  {
    value: 'winner_take_all',
    label: 'Winner takes all',
    blurb: 'One prize, one winner, nothing for anybody else.',
  },
];

/**
 * A fresh draft: four flex slots.
 *
 * A starting position rather than a preset. Four because one is a strange thing
 * to be shown first and eight is a wall; flex because it is the only slot that
 * rules nothing out, so every change from here is the player adding an opinion
 * rather than undoing one of ours.
 */
const emptyDraft = (): ContestDraft => ({
  name: '',
  slots: Array.from({ length: 4 }, () => ({ positions: [...FLEX.positions] })),
  entryFee: suggestedFee(4),
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
  const { cards } = useCollection();

  const [d, setD] = useState<ContestDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * Which slot the picker is open for: an index, or `'add'`, or nothing.
   *
   * One piece of state for both jobs because they ARE one job — the picker is
   * the same list either way, and the only difference is whether choosing
   * replaces a slot or appends one. A second flag would let both be true.
   */
  const [picking, setPicking] = useState<number | 'add' | null>(null);
  /** Which settings row has its list open. One at a time, like the slots. */
  const [open, setOpen] = useState<'win' | 'split' | null>(null);

  const set = <K extends keyof ContestDraft>(k: K, v: ContestDraft[K]) =>
    setD((prev) => reconcile({ ...prev, [k]: v }));

  const band = feeRange(Math.max(1, d.slots.length));
  const problems = useMemo(() => draftProblems(d), [d]);
  const ready = problems.length === 0 && !busy;
  const labels = useMemo(() => slotLabels(d.slots), [d.slots]);

  /**
   * HOW MANY OF YOUR CARDS COULD FILL EACH KIND OF SLOT.
   *
   * The board's second line, and the reason it is worth reading here rather
   * than only there: a five-receiver contest is a fine idea until you notice
   * you hold four. `useCollection` is session-cached and already loaded by the
   * time anybody reaches this screen, so it costs nothing.
   *
   * Null while the collection is loading, which `StarterRow` draws as no second
   * line at all — see its own note on why unknown must not become nought.
   */
  const eligible = useMemo(() => {
    if (cards === null) return null;
    const held = cards.filter((x) => x.position);
    const count = new Map<string, number>();
    for (const t of SLOT_TYPES) {
      count.set(t.key, held.filter((x) => t.positions.includes(x.position as SlotPosition)).length);
    }
    return count;
  }, [cards]);

  /**
   * THE DRAFT, AS TERMS. Fed to the same `winLine` / `fillLine` the lobby uses,
   * so the summary under the button cannot word a rule differently from the row
   * it becomes.
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

  const setSlots = (slots: DraftSlot[]) => setD((prev) => reconcile({ ...prev, slots }));

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

  return (
    <PlayerSheetFrame
      title="Build a friendly contest"
      subtitle="Your own terms, your own guest list"
      onClose={onClose}
      closeLabel="Close the friendly contest builder"
      dismissible={dismissible}>
      <View style={styles.page}>
        {backLabel ? <BackRow label={backLabel} onPress={onBack} /> : null}

        {/* ══════════════════════════════ WHAT IT IS — before the roster,
            because none of it depends on the roster and everybody already
            knows the answers. */}
        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
          <Row label="Name" first>
            <TextInput
              value={d.name}
              onChangeText={(v) => set('name', v)}
              placeholder="Sunday Six"
              placeholderTextColor={c.textTertiary}
              maxLength={40}
              accessibilityLabel="Contest name"
              style={[Type.body, styles.nameInput, { color: c.text }]}
            />
          </Row>

          <Row label="Seats" hint="Managers it holds, including you">
            <Stepper
              value={d.maxEntrants}
              min={MIN_ENTRANTS}
              max={MAX_ENTRANTS}
              step={1}
              onChange={(v) => set('maxEntrants', v)}
              accessibilityLabel="Seats"
            />
          </Row>

          <Row
            label="Entry fee"
            hint={`${band.min}–${band.max} coins for ${d.slots.length} card${
              d.slots.length === 1 ? '' : 's'
            }`}
            last>
            <Stepper
              value={d.entryFee}
              min={band.min}
              max={band.max}
              step={5}
              onChange={(v) => set('entryFee', v)}
              accessibilityLabel="Entry fee in coins"
            />
          </Row>
        </View>

        {/* ═════════════════════════════════════════════════════ POSITIONS */}
        <Heading
          label="Positions"
          value={`${d.slots.length} card${d.slots.length === 1 ? '' : 's'}`}
        />
        <Text style={[Type.fine, { color: c.textTertiary }]}>{shapeName(d.slots)}</Text>

        {/* NO CONTAINER, AND NO GUTTER EITHER. `StarterRow` paints its own
            background and draws its own inset rule, exactly as it does on the
            board — so the only thing left between this list and that one was
            the sheet's own horizontal padding holding it 16pt off each edge.
            The negative margin cancels it, which is the same trick this frame
            already uses for its other full-bleed strip. */}
        <View style={styles.slots}>
          {d.slots.map((s, i) => {
            const t = typeOf(s);
            return (
              <Fragment key={i}>
                <StarterRow
                  slot={labels[i]}
                  card={null}
                  points={null}
                  scored={false}
                  eligibleCount={eligible ? (eligible.get(t.key) ?? 0) : null}
                  eligiblePositions={t.reads}
                  selected={picking === i}
                  disabled={false}
                  /* THE SAME GESTURE AS THE BOARD. There, pressing an empty
                     slot asks which CARD goes in it; here it asks which
                     POSITION the slot is. One row, one press, one question
                     about what fills this space. */
                  onSwap={() => setPicking(picking === i ? null : i)}
                />
                {picking === i ? (
                  <Options
                    options={slotOptions(eligible)}
                    value={t.key}
                    onPick={(key) => {
                      const next = SLOT_TYPES.find((x) => x.key === key);
                      if (next) {
                        setSlots(
                          d.slots.map((x, j) =>
                            j === i ? { positions: [...next.positions] } : x,
                          ),
                        );
                      }
                      setPicking(null);
                    }}
                    footer={
                      d.slots.length > 1 ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setSlots(d.slots.filter((_, j) => j !== i));
                            setPicking(null);
                          }}
                          style={({ pressed }) => [
                            styles.remove,
                            { borderTopColor: c.border },
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[Type.strong, { color: c.negative }]}>
                            Remove this slot
                          </Text>
                        </Pressable>
                      ) : null
                    }
                  />
                ) : null}
              </Fragment>
            );
          })}

          {picking === 'add' ? (
            <Options
              options={slotOptions(eligible)}
              value={null}
              onPick={(key) => {
                const next = SLOT_TYPES.find((x) => x.key === key);
                if (next) setSlots([...d.slots, { positions: [...next.positions] }]);
                setPicking(null);
              }}
            />
          ) : null}

          {d.slots.length < MAX_SLOTS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a slot"
              accessibilityState={{ expanded: picking === 'add' }}
              onPress={() => setPicking(picking === 'add' ? null : 'add')}
              style={({ pressed }) => [
                styles.add,
                { borderColor: c.border },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.textSecondary }]}>
                {picking === 'add' ? 'Close' : '+ Add a slot'}
              </Text>
            </Pressable>
          ) : (
            <Text style={[Type.fine, styles.addFull, { color: c.textTertiary }]}>
              Ten slots is the most a contest can ask for.
            </Text>
          )}
        </View>

        {/* ══════════════════════════════════ HOW IT IS DECIDED — after the
            roster, because all of it reads against the roster: "top 3 of 8"
            means nothing until the seats are set, and the pool is the fee
            times them. */}
        <Heading label="Scoring" />

        <View style={[styles.card, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open === 'win' }}
            accessibilityLabel="How the contest is won"
            onPress={() => setOpen(open === 'win' ? null : 'win')}>
            <Row
              label="How it's won"
              hint={CONDITIONS.find((o) => o.value === d.winCondition)?.blurb}
              first>
              <SelectValue
                label={CONDITIONS.find((o) => o.value === d.winCondition)?.label ?? '—'}
                open={open === 'win'}
              />
            </Row>
          </Pressable>
          {open === 'win' ? (
            <Options
              options={CONDITIONS.map((o) => ({
                value: o.value,
                label: o.label,
                hint: o.blurb,
              }))}
              value={d.winCondition}
              onPick={(v) => {
                setD((prev) =>
                  reconcile({
                    ...prev,
                    winCondition: v,
                    /* THE OTHER THREE ARE CLEARED, because the database will
                       not hold two of them at once
                       (`contests_win_parameter_matches_condition`) and because
                       a stale "top 3" riding under a median contest is a
                       setting the reader cannot see and cannot fix. */
                    winRank: v === 'top_n' ? (prev.winRank ?? 3) : null,
                    winPct: v === 'top_pct' ? (prev.winPct ?? 50) : null,
                    targetPoints: v === 'target' ? (prev.targetPoints ?? 60) : null,
                  }),
                );
                setOpen(null);
              }}
            />
          ) : null}

          {/* THE RULE'S OWN NUMBER, on its own row and only when the rule has
              one. A stepper that means nothing under three of the four
              conditions is worse than a row that appears when it applies. */}
          {d.winCondition === 'top_n' ? (
            <Row label="Places paid" hint={`Out of ${d.maxEntrants} seats`}>
              <Stepper
                value={d.winRank ?? 3}
                min={1}
                max={Math.max(1, d.maxEntrants - 1)}
                step={1}
                onChange={(v) => set('winRank', v)}
                accessibilityLabel="Places paid"
              />
            </Row>
          ) : null}
          {d.winCondition === 'top_pct' ? (
            <Row label="Share that wins" hint="Per cent of the field">
              <Stepper
                value={d.winPct ?? 50}
                min={1}
                max={99}
                step={5}
                suffix="%"
                onChange={(v) => set('winPct', v)}
                accessibilityLabel="Winning share, per cent"
              />
            </Row>
          ) : null}
          {d.winCondition === 'target' ? (
            <Row label="Score to beat" hint="Known before a ball is thrown">
              <Stepper
                value={d.targetPoints ?? 60}
                min={5}
                max={400}
                step={5}
                onChange={(v) => set('targetPoints', v)}
                accessibilityLabel="Score to beat"
              />
            </Row>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open === 'split' }}
            accessibilityLabel="How the prize pool splits"
            onPress={() => setOpen(open === 'split' ? null : 'split')}>
            <Row label="Pool split" hint={CURVES.find((o) => o.value === d.payoutCurve)?.blurb}>
              <SelectValue
                label={CURVES.find((o) => o.value === d.payoutCurve)?.label ?? '—'}
                open={open === 'split'}
              />
            </Row>
          </Pressable>
          {open === 'split' ? (
            <Options
              options={CURVES.map((o) => ({ value: o.value, label: o.label, hint: o.blurb }))}
              value={d.payoutCurve}
              onPick={(v) => {
                set('payoutCurve', v);
                setOpen(null);
              }}
            />
          ) : null}

          <Row label="Prize pool" hint="90% of the fees collected, if it fills">
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
              {fullPool.toLocaleString()}
            </Text>
          </Row>

          {/* THE ONE RULE THAT IS NOT A SETTING, stated where the stakes are.
              Every other contest in the lobby that costs coins also costs a
              heart, so the ABSENCE of a stake is news rather than an omission —
              and a reader wondering why there is no risk control deserves the
              answer here rather than in its silence. */}
          <Row label="Hearts" hint="A friendly can never end a run" last>
            <StatusChip label="None at risk" tone="neutral" />
          </Row>
        </View>

        {/* ════════════════════════════════════════════════════════ INVITE */}
        <Heading
          label="Invite"
          value={d.invite.length > 0 ? `${d.invite.length} chosen` : undefined}
        />
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          Friends now, or anyone you give the join code to afterwards.
        </Text>

        {friends === null ? (
          <ActivityIndicator />
        ) : friends.length === 0 ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            No friends added yet. Build it anyway — every contest gets a join code you can share.
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            {friends.map((f) => (
              <Chip
                key={f.userId}
                label={f.name}
                accessibilityLabel={`Invite ${f.name}`}
                selected={d.invite.includes(f.userId)}
                onPress={() =>
                  setD((prev) => ({
                    ...prev,
                    invite: prev.invite.includes(f.userId)
                      ? prev.invite.filter((u) => u !== f.userId)
                      : [...prev.invite, f.userId],
                  }))
                }
              />
            ))}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════ THE ASK */}
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

        {/* THE WHOLE DEAL IN TWO LINES, from the same helpers the lobby row
            will use. */}
        <Text style={[Type.micro, { color: c.textTertiary }]}>
          {winLine(terms)} · {fillLine(terms)}
        </Text>
        {/* Building is FREE. Entering is what costs, and it costs what it costs
            everybody else — a create button that silently took a fee would be
            the ambush the lobby's stake marks exist to prevent. */}
        <Text style={[Type.micro, { color: c.textTertiary }]}>
          Building costs nothing. You enter it like anyone else, for {d.entryFee} coins — you hold{' '}
          {coins.toLocaleString()}.
        </Text>
      </View>

    </PlayerSheetFrame>
  );
}

/**
 * A list that opens where it stands.
 *
 * ===========================================================================
 * WHY NOTHING ON THIS SCREEN IS A MODAL
 * ===========================================================================
 *
 * The obvious control for "one of seven" is a popover, and this app has one —
 * `DropdownChip`, used for the week and season selectors. It does not work
 * HERE, and it is worth writing down why rather than rediscovering it: the
 * builder is a frame inside `ContestSheet`, which is itself a PRESENTED sheet,
 * and a `Modal` nested inside a modal renders with its backdrop and its surface
 * unpainted — the options appear as ghost text over the page behind. That is
 * not a bug this screen introduced; the same thing happens to `DropdownChip`
 * when it is used inside this sheet, which is worth fixing on its own.
 *
 * It is also, more importantly, the thing `ContestSheet` exists to abolish. Its
 * header is three paragraphs about how every step used to put a modal on top of
 * a modal and how the fix was one sheet with frames inside it. A picker that
 * opens a second overlay over the sheet is that argument being lost again for
 * the sake of a dropdown.
 *
 * So the list opens IN PLACE, pushing what is below it down. No overlay, no
 * stacking context, no scrim to dismiss, and — on a form this long — no moment
 * where the thing you were reading is covered by the thing you are choosing.
 */
function Options<T extends string>({
  options,
  value,
  onPick,
  footer,
}: {
  options: { value: T; label: string; hint?: string; badge?: React.ReactNode }[];
  value: T | null;
  onPick: (v: T) => void;
  /** A destructive last row — "Remove this slot". */
  footer?: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.options, { backgroundColor: c.backgroundElement }]}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
            onPress={() => onPick(o.value)}
            style={({ pressed }) => [
              styles.option,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
              (pressed || on) && { backgroundColor: c.backgroundSelected },
            ]}>
            {o.badge}
            <View style={styles.rowText}>
              <Text style={[Type.strong, { color: c.text }]}>{o.label}</Text>
              {o.hint ? (
                <Text style={[Type.micro, { color: c.textTertiary }]}>{o.hint}</Text>
              ) : null}
            </View>
            {on ? <Text style={[Type.fine, { color: c.textSecondary }]}>✓</Text> : null}
          </Pressable>
        );
      })}
      {footer}
    </View>
  );
}

/** The value a `Select` row shows, and the caret that says it opens. */
function SelectValue({ label, open }: { label: string; open: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.selectValue}>
      <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
        {label}
      </Text>
      <Text style={[Type.fine, { color: c.textTertiary }]}>{open ? '▴' : '▾'}</Text>
    </View>
  );
}

/** A section title, with an optional figure on the right. */
function Heading({ label, value }: { label: string; value?: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.heading}>
      <Text style={[Type.figure, { color: c.text }]}>{label}</Text>
      {value ? <Text style={[Type.figure, NUMERIC, { color: c.textTertiary }]}>{value}</Text> : null}
    </View>
  );
}

/**
 * One line of a settings list: what it is on the left, what it is set to on the
 * right.
 *
 * THE HINT SITS UNDER THE LABEL rather than beside the control, which is the
 * only arrangement that survives a long one. "Every winner takes the same,
 * however far ahead they finished" is a sentence, and a sentence in a
 * right-hand column either wraps to three ragged lines or is truncated into
 * nonsense. On the left it has the row's whole width.
 */
function Row({
  label,
  hint,
  first,
  last,
  children,
}: {
  label: string;
  hint?: string;
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        last && styles.rowLast,
      ]}>
      <View style={styles.rowText}>
        <Text style={[Type.strong, { color: c.text }]}>{label}</Text>
        {hint ? <Text style={[Type.micro, { color: c.textTertiary }]}>{hint}</Text> : null}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

/**
 * A number with two shoulders, sized to sit inside a settings row.
 *
 * CLAMPED RATHER THAN VALIDATED. Every stepper on this screen is bounded by a
 * rule the server also enforces, and the bound MOVES — the fee's band follows
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
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (next: number) => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <View style={[styles.stepper, { borderColor: c.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: decrease from ${value}`}
        disabled={value <= min}
        hitSlop={6}
        onPress={() => onChange(clamp(value - step))}
        style={({ pressed }) => [styles.shoulder, pressed && styles.pressed]}>
        <Text style={[Type.strong, { color: value <= min ? c.textTertiary : c.text }]}>−</Text>
      </Pressable>
      <Text style={[Type.strong, NUMERIC, styles.stepperValue, { color: c.text }]}>
        {value.toLocaleString()}
        {suffix ?? ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: increase from ${value}`}
        disabled={value >= max}
        hitSlop={6}
        onPress={() => onChange(clamp(value + step))}
        style={({ pressed }) => [styles.shoulder, pressed && styles.pressed]}>
        <Text style={[Type.strong, { color: value >= max ? c.textTertiary : c.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.two, paddingBottom: Spacing.six },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },

  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.panel, overflow: 'hidden' },

  /* EDGE TO EDGE. `PlayerSheetFrame`'s content is padded by `Spacing.three`
     and a lineup row is not: on the board the row's background runs the whole
     width and only its RULE is inset, which is what makes a list of them read
     as a table rather than as a column of cards. Cancelling the padding here
     is the only way to get that inside a padded sheet. */
  slots: { marginTop: Spacing.one, marginHorizontal: -Spacing.three },
  /* Inside the full-bleed block, so its own gutter is put back by hand — the
     rows want the edges and a button does not. */
  add: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
    marginHorizontal: Spacing.three,
  },
  addFull: { textAlign: 'center', marginTop: Spacing.two, marginHorizontal: Spacing.three },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  rowLast: {},
  /* The label column takes what is left and the control keeps its natural
     width. `flexShrink` rather than a fixed basis, so a long hint wraps instead
     of pushing the control off the end of the row. */
  rowText: { flex: 1, flexShrink: 1, gap: 2 },
  rowControl: { alignItems: 'flex-end' },
  nameInput: { minWidth: 140, textAlign: 'right', paddingVertical: Spacing.one },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
  },
  shoulder: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  stepperValue: { minWidth: 44, textAlign: 'center' },

  /* The opened list. Tinted rather than bordered, so it reads as the row
     above it having unfolded rather than as a separate panel that arrived. */
  options: { overflow: 'hidden' },
  selectValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  remove: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  problems: { gap: Spacing.one, marginTop: Spacing.two },
  build: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  pressed: { opacity: 0.6 },
});
