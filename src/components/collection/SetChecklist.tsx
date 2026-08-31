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
 *
 * IT IS A GRID OF CARDS, NOT A LIST OF NAMES, and that is the point of a
 * checklist: the thing you are collecting is a card, so the page that tracks
 * them should be showing you cards. It was a table — a position badge, a name,
 * a club and a value in four columns — which said the same words about a
 * sticker album in the shape of a spreadsheet. Same `PlayerCard` the inventory
 * draws, at the same compact size, so a card you own looks identical on both
 * screens.
 *
 * THE CARDS SAY LESS HERE, deliberately. Three of the collection card's facts
 * are about a copy in your hand and this screen draws cards you may not own:
 * the tier progress, the week's fixture and the injury designation are all
 * gone. What replaces them under the frame is the only question this screen
 * asks — is it in, can I put it in, and what does that cost.
 *
 * A CARD YOU DO NOT OWN still draws, with a grey frame instead of a tier one
 * and an em dash where the figure goes. That is the empty slot in the album,
 * and it is most of what a position set contains.
 */
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlayerCard } from '@/components/cards';
import { SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { Coin } from '@/components/shell/AppHeader';
import { Tabs } from '@/components/ui/Tabs';
import {
  Colors,
  NUMERIC,
  Radius,
  selectionAccent,
  Spacing,
  TierColors,
  Type,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  actionableOf,
  isAddable,
  planFor,
  progressOf,
  remainingOf,
  setRule,
  setTone,
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
  /** Coins the commit would pay, from the copy that would actually be burnt. */
  commit_value: number;
  /** That copy's tier, so the row can say what it is about to destroy. */
  commit_tier: CardTier | null;
};

/**
 * Which slice of the set is on screen.
 *
 * OWNED BY THE ROUTE, not by the checklist, and that is what the sheet's pinned
 * bar is paid for. The filters have to be drawn twice — once in the list where
 * they belong, and once in the bar that takes over when the list has scrolled
 * past them — and two rows reading one piece of state is the only version of
 * that which cannot show you "Missing" in one place and "All" in the other.
 */
export type SetFilter = 'ALL' | 'IN_SET' | 'CAN_ADD' | 'MISSING';

/**
 * Cards drawn before the "Show all" button appears. Comfortably more than any
 * team set contains (rosters are 27-33), so the button is only ever reached on
 * a position set — which is exactly the case it exists for.
 */
const HEAD = 60;

/**
 * The inventory grid's numbers, ALL of them, so a card is the same object on
 * both screens and not merely a similar one.
 *
 * The bounds used to be 2 and 6 against the inventory's 3 and 7, which nobody
 * would notice on a phone — both land on three columns there — and which pulled
 * the two apart at every other width. Same rule, whatever box it is given.
 */
const GAP = Spacing.two + 4;
const MIN_CARD_WIDTH = 100;
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 7;

const FILTERS: { key: SetFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'IN_SET', label: 'In set' },
  { key: 'CAN_ADD', label: 'Can add' },
  { key: 'MISSING', label: 'Missing' },
];

/**
 * How many members each filter would leave on screen.
 *
 * Exported because the ROUTE asks it too, and for a reason worth stating: the
 * action bar is the sheet's footer now, and a footer is a slot the frame draws
 * chrome around. A `SetActions` that rendered null inside it would leave an
 * empty bar pinned to the bottom of the sheet — the same trap `PlayerCard`'s
 * footer had. So the route decides whether there IS a footer, and this is the
 * question it decides on.
 */
export function countsOf(members: SetMember[]): Record<SetFilter, number> {
  let inSet = 0;
  let canAdd = 0;
  for (const m of members) {
    if (m.committed) inSet += 1;
    else if (m.held > 0) canAdd += 1;
  }

  return {
    ALL: members.length,
    IN_SET: inSet,
    CAN_ADD: canAdd,
    MISSING: members.length - inSet - canAdd,
  };
}

/** The members a filter leaves. */
export function filterMembers(members: SetMember[], filter: SetFilter): SetMember[] {
  if (filter === 'IN_SET') return members.filter((m) => m.committed);
  if (filter === 'CAN_ADD') return members.filter((m) => !m.committed && m.held > 0);
  if (filter === 'MISSING') return members.filter((m) => !m.committed && m.held === 0);

  return members;
}

