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
 * is drawn by the same `PlayerBand` as a candidate, with the slot as the badge
 * — exactly where the lineup board puts it — and an unoccupied slot uses the
 * band's own empty state. You are always comparing like with like.
 *
 * AND THEY ARE THE SAME ROWS YOU CAME FROM
 *
 * The sheet lists `PlayerBand`: the lineup row's identity band, without the
 * stat strip under it. It used to draw its own compact table row, so opening a
 * swap re-rendered the same eight players in a second format at the exact
 * moment you were comparing them. One figure survives the loss of the columns,
 * and it follows the sort — see `figureFor`.
 *
 * The Modal-with-sibling-backdrop construction is the same as `DropdownChip`
 * and `ConfirmDialog` — a Pressable WRAPPING the sheet renders a <button>
 * containing <button>s on web, which React rejects at runtime.
 */
import { useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DASH } from '@/components/ui/DataTable';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { BADGE_SIZE, BADGE_WIDTH, PlayerBand, WeekFigure } from './LineupRow';
import { SortBar } from './SortBar';
import { matchupLabel, weekFigureFor, type LineupCard, type SortKey } from './model';

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
      /**
       * Which of those have kicked off and so cannot be brought in.
       *
       * They are listed rather than withheld. Filtering them out left the sheet
       * saying "0 eligible RB" and "no other RB card in your collection can
       * start here" to somebody holding four of them, which reads as a broken
       * screen rather than as a rule — and the rule is one the reader needs to
       * learn, because it governs the whole afternoon.
       */
      lockedIds: Set<string>;
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
            /* `surfaceSheet`, the same layer both profile sheets and the set
               checklist sit on. This was `surface` — a panel's fill, one step
               too high — while the profile sheet was `background`, one step too
               low, so the app's two sheets disagreed about what a sheet is
               made of. One token now, and neither can drift. */
            { backgroundColor: c.surfaceSheet, borderColor: c.borderStrong },
          ]}>
          {/* The grab handle is decoration — this sheet is not draggable — but
              it is the standard mark for "this came from the bottom and goes
              back there", and its absence made the panel read as a page. */}
          {/* Same weight as the profile sheets' grabber — one bar, one colour,
              and `borderStrong` was too faint to find. See `PlayerSheetFrame`. */}
          {wide ? null : <View style={[styles.handle, { backgroundColor: c.textTertiary }]} />}

          {request === null ? null : (
            <>
              {/* Centred, and without a badge or a ✕ on a phone.
                  The badge said the same thing as the badge on the subject row
                  two lines below it, and the ✕ duplicated the Close button at
                  the bottom — where a thumb already is. What is left is the one
                  sentence the sheet is about. */}
              <View style={styles.header}>
                <Text numberOfLines={1} style={[Type.section, styles.title, { color: c.text }]}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={[Type.fine, styles.title, { color: c.textTertiary }]}>
                  {request.kind === 'slot'
                    ? countLabel(request)
                    : `${request.card.team ?? DASH} · ${matchupLabel(request.card.game)}`}
                </Text>
                {/* A dialog has no drag and no bottom Close, so it keeps one. */}
                {wide ? (
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
                ) : null}
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
  const { slot, current, eligiblePositions, lockedIds } = request;

  /* The incumbent is pinned above, so he is not also in the list — one player
     appearing twice in a list you are choosing from is a bug report waiting to
     be filed, however it is marked. */
  const rest = request.options.filter((o) => o.id !== current?.id);
  /* Choosable first, kicked-off after. Not two separate lists with two
     headings: they are the same set of players answering the same question, and
     the only difference is whether the answer is still available — which the
     dimming and the mark already say, in place. */
  const open = rest.filter((o) => !lockedIds.has(o.id));
  const shut = rest.filter((o) => lockedIds.has(o.id));

  return (
    <>
      {current ? (
        <View style={styles.section}>
          {/* THE CURRENT PICK GETS ITS OWN HEADING. It used to be pinned above
              the divider with no label and a tinted background, which made it
              read as a banner rather than as the first of two groups. Naming it
              is what turns the sheet into the shape it describes: who is in,
              then who could be. */}
          <Divider>Currently starting</Divider>
          <PlayerBand
            card={current}
            badge={<PositionBadge label={current.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(current)} />}
            selected
            accessibilityLabel={`${current.name} is starting at ${slot}`}
          />
          <ClearRow slot={slot} name={current.name} onPress={() => onClear(slot)} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Divider>
          {current ? 'Choose a replacement' : `Choose a ${eligiblePositions}`}
        </Divider>
        {/* Only when there is something to sort. Three keys offered over a
            list of one is the sheet describing its own machinery — and with a
            single eligible card it was the widest, loudest thing on screen.
            No hint either: the divider above already says what this list is. */}
        {open.length > 2 ? <SortBar value={sort} onChange={onSort} /> : null}
        {open.length === 0 ? (
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            {shut.length > 0
              ? `Every other ${eligiblePositions} card you hold has already kicked off.`
              : current
                ? `No other ${eligiblePositions} card in your collection can start here.`
                : `Nothing in your collection can start at ${slot}.`}
          </Text>
        ) : null}

        {open.map((card) => (
          <PlayerBand
            key={card.id}
            card={card}
            badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(card)} />}
            onPress={() => onPick(slot, card.id)}
            accessibilityLabel={
              current
                ? `Start ${card.name} at ${slot} in place of ${current.name}`
                : `Start ${card.name} at ${slot}`
            }
          />
        ))}

        {/* Shown, dimmed, and not pressable. See `lockedIds` on the request for
            why they are here at all rather than filtered away. */}
        {shut.map((card) => (
          <PlayerBand
            key={card.id}
            card={card}
            dimmed
            badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(card)} />}
            accessibilityLabel={`${card.name} has already started and cannot be brought in`}
          />
        ))}
      </View>
    </>
  );
}

