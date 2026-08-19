/**
 * The swap. One component, two presentations, two directions.
 *
 * WHAT REPLACED WHAT
 *
 * The picker used to expand in place, underneath the slot you tapped. That
 * reads well in a mockup and badly on a phone: opening RB1 pushed every row
 * below it off-screen, so the eight-row board you were comparing against
 * disappeared at the moment of choosing, and the list you scrolled through had
 * the rest of the lineup interleaved behind it. It also had no bench-side
 * equivalent — starting a bench player was a tap that silently picked a slot
 * for you.
 *
 * So: a sheet. On a phone it rises from the bottom edge, which is where the
 * thumb already is and where every other iOS and Android picker comes from. On
 * a wide window it is a centred dialog, because a full-width bar sliding up
 * under a 1400pt browser window is a phone gesture wearing a desktop's clothes,
 * and the pointer is not near the bottom edge anyway.
 *
 * TWO DIRECTIONS, ONE SHEET
 *
 *   slot   — "who starts at RB1". Lists every eligible card, with the incumbent
 *            pinned above the list rather than buried in it, and a way to empty
 *            the slot outright.
 *   bench  — "where does this player go". Lists the slots he is legal for and
 *            says who is in each one, so replacing a starter is a choice you
 *            make rather than something that happens to you.
 *
 * They are one component because they are one interaction seen from either end,
 * and because two sheets would drift in exactly the ways a modal must not:
 * dismissal, safe-area padding, and what the backdrop does.
 *
 * AND THEY ARE THE SAME SHAPE
 *
 * Both modes read: the subject pinned at the top under a label, then a labelled
 * list of what you are choosing between, in ONE set of columns. The bench mode
 * used to be a different object — taller rows, its own typography, its own
 * FP/G pair written as a sentence — so the same decision looked like two
 * unrelated screens depending on which end you started from. Now a destination
 * is drawn by the same `CardRow` as a candidate, with the slot in the lead
 * column where the `IN` mark sits on the other side, and an unoccupied slot
 * uses the row's own empty state. You are always comparing like with like down
 * the same columns.
 *
 * The Modal-with-sibling-backdrop construction is the same as `DropdownChip`
 * and `ConfirmDialog` — a Pressable WRAPPING the sheet renders a <button>
 * containing <button>s on web, which React rejects at runtime.
 */
import { useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DASH } from '@/components/ui/DataTable';
import { PositionBadge, positionsForSlot } from '@/components/ui/PositionBadge';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { CardRow, CardRowHeader } from './CardRow';
import { SortBar } from './SortBar';
import { matchupLabel, type LineupCard, type SortKey } from './model';

/** A slot this bench player is legal for, and whoever is currently in it. */
export type SwapDestination = { slot: string; occupant: LineupCard | null };

/**
 * What the sheet is being asked. The screen holds only the identity of the
 * thing that was tapped and rebuilds this on render, so the contents stay in
 * step with an edit made from somewhere else rather than going stale.
 */
export type SwapRequest =
  | {
      kind: 'slot';
      slot: string;
      /** "RB", or "RB/WR/TE" for a FLEX. Used in the empty and heading copy. */
      eligiblePositions: string;
      current: LineupCard | null;
      /** Eligible cards, already sorted. May include `current`; it is filtered. */
      options: LineupCard[];
    }
  | { kind: 'bench'; card: LineupCard; destinations: SwapDestination[] };