/**
 * The filter row, on its own so the sheet's pinned bar can draw the SAME one
 * rather than a copy that drifts.
 *
 * It is exported for that one caller. Every other row on this screen belongs to
 * a position in the page; this one has to exist in two places at once, because
 * a grid of thirty cards is exactly the case where narrowing it matters and the
 * only place the control had been was above all of it.
 *
 * TABS RATHER THAN CHIPS, which is the opposite of what the inventory and the
 * players directory do, and the difference is what the row sits on. Everywhere
 * else a filter row sits on the page and a filled pill is the only mark strong
 * enough to be seen. This one sits at the bottom of the tone band — the last
 * line of a coloured header — and four filled pills there read as four buttons
 * stuck onto a header rather than as the header's own last line. `Tabs` is the
 * control that treatment already belongs to: it is what the section strip above
 * the sheet uses, and the band collapses into a bar of exactly that shape.
 *
 * Selection survives greyscale on two channels, as the chip's did: the label
 * goes from secondary to full strength AND the underline appears.
 */
export function SetFilters({
  members,
  filter,
  onFilter,
}: {
  members: SetMember[];
  filter: SetFilter;
  onFilter: (next: SetFilter) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const counts = useMemo(() => countsOf(members), [members]);

  return (
    <Tabs
      value={filter}
      onChange={onFilter}
      /* The app's selection colour, same as the strip this now matches. */
      accent={selectionAccent(scheme)}
      tabs={FILTERS.map((f) => ({
        value: f.key,
        label: f.label,
        hint: counts[f.key].toLocaleString(),
      }))}
    />
  );
}

/**
 * Autofill, and what it turns into once you have ticked something.
 *
 * PINNED TO THE BOTTOM OF THE SHEET, which is a change of place and not just of
 * styling. It used to sit between the filters and the grid, where it pushed
 * every card down half a row on a screen whose whole point is the cards — and,
 * worse, it scrolled away: a 29-card set is several screens long, so by the
 * time you had ticked the three you wanted, the button that submits them was
 * off the top of the sheet.
 *
 * ONE SLOT, TWO STATES, and they are the same act at two stages. Autofill
 * PROPOSES a batch from the rules in `autofillSelection` — the cheapest copies
 * that qualify, duplicates first — and then gets out of the way; every card is
 * a toggle, so
 * taking two out and putting a third in is two taps rather than a different
 * screen. Once anything is ticked the slot becomes the submit bar, because at
 * that point the batch is the page's next action. Nothing here is destructive:
 * the confirmation on the route is.
 *
 * IT DRAWS NOTHING OF ITS OWN AROUND ITSELF — no fill, no rule, no safe area.
 * The frame's footer slot owns all three, so this cannot disagree with the
 * pinned header at the other end of the same sheet.
 */
export function SetActions({
  set,
  members,
  selected,
  submitting,
  onAutofill,
  onClear,
  onSubmit,
}: {
  set: CardSet | null;
  members: SetMember[];
  selected: string[];
  submitting: boolean;
  onAutofill: () => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const plan = useMemo(() => planFor(members, selected), [members, selected]);
  const remaining = set ? remainingOf(set) : 0;
  /* The ceiling on the selection. The server refuses a commit that would take a
     set past its requirement, so this is what the note below counts down. */
  const roomLeft = remaining - plan.cards;

  return (
    <View style={styles.actions}>
      {plan.cards > 0 ? (
        <Text style={[Type.fine, styles.pickNote, { color: c.textTertiary }]}>
          {roomLeft === 0
            ? `That fills every slot this set has left. Tap a card to swap it out.`
            : `Tap a card to add or remove it. ${roomLeft} more ${roomLeft === 1 ? 'slot' : 'slots'} free.`}
        </Text>
      ) : null}

      <View style={styles.pickRow}>
        {plan.cards > 0 ? (
          <>
            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`Add the ${plan.cards} selected cards to the set, paying ${plan.coins} coins`}
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
                  <View style={styles.coinRow}>
                    <Coin color="#17130A" size={9} />
                    <Text style={[Type.fine, NUMERIC, { color: '#17130A' }]}>{plan.coins}</Text>
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
    </View>
  );
}

export function SetChecklist({
  set,
  members,
  claiming,
  claimError,
  selected,
  submitting,
  onClaim,
  onToggle,
  onQuickAdd,
  filter,
  onFilter,
  onFiltersEnd,
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
  /**
   * Commit ONE card now, behind its own confirmation — the plus badge on a
   * card you hold. It is a shortcut past the batch rather than a second way of
   * doing it: the route sends it to the same dialog and the same RPC the
   * submit bar uses, so nothing here has two destructive paths to keep in step.
   */
  onQuickAdd: (member: SetMember) => void;
  /** Which slice is on screen. Owned by the caller — see `SetFilter`. */
  filter: SetFilter;
  onFilter: (next: SetFilter) => void;
  /**
   * Where the filter row ENDS in the scroll content, reported so the sheet can
   * put the same row in its bar the moment this one is out of sight — not at
   * the top of the sheet, where it would sit above a screen of hero and then be
   * met by its own twin scrolling up.
   */
  onFiltersEnd?: (offset: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  /**
   * How many rows are drawn. See the "Show all" button below for why there is
   * a head at all — the short version is that a position set is up to 398
   * cards and the sheet owns its own scroll container.
   */
  const [raised, setRaised] = useState<{ filter: SetFilter; to: number } | null>(null);
  /* A head of 60 is a promise about the TOP of a list, so a new list gets a new
     head. Tying the raise to the filter it was made under is what expires it on
     a filter change without a line of code anywhere near the filter. */
  const limit = raised && raised.filter === filter ? raised.to : HEAD;

  /* The sheet owns the scroll container, so this cannot be a FlatList — nesting
     a VirtualizedList inside a ScrollView is an error rather than a slow path.
     The grid is a wrapping row measured on layout, exactly as `/gallery` draws
     the inventory, and the head below is what keeps a 398-card position set
     from mapping all of it on open. */
  const [width, setWidth] = useState(0);
  const columns = Math.max(
    MIN_COLUMNS,
    Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP))),
  );
  const cardWidth = Math.floor((width - GAP * (columns - 1)) / columns);


  const shown = useMemo(() => filterMembers(members, filter), [members, filter]);

  /* Two measurements, one number: where the row sits in the content and how
     tall it is. The sheet wants the offset at which it has gone.

     A ref rather than state, because nothing here draws it — the pair is
     reported upward and never read back, so keeping it in state would be a
     re-render of thirty cards per layout pass for a number this component does
     not use. */
  const filtersBox = useRef({ bandY: 0, y: 0, height: 0 });
  const measure = (box: { bandY?: number; y?: number; height?: number }) => {
    const next = { ...filtersBox.current, ...box };
    filtersBox.current = next;
    /* The row is measured inside the band and the frame is asking about the
       content, so the band's own offset is the third term. Every part or none:
       an offset built on a height of zero would put the takeover at the top of
       the sheet. */
    if (next.height > 0) onFiltersEnd?.(next.bandY + next.y + next.height);
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
      {/* THE BAND IS THE HEADER, and it ends on the filters rather than on the
          hero. Everything inside it answers "which set is this and how far in
          am I"; the grid below answers "what is in it". Running the colour to
          the last control before the cards is what makes that one block instead
          of a coloured title with a loose row of chips under it — and it is the
          same fill at the same strength as the bar that takes over on scroll,
          so the band does not change colour when it collapses. */}
      <SheetToneBand
        tone={set ? setTone(set) : null}
        onLayout={(e) => measure({ bandY: e.nativeEvent.layout.y })}>
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
                costs the card. The wording lives in `setRule` so that it can be
                checked against the server without mounting this sheet. */}
            <Text style={[Type.body, styles.rule, { color: c.textSecondary }]}>
              {setRule(set)}
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
              will never finish": every reward on it, what each wants, what
              each pays, and which are behind you.

              A ONE-REWARD SET SKIPS IT, which is the daily and the weekly. The
              table would be a single row restating the line above it, and a
              one-row table reads as a ladder with the rest of its rungs
              missing. Keyed off the ladder itself rather than off the family,
              so a family that grows a second reward gets the table without
              anybody remembering to come back here. The reward row below
              already says what clearing it pays. */}
          {set.milestones.length < 2 ? null : (
          <View
            style={[styles.ladder, { borderColor: c.border, backgroundColor: c.surfaceSheet }]}>
            {set.milestones.map((m, i) => (
              <Rung key={m.pct} milestone={m} committed={set.committed} first={i === 0} />
            ))}
          </View>
          )}

          {/* The reward, in whichever of its three states this set is in.
              CLAIMING SWEEPS EVERY RUNG you have reached and not been paid for,
              which is why the button names a total rather than a milestone: a
              single commit can cross two rungs on a short ladder. */}
          {status === 'ready' ? (
            <Pressable
              onPress={onClaim}
              disabled={claiming}
              accessibilityRole="button"
              accessibilityLabel={`Claim ${set.claimableCoins} coins for ${set.name}`}
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
                  <Coin color="#17130A" size={10} />
                  <Text style={[Type.strong, { color: '#17130A' }]}>
                    {`Claim ${set.claimableCoins.toLocaleString()} coins`}
                  </Text>
                </>
              )}
            </Pressable>
          ) : status === 'claimed' ? (
            <View
              style={[
                styles.rewardRow,
                { borderColor: c.border, backgroundColor: c.surfaceSheet },
              ]}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>SET FINISHED</Text>
              <View style={styles.coinRow}>
                <Coin color={c.textTertiary} size={9} />
                <Text style={[Type.strong, NUMERIC, { color: c.textTertiary }]}>
                  {set.claimedCoins.toLocaleString()}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.rewardRow,
                { borderColor: c.border, backgroundColor: c.surfaceSheet },
              ]}>
              <Text style={[Type.micro, { color: c.textTertiary }]}>
                {(() => {
                  const gap = (set.nextAt ?? set.required) - set.committed;

                  return gap === 1 ? '1 MORE CARD PAYS' : `${gap} MORE CARDS PAY`;
                })()}
              </Text>
              <View style={styles.coinRow}>
                <Coin color={gold} size={9} />
                <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                  {(set.nextReward ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {claimError ? (
            <View
              style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surfaceSheet }]}>
              <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
              <Text style={[Type.body, { color: c.text }]}>{claimError}</Text>
            </View>
          ) : null}
        </View>
        ) : null}

        {/* The last block inside the band, and NOTHING UNDER IT. `Tabs` puts
            its underline at the very bottom of its own box, so with no padding
            here the mark lands ON the band's hard edge — the relationship the
            masthead strip has with its hairline, where the rules read as marks
            on a baseline rather than as dashes floating above one. Any gap and
            the underline detaches from the edge and the strip stops reading as
            the bottom of the header. */}
        <View
          onLayout={(e) =>
            measure({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
          }>
          <SetFilters members={members} filter={filter} onFilter={onFilter} />
        </View>
      </SheetToneBand>

      <View style={styles.list}>

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
            <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {width === 0
                ? null
                : shown.slice(0, limit).map((m) => (
                    <MemberCard
                      key={m.card_id}
                      member={m}
                      width={cardWidth}
                      picked={chosen.has(m.card_id)}
                      onQuickAdd={() => onQuickAdd(m)}
                      // A card you cannot tick, and the two reasons are
                      // different: the set is full, or the selection already
                      // fills it. Either way the tick would be a refusal in
                      // waiting.
                      locked={submitting || full || (roomLeft === 0 && !chosen.has(m.card_id))}
                      onToggle={() => onToggle(m)}
                    />
                  ))}
            </View>

            {/* NAMED, NOT SILENT. A team set is ~30 cards and never reaches
                this; a position set is up to 398, and mapping all of them into
                a sheet's ScrollView costs a visible stall every time it opens —
                more so now that each one is a card rather than a row. A
                FlatList is not the fix here: the frame owns the scroll
                container, and nesting a VirtualizedList inside a ScrollView is
                an error rather than an optimisation.

                So the head is drawn and the rest is one press away. The button
                states the real total, because a grid that quietly stopped at 60
                would read as "this set has 60 cards" — and the number beside it
                is the whole point of the screen. */}
            {shown.length > limit ? (
              <Pressable
                onPress={() => setRaised({ filter, to: shown.length })}
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
                  : set.family === 'daily'
                    ? ' A daily is worth more than the sell button and less than the pack that dealt the cards, which is what makes it a good home for spares and a bad way to grind.'
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
          ? `Collected ${milestone.paid ?? milestone.coins} coins.`
          : milestone.reached
            ? `Ready to claim ${milestone.coins} coins.`
            : `${gap} more cards for ${milestone.coins} coins.`
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
      <View style={styles.coinRow}>
        <Coin color={milestone.claimed ? c.textTertiary : gold} size={8} />
        <Text style={[Type.fine, NUMERIC, { color: milestone.claimed ? c.textTertiary : c.text }]}>
          {(milestone.claimed ? (milestone.paid ?? milestone.coins) : milestone.coins).toLocaleString()}
        </Text>
      </View>
      <Text style={[Type.strong, styles.rungMark, { color: tone }]}>
        {milestone.claimed ? '✓' : milestone.reached ? '•' : '–'}
      </Text>
    </View>
  );
}

/**
 * One card on the checklist, in one of three states, drawn as the card it is.
 *
 * The three are told apart by the FRAME and by the line under it, never by
 * colour alone: a filled slot says IN SET, a fillable one says what the commit
 * pays, and a missing one is a grey-framed card with an em dash where the
 * figure goes and the whole cell at reduced opacity. All three survive
 * greyscale, which is the rule the tier frames and the filter chips already
 * follow.
 *
 * WHAT THE CARD SHOWS HERE, AND WHY IT IS NOT WHAT THE INVENTORY SHOWS:
 *
 *   frame     for a card you can add, the tier of the copy that would ACTUALLY
 *             BE BURNT — the server's choice, not yours (`commit_candidate`
 *             always takes the least valuable copy you hold). Drawing it is how
 *             that guarantee is made visible rather than merely true: ticking a
 *             player can cost you a bronze and can never cost you a gold.
 *
 *             A FILLED SLOT is framed in the positive tone instead, and it has
 *             to be. `set_checklist` reports `commit_tier` from a SPARE copy,
 *             so a filled slot where you happen to hold a second card was
 *             drawing a gold frame for a copy the set cannot take. "This one is
 *             in" is the only thing that frame should be saying.
 *
 *             A TICKED one takes the selection accent, for the same reason: it
 *             is about to be acted on, and that outranks what it is worth.
 *
 *             Grey is a card you hold no copy of at all.
 *   figure    the player's SEASON points, not the card's career total: half
 *             this list is players you do not own, who have no career here to
 *             report. `statLabel` says FP so it cannot be misread as TFP.
 *   the badge the state — see `StateBadge`. It replaced a caption under the
 *             frame, which is why nothing is drawn below the square now.
 *
 * The tier progress, the fixture and the injury designation are all left off.
 * Each is a fact about a copy in your hand and this screen is mostly about
 * cards that are not.
 *
 * THE CLUB IS BACK, and not by this screen's choice — `PlayerCard` draws it in
 * the corner opposite the position for every caller. It was argued off the
 * checklist once, on the grounds that a team set repeats the same three letters
 * on all twenty-nine cards and says what the set's own title already says, and
 * that is still true of a team set. It is wrong about a position set, where the
 * club is the fact that tells two receivers apart, and it is not worth a prop
 * on the card to make one screen's team sets a little quieter.
 *
 * TWO TARGETS, AND THE CHEAP ONE IS THE BIG ONE. The cell TICKS the card: the
 * batch is edited first and only the submit bar leads anywhere destructive, so
 * a mis-tap costs a second tap to undo. The plus badge is the other, much
 * smaller, and it opens the confirmation for that one card.
 *
 * A note here used to say there was only ever one target, and that the whole
 * cell could be it because there was nothing else to hit. Adding the badge
 * reverses that, and it is worth being deliberate about: the safe gesture keeps
 * the whole square and the one that leads to a dialog is a 22pt disc you have
 * to aim at. Wrong-footing the pair — a big quick-add and a small tick — would
 * be a burn button covering a card.
 */
/**
 * The mark laid on a slot's card: what this slot IS, in one glyph.
 *
 * A DISC AT THE CENTRE OF THE SQUARE, not a word under the card. The four
 * states used to be a caption below the frame — IN SET / ×3 ◆4 / ✓ SELECTED /
 * MISSING — which put a line of text under every cell in a grid of thirty, made
 * the cells a different height depending on which state they were in, and asked
 * the reader to go and read a label to learn something a colour could have told
 * them.
 *
 * IT IS A RING OVER A THIN SCRIM, NOT A COIN, and that is about a photograph
 * that does not exist yet. There is no licensed player art today, so the disc
 * sits on a grey silhouette and a solid fill costs nothing; the day an <Image>
 * lands behind it, a solid 25pt disc dead centre is a sticker over the player's
 * face. A translucent scrim with a coloured ring and a coloured glyph reads at
 * the same distance and lets the face through — and the scrim is the SCHEME's
 * own ground, black on dark and white on light, the same trick the card's own
 * scrims use so the ring colours stay legible either way.
 *
 * Each state has a shape AND a colour, never colour alone:
 *
 *   addable    a `+`, ringed in the page's own ink. It is a BUTTON.
 *   picked     a `✓` on a FILLED accent disc — the one state left deliberately
 *              solid, because it is the only one with an action pending and
 *              there are never many at once.
 *   committed  a `✓` ringed in the positive tone, and the frame is green too.
 *   missing    nothing at all; the card is grey and faded, which is what an
 *              empty slot in a sticker album looks like.
 *
 * Picked and committed are both ticks, so they lean on more than hue to
 * separate: one is filled and one is a ring, which survives a reader who cannot
 * tell gold from green.
 */
function StateBadge({
  glyph,
  ink,
  filled,
  scrim,
  size,
}: {
  glyph: string;
  /** The ring and the glyph. A filled badge uses it as the fill instead. */
  ink: string;
  /** Solid disc rather than a ring — the pending state only. */
  filled?: boolean;
  /** The scheme's own ground at low alpha, for the unfilled states. */
  scrim: string;
  /** Diameter. The cell scales it so the mark reads the same at any column. */
  size: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: filled ? ink : scrim,
          /* 1.5, the card frame's own weight at compact: a hairline ring
             disappears against a busy photograph, which is the case this whole
             treatment is built for. */
          borderWidth: filled ? 0 : 1.5,
          borderColor: ink,
        },
      ]}>
      <Text
        style={[
          styles.badgeGlyph,
          {
            color: filled ? '#000000' : ink,
            fontSize: Math.round(size * 0.5),
            lineHeight: Math.round(size * 0.7),
          },
        ]}>
        {glyph}
      </Text>
    </View>
  );
}