/**
 * Take the current starter out and leave the slot empty.
 *
 * It was a line of small red text sitting between the player and the divider —
 * `Bench Dallas Goedert — leave TE empty` — with no border, no target and no
 * shape. On a sheet where everything else is a row, the one thing that was not
 * a row was the only destructive action on it, and red text with no affordance
 * reads as an error message about something that already happened rather than a
 * button offering to do it.
 *
 * So it is a row, in the same rhythm as the players above and below it: same
 * badge column, same two-line block, same press. What it says in that badge is
 * a dashed outline — the shape of a slot with nobody in it, which is exactly
 * what pressing it produces.
 *
 * THE COLOUR IS ON THE VERB ONLY. `ConfirmDialog` is the house rule here —
 * destructive is one coloured thing, not a coloured paragraph — so the action
 * carries the negative and the consequence underneath is stated in plain
 * secondary text. The old version put every word in red, including the player's
 * name, which made benching a tight end look like a data loss warning.
 */
function ClearRow({
  slot,
  name,
  onPress,
}: {
  slot: string;
  name: string;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Bench ${name} and leave ${slot} empty`}
      style={({ pressed }) => [
        styles.clearRow,
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.clearBadgeCol}>
        {/* Neutral, not red. The rule cited above is that destructive is ONE
            coloured thing, and the verb is it — a red badge as well makes two,
            and puts the loudest of them in the column the eye scans down to
            compare positions. The dashes carry the meaning here; the colour is
            not doing any of the work. */}
        <View style={[styles.clearBadge, { borderColor: c.border }]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>–</Text>
        </View>
      </View>
      <View style={styles.clearLines}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.negative }]}>
          Leave {slot} empty
        </Text>
        <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
          {name} goes back to your bench
        </Text>
      </View>
    </Pressable>
  );
}

/** "3 eligible RB", and what it does when some of them have kicked off. */
function countLabel(request: Extract<SwapRequest, { kind: 'slot' }>): string {
  const rest = request.options.filter((o) => o.id !== request.current?.id);
  const open = rest.filter((o) => !request.lockedIds.has(o.id)).length;
  const shut = rest.length - open;
  const head = `${open} eligible ${request.eligiblePositions}`;
  return shut > 0 ? `${head} · ${shut} locked` : head;
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
      {/* The mirror of the slot mode's incumbent: the player the sheet is about,
          in the same row, under his own heading. */}
      <View style={styles.section}>
        <Divider>Moving</Divider>
        <PlayerBand
          card={card}
          badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
          right={<WeekFigure {...weekFigure(card)} />}
          selected
          accessibilityLabel={`${card.name} is on the bench`}
        />
      </View>

      <View style={styles.section}>
        <Divider>Send him to</Divider>
        {/* Every legal slot, taken ones included. A bench player whose slots are
            all full is the ordinary case — three good running backs, two slots —
            and a sheet that showed nothing there would be answering a question
            nobody asked. What it shows instead is who he would replace, in the
            columns you would compare them in. */}
        {destinations.map(({ slot, occupant }) => (
          /* The badge IS the slot here, exactly as it is on the lineup board —
             so "where would he go" is answered by the same mark that answers
             "where is this player now" one screen back. */
          <PlayerBand
            key={slot}
            card={occupant}
            badge={
              <PositionBadge
                label={slotBadgeLabel(slot)}
                positions={positionsForSlot(slot)}
                size={BADGE_SIZE}
                width={BADGE_WIDTH}
                tone="neutral"
              />
            }
            right={<WeekFigure {...weekFigure(occupant)} />}
            emptyPrimary={`${slot} is empty`}
            emptySecondary="Nothing is starting here yet"
            onPress={() => onPick(slot, card.id)}
            accessibilityLabel={
              occupant
                ? `Start ${card.name} at ${slot} in place of ${occupant.name}`
                : `Start ${card.name} at ${slot}, which is empty`
            }
          />
        ))}
      </View>
    </>
  );
}

/**
 * The one figure a band shows, chosen to agree with the SORT.
 *
 * The band has room for a single number where the old table row had three
 * columns. Pinning it to season FP while the list was sorted by FP/G would put
 * the rows in an order the numbers on them do not explain, which is worse than
 * showing less.
 */
/**
 * The right-hand figure, which is the LINEUP ROW'S figure and nothing else.
 *
 * It used to be the card's season total — `198.2 FP` — under a sort that could
 * switch it to points per game. That was the same quantity the row already
 * carries two lines down as `2610.0 TFP`, so the sheet printed a card's career
 * production twice and its week not at all, in the one column the board uses
 * for the week.
 *
 * Now it is `weekFigureFor` over the player's own line, which is exactly what a
 * bench row shows on the board: a dash before kickoff, the running total while
 * he plays, the final figure after — with PROJ reserved underneath.
 *
 * The player's line and not a slot's credit, deliberately. A sheet has no slot
 * points to read and does not need them: the two agree the moment a sweep runs,
 * and what the reader is weighing here is players against each other.
 *
 * `sort` still orders the list — best option first is worth having — it simply
 * no longer decides what the column says.
 */
function weekFigure(card: LineupCard | null) {
  const value = weekFigureFor(card?.form?.weekFp ?? null, card?.game ?? null);
  return {
    points: value === null ? null : value.toFixed(1),
    status: card?.game?.status ?? null,
  };
}

/**
 * The break between the player the sheet is ABOUT and the list you are choosing
 * from.
 *
 * A centred caption between two rules, rather than the left-aligned micro label
 * that used to sit above each section. Two stacked labels plus a sort row made
 * three bands of 9pt uppercase furniture between the subject and the first
 * option; this is one, and being centred it reads as a divider rather than as
 * another heading competing with the title.
 */
function Divider({ children }: { children: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.divider}>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
      <Text style={[Type.micro, { color: c.textTertiary }]}>⇅ {children.toUpperCase()}</Text>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
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
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.two + 4,
    paddingBottom: Spacing.three,
  },
  title: { textAlign: 'center' },
  /* Floated, so the centred title is centred on the SHEET rather than on
     whatever space a control in the same row happens to leave it. */
  close: {
    position: 'absolute',
    right: Spacing.three,
    top: Spacing.two,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  /* The player rows' own geometry: `Spacing.three` gutter, a BADGE_WIDTH column,
     a Spacing.two gap. Anything else and the left edge of this row would not
     line up with the left edge of the player it is about. */
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  clearBadgeCol: { width: BADGE_WIDTH, alignItems: 'center' },
  /* Dashed, because the badge is drawing the ABSENCE of a player — a solid
     outline here would read as one more position badge in the column. */
  clearBadge: {
    width: BADGE_SIZE + 8,
    height: BADGE_SIZE,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLines: { flex: 1, minWidth: 0, gap: 2 },
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