export function SwapSheet({
  request,
  wide,
  sort,
  onSort,
  onPick,
  onClear,
  onClose,
}: {
  /** Null when nothing is open. The Modal stays mounted and simply not visible. */
  request: SwapRequest | null;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onPick: (slot: string, cardId: string) => void;
  onClear: (slot: string) => void;
  onClose: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { bottom } = useSafeAreaInsets();

  /* Escape closes it on web. `onRequestClose` covers Android's back button and
     nothing else — react-native-web does not map the key — so a keyboard user
     on a desktop browser had no way out but the mouse. */
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onClose]);

  const title =
    request === null
      ? ''
      : request.kind === 'slot'
        ? `Start at ${request.slot}`
        : `Move ${request.card.name}`;

  return (
    <Modal
      visible={request !== null}
      transparent
      // Slide on a phone because the sheet comes from the edge it is anchored
      // to; fade on a dialog, which has no edge to come from.
      animationType={wide ? 'fade' : 'slide'}
      onRequestClose={onClose}>
      <View style={[styles.backdrop, wide ? styles.backdropCentre : styles.backdropBottom]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            wide ? styles.dialog : styles.bottomSheet,
            { backgroundColor: c.surface, borderColor: c.borderStrong },
          ]}>
          {/* The grab handle is decoration — this sheet is not draggable — but
              it is the standard mark for "this came from the bottom and goes
              back there", and its absence made the panel read as a page. */}
          {wide ? null : <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />}

          {request === null ? null : (
            <>
              <View style={styles.header}>
                {request.kind === 'slot' ? (
                  <PositionBadge
                    label={request.slot}
                    positions={positionsForSlot(request.slot)}
                    size={30}
                  />
                ) : (
                  <PositionBadge label={request.card.position} size={30} />
                )}
                <View style={styles.headerText}>
                  <Text numberOfLines={1} style={[Type.section, { color: c.text }]}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                    {request.kind === 'slot'
                      ? `${request.options.filter((o) => o.id !== request.current?.id).length} eligible ${request.eligiblePositions}`
                      : `${request.card.team ?? DASH} · ${matchupLabel(request.card.game)}`}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.close,
                    { borderColor: c.border },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[Type.strong, { color: c.textSecondary }]}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollBody}
                showsVerticalScrollIndicator={false}>
                {request.kind === 'slot' ? (
                  <SlotBody
                    request={request}
                    wide={wide}
                    sort={sort}
                    onSort={onSort}
                    onPick={onPick}
                    onClear={onClear}
                  />
                ) : (
                  <BenchBody request={request} wide={wide} onPick={onPick} />
                )}
              </ScrollView>
            </>
          )}

          {/* A bottom sheet's own dismiss control belongs at the bottom, under
              the thumb. The dialog has the ✕ and the Escape key and does not
              need a second one taking up a row. */}
          {wide ? null : (
            <View style={[styles.footer, { borderColor: c.border, paddingBottom: bottom || Spacing.two }]}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close without changing anything"
                style={({ pressed }) => [
                  styles.footerButton,
                  { backgroundColor: c.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <Text style={[Type.strong, { color: c.text }]}>Close</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** "Who starts here." */
function SlotBody({
  request,
  wide,
  sort,
  onSort,
  onPick,
  onClear,
}: {
  request: Extract<SwapRequest, { kind: 'slot' }>;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onPick: (slot: string, cardId: string) => void;
  onClear: (slot: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { slot, current, eligiblePositions } = request;

  /* The incumbent is pinned above, so he is not also in the list — one player
     appearing twice in a list you are choosing from is a bug report waiting to
     be filed, however it is marked. */
  const options = request.options.filter((o) => o.id !== current?.id);

  return (
    <>
      {current ? (
        <View style={styles.section}>
          <SectionLabel>In this slot now</SectionLabel>
          <View style={[styles.pinned, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
            <CardRow
              wide={wide}
              card={current}
              selected
              accessibilityLabel={`${current.name} is starting at ${slot}`}
              lead={<Text style={[Type.micro, { color: c.positive }]}>IN</Text>}
            />
            <Pressable
              onPress={() => onClear(slot)}
              accessibilityRole="button"
              accessibilityLabel={`Bench ${current.name} and leave ${slot} empty`}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
              <Text style={[Type.fine, { color: c.negative }]}>
                Bench {current.name} — leave {slot} empty
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SortBar
          value={sort}
          onChange={onSort}
          hint={current ? 'REPLACE WITH' : `CHOOSE A ${eligiblePositions.toUpperCase()}`}
        />
        {options.length === 0 ? (
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            {current
              ? `No other ${eligiblePositions} card in your collection can start here.`
              : `Nothing in your collection can start at ${slot}.`}
          </Text>
        ) : (
          <>
            <CardRowHeader wide={wide} leadLabel="" />
            {options.map((card) => (
              <CardRow
                key={card.id}
                wide={wide}
                card={card}
                onPress={() => onPick(slot, card.id)}
                accessibilityLabel={
                  current
                    ? `Start ${card.name} at ${slot} in place of ${current.name}`
                    : `Start ${card.name} at ${slot}`
                }
              />
            ))}
          </>
        )}
      </View>
    </>
  );
}

/**
 * "Where does this player go."
 *
 * Every legal slot is listed, taken ones included. A bench player whose slots
 * are all full is the ordinary case — three good running backs, two slots — and
 * a sheet that showed nothing there would be answering a question nobody asked.
 * What it shows instead is who he would replace, which is the actual decision.
 */
function BenchBody({
  request,
  wide,
  onPick,
}: {
  request: Extract<SwapRequest, { kind: 'bench' }>;
  wide: boolean;
  onPick: (slot: string, cardId: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { card, destinations } = request;

  if (destinations.length === 0) {
    return (
      <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
        {card.position
          ? `No slot in this lineup accepts a ${card.position}.`
          : 'This card has no position, so it cannot be started.'}
      </Text>
    );
  }

  return (
    <>
      {/* The mirror of the slot mode's pinned incumbent: the player the sheet
          is about, in the same box, under the same kind of label. */}
      <View style={styles.section}>
        <SectionLabel>Moving</SectionLabel>
        <View style={[styles.pinned, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <CardRow
            wide={wide}
            card={card}
            selected
            accessibilityLabel={`${card.name} is on the bench`}
            lead={<Text style={[Type.micro, { color: c.textSecondary }]}>OUT</Text>}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>Send him to</SectionLabel>
        {/* Every legal slot, taken ones included. A bench player whose slots are
            all full is the ordinary case — three good running backs, two slots —
            and a sheet that showed nothing there would be answering a question
            nobody asked. What it shows instead is who he would replace, in the
            columns you would compare them in. */}
        <CardRowHeader wide={wide} leadLabel="SLOT" />
        {destinations.map(({ slot, occupant }) => (
          <CardRow
            key={slot}
            wide={wide}
            card={occupant}
            emptyPrimary={`${slot} is empty`}
            emptySecondary="Nothing is starting here yet"
            onPress={() => onPick(slot, card.id)}
            accessibilityLabel={
              occupant
                ? `Start ${card.name} at ${slot} in place of ${occupant.name}`
                : `Start ${card.name} at ${slot}, which is empty`
            }
            lead={
              <Text
                numberOfLines={1}
                style={[Type.micro, { color: occupant ? c.text : c.textSecondary }]}>
                {slot}
              </Text>
            }
          />
        ))}
      </View>
    </>
  );
}

/** One label, one treatment, so both modes are read the same way. */
function SectionLabel({ children }: { children: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text style={[Type.micro, styles.sectionLabel, { color: c.textTertiary }]}>
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropCentre: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  sheet: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  /* Tall enough to be the screen while leaving the board visible above it —
     the whole reason this is a sheet and not a route. */
  bottomSheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomWidth: 0,
  },
  dialog: { width: '100%', maxWidth: 620, maxHeight: '84%', borderRadius: 16 },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.one + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 4,
    paddingBottom: Spacing.two,
  },
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `flexShrink` rather than `flex: 1`: a two-option sheet should be two
     options tall, not 88% of the screen with white space under it. */
  scroll: { flexShrink: 1 },
  scrollBody: { paddingBottom: Spacing.two },
  section: { gap: Spacing.one },
  sectionLabel: { paddingHorizontal: Spacing.two + 2, paddingTop: Spacing.two },
  pinned: {
    marginHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  clear: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.two },
  empty: { padding: Spacing.three },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  footerButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