function MemberCard({
  member,
  width,
  picked,
  locked,
  onToggle,
  onQuickAdd,
}: {
  member: SetMember;
  width: number;
  picked: boolean;
  locked: boolean;
  onToggle: () => void;
  onQuickAdd: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  const addable = isAddable(member);
  const fp = member.season_fp === null ? null : Number(member.season_fp);

  const state = member.committed
    ? 'In this set'
    : addable
      ? `${member.held} held${picked ? ', selected' : ''}`
      : 'Missing';

  /* Scaled off the column, so the mark is the same fraction of a card at three
     across on a phone and seven on a wide window. Floored at 20, because below
     that a glyph inside a ring stops being either; capped at a QUARTER of the
     card, because the badge centres on the square now and anything taller
     reaches the name under it. */
  const badgeSize = Math.min(Math.round(width * 0.25), Math.max(20, Math.round(width * 0.22)));

  /* The scheme's own ground, at the alpha the card's own scrims settle on. It
     is what the ring sits on so the glyph never has to fight the picture. */
  const scrim = scheme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';

  /* THREE WEIGHTS, AND THE ORDER IS BY HOW MUCH IS STILL UP TO YOU.
   *
   *   picked     the loudest — the one filled disc. It is the only state with
   *              an action pending, and the submit bar is about to act on it.
   *   addable    a ring. An affordance, not a claim.
   *   committed  the quietest, though it is the most permanent: a positive
   *              ring, and the frame is already green. A solid green coin on
   *              every filled slot made a set that was going well look like a
   *              screen full of alerts.
   */
  const badge = member.committed ? (
    <StateBadge glyph="✓" ink={c.positive} scrim={scrim} size={badgeSize} />
  ) : !addable ? null : picked ? (
    <StateBadge glyph="✓" ink={accent} filled scrim={scrim} size={badgeSize} />
  ) : (
    /* THE ONLY THING ON THIS SCREEN THAT COMMITS ONE CARD. Everything else
       batches: the cell ticks, Autofill ticks many, and the bar at the bottom
       submits them behind a single confirmation. The plus is the shortcut for
       the case that does not want a batch — one card, one dialog, done — and it
       reaches the same confirmation and the same RPC, so there is exactly one
       destructive path in the feature and one place that describes it. */
    <Pressable
      onPress={onQuickAdd}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={
        `Add ${member.player_name} to this set now. Burns your ` +
        `${member.commit_tier ?? 'lowest'} copy for ${member.commit_value} coins.`
      }
      hitSlop={8}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <StateBadge glyph="+" ink={c.text} scrim={scrim} size={badgeSize} />
    </Pressable>
  );

  const card = (
    <PlayerCard
      size="compact"
      fixedWidth={false}
      accessibilityLabel={
        addable
          ? `${member.player_name}, ${member.position_abbreviation ?? 'no position'}, ` +
            `${member.team_abbreviation ?? 'no club'}. ${state}. Adding burns your ` +
            `${member.commit_tier ?? 'lowest'} copy for ${member.commit_value} coins.`
          : `${member.player_name}, ${member.position_abbreviation ?? 'no position'}, ` +
            `${member.team_abbreviation ?? 'no club'}. ${state}.`
      }
      frameColor={member.committed ? c.positive : picked ? accent : undefined}
      model={{
        playerName: member.player_name,
        positionAbbreviation: member.position_abbreviation,
        teamAbbreviation: member.team_abbreviation,
        // Null on a filled slot as well as on a missing one: the tier the
        // server reports there belongs to a spare copy, and `frameColor` above
        // is saying something else entirely.
        tier: member.committed ? null : member.commit_tier,
        careerFp: fp,
        statLabel: 'FP',
        nextTierAt: null,
      }}
      overlay={badge}
      /* NOTHING UNDER THE FRAME, and the way to say that is to say nothing.
         The state is the badge and the frame now, so a cell is a square and
         nothing else — the same shape the inventory's cells take.

         It passed `footer={null}` here, which was right when the card drew a
         default block and null was how you suppressed it. The card draws none
         of its own any more, so null had become a SUPPLIED footer that happened
         to be empty: 13pt of reserved line plus the column's 4pt gap under
         every cell, making this grid's cards 132 tall against the inventory's
         115 at the same width. Omitting the prop is what leaves the square
         bare. */
    />
  );

  /* Only an addable cell is a target. A committed one has nothing to do and a
     missing one has nothing to do it with, so making either pressable would be
     offering a gesture that does nothing. */
  if (!addable) {
    return <View style={[{ width }, !member.committed && styles.faded]}>{card}</View>;
  }

  return (
    <Pressable
      onPress={onToggle}
      disabled={locked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked, disabled: locked }}
      style={({ pressed }) => [
        { width },
        locked && styles.disabled,
        pressed && !locked && styles.pressed,
      ]}>
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  /* The glyphs are text characters rather than drawn shapes — a plus and a
     tick are two of the few marks a font renders better than four Views can,
     and this file already set `✓` as type when the state was a caption. */
  badgeGlyph: { fontWeight: '800', textAlign: 'center' },
  hero: { gap: Spacing.two },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rule: { flex: 1, minWidth: 0 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 3 },
  ghostBar: { position: 'absolute', left: 0, top: 0, opacity: 0.28 },
  rung: { position: 'absolute', top: 0, width: 2, height: 6 },

  /**
   * FILLED, not transparent, and that is what the tone band asks of anything
   * drawn on it. A bordered box with no background lets the wash through, so
   * the ladder and the reward row came out as tinted panels — the colour is
   * meant to be the header's, and these are the header's CONTENT. `surfaceSheet`
   * is the sheet's own fill, so they read exactly as they did before the band
   * existed: dark boxes on a coloured ground.
   */
  ladder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    overflow: 'hidden',
  },
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
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
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

  /* No `paddingTop`: the band above ends on a hard edge and the scroll
     container's own gap is the separation. */
  list: { gap: Spacing.two },
  actions: { gap: Spacing.two },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' },
  /* A card you do not own is present but not in the album yet. Opacity says
     that in one channel; the grey frame and the word MISSING say it in two
     more, so nothing here rests on the dimming alone. */
  faded: { opacity: 0.6 },
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
