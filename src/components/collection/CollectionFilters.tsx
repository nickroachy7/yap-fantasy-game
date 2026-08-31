/**
 * The inventory's filters, and the sheet that holds most of them.
 *
 * ONE ROW OF CONTROLS, AND IT IS THE PLAYERS BOARDS' ROW.
 *
 * This screen used to stack four: a strip of disclosure chips (Search, Tiers,
 * Available, Sort), then a tier row, then a position row, then a sort row — the
 * last three appearing and disappearing as their chips were pressed, so the
 * grid started at a different height depending on which of them you had opened.
 * The Players boards had solved the same problem already, with one row: the
 * shared position chips on the left and the page's own extra on the right.
 *
 * So the inventory now draws exactly that. `PositionFilter` — the same
 * component the trend and leaders boards use, not a copy of it — sits under the
 * section nav, and everything else moved into a sheet behind one button.
 *
 * WHAT THE POSITION CHIPS GAVE UP. The old row carried a count on every chip
 * (`QB 3`, `RB 4`), which the shared component does not. That was a real thing
 * to lose and it is the price of the two screens being the same control: a
 * count is meaningful over a collection you own and meaningless over the
 * directory, so the shared component cannot carry one. The tier chips inside
 * the sheet keep theirs, where there is room for them.
 *
 * WHY A SHEET RATHER THAN MORE ROWS. Tier, sort and search are
 * four controls used occasionally on a screen whose whole job is showing cards.
 * As rows they cost a third of a phone screen permanently; behind a button they
 * cost 28pt, and the button says how many of them are on. Nothing is hidden
 * that the screen does not otherwise report — `ResultLine` says what the
 * filters did, and the button's count says how many are doing it.
 *
 * The tier row is BOTH a summary strip and the tier filter — the counts a
 * player wants to read ("how many golds do I have?") and the control they want
 * to press are the same object, so splitting them would just duplicate the
 * numbers on screen. That is why it kept its counts inside the sheet.
 *
 * Tier is never signalled by colour alone: each chip carries a <TierBadge>,
 * which restates the tier as a word AND as rank pips that differ in count and
 * shape. Selection is likewise not colour-only — the selected chip gains a
 * heavier border.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards';
import { TierMark } from '@/components/cards/TierMark';
import {
  Colors,
  NUMERIC,
  Radius,
  Spacing,
  TierOrder,
  ControlDiameter,
  Type,
  getTierTheme,
  selectionAccent,
  type CardTier,
} from '@/constants/theme';
import { ActionIcon } from '@/components/shell/ActionBar';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { POS_FILTERS, type PosFilter } from '@/components/cards/PositionFilter';
import {
  MenuButton,
  MenuChips,
  MenuDivider,
  MenuHeading,
  MenuItem,
} from '@/components/ui/MenuButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SORT_OPTIONS,
  type JobFilter,
  type SortDir,
  type SortKey,
  type TierFilter,
} from './types';

/**
 * The row's control height, and it is `ControlDiameter` on purpose.
 *
 * The labelled button was 36 for one revision, on the reasoning that text wants
 * more room than a glyph and that 36 is nearer the platform's 44pt touch
 * target. Both true, and it made the row bulky: a 36pt button beside 32pt
 * circles is a row with two heights in it, and the taller one is carrying the
 * least urgent control on the screen.
 *
 * At `ControlDiameter` all three controls are one object height and the row
 * reads as a single strip. The touch target is not lost — `hitSlop` of 6 puts
 * this at 44pt to a thumb while it stays 32 to the eye, which is the same trade
 * `ActionDiameter`'s note describes.
 */
const TOOLBAR_HEIGHT = ControlDiameter;

function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function TierFilterRow({
  value,
  onChange,
  total,
  counts,
}: {
  value: TierFilter;
  onChange: (next: TierFilter) => void;
  total: number;
  counts: Record<CardTier, number>;
}) {
  const scheme = useScheme();

  return (
    <ChipRow>
      <Chip
        selected={value === 'ALL'}
        label="ALL TIERS"
        count={total}
        onPress={() => onChange('ALL')}
        accessibilityLabel={`All tiers, ${total} cards`}
      />
      {TierOrder.map((tier) => {
        const selected = value === tier;
        const t = getTierTheme(tier, scheme);

        return (
          <Chip
            key={tier}
            selected={selected}
            count={counts[tier]}
            onPress={() => onChange(selected ? 'ALL' : tier)}
            accessibilityLabel={`${t.label} tier, ${counts[tier]} cards`}>
            {/* Decorative here: the chip's own label already says the tier. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <TierBadge tier={tier} size="grid" />
            </View>
          </Chip>
        );
      })}
    </ChipRow>
  );
}

/**
 * The two round buttons and the Select button — everything on the row that is
 * not the stats box.
 *
 * ---------------------------------------------------------------------------
 * TWO CIRCLES, NOT ONE AND NOT THREE
 * ---------------------------------------------------------------------------
 *
 * ONE would have been a single "Filters" button, and the note this replaces
 * argued against it for a reason that still holds: one button for two unrelated
 * jobs can only wear the generic word, so nothing on the row would say what is
 * available. Narrowing and ORDERING are different verbs, and sort is the one
 * reached for on nearly every visit — burying it beside filters used
 * occasionally is the wrong trade.
 *
 * THREE was tried and is the version that breaks. Splitting the piles out from
 * position and tier gives two adjacent circles that are both narrowing verbs,
 * and no 16pt glyph distinguishes "which pile" from "which position". An
 * unlabelled circle can carry a category; it cannot carry a distinction that
 * fine. If the piles ever need to be one tap they belong on the row as a
 * labelled chip, never as a third anonymous circle.
 *
 * ---------------------------------------------------------------------------
 * THE PILES LEAD THE FILTER MENU, AND THAT IS THE WHOLE POINT OF IT
 * ---------------------------------------------------------------------------
 *
 * Fits a set, Starting and Spare are first, above position and tier, with their
 * counts. They are the only filters that answer the question the screen is
 * actually open for — what do I do with these — and every one of them is a fact
 * the app already held and used to reveal only inside a confirmation dialog,
 * after the player had guessed their way to a selection by hand.
 *
 * Position and tier follow, AS CHIP LINES RATHER THAN ROWS. They narrow by an
 * attribute of the card, which is a browsing tool on a screen whose job is
 * triage — and as `MenuItem`s the eleven of them ran the panel off the bottom
 * of a phone, so the last few options could only be reached by scrolling a menu.
 * Two lines of chips shows every one of them at once. See `MenuChips`.
 *
 * The piles keep their rows because they are the choice worth READING: four
 * options with counts and full-length names, where position and tier are
 * two-character words that only need to be findable.
 */
export function InventoryControls({
  job,
  onJob,
  jobCounts,
  offersReady,
  position,
  onPosition,
  positionCounts,
  tier,
  onTier,
  tierTotal,
  tierCounts,
  sort,
  dir,
  onSort,
}: {
  job: JobFilter;
  onJob: (next: JobFilter) => void;
  jobCounts: Record<Exclude<JobFilter, 'ALL'>, number>;
  /**
   * Whether the server has answered about sets yet. Until it has, Fits a set
   * shows NO count rather than a nought — see `use-offers`. A nought we cannot
   * stand behind is worse than no number, because zero is a real answer here
   * and the reader cannot tell the two apart.
   */
  offersReady: boolean;
  position: PosFilter;
  onPosition: (next: PosFilter) => void;
  positionCounts: Record<string, number>;
  tier: TierFilter;
  onTier: (next: TierFilter) => void;
  tierTotal: number;
  tierCounts: Record<CardTier, number>;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const scheme = useScheme();

  return (
    <>
      <MenuButton
        icon="tiers"
        label="Filter"
        active={job !== 'ALL' || position !== 'ALL' || tier !== 'ALL'}>
        {(close) => (
          <>
            <MenuHeading>Show</MenuHeading>
            <MenuItem
              label="Everything"
              selected={job === 'ALL'}
              onPress={() => {
                onJob('ALL');
                close();
              }}
            />
            {JOB_OPTIONS.map((o) => (
              <MenuItem
                key={o.job}
                label={o.label}
                selected={job === o.job}
                /* Fits a set alone can be unanswered; the other two are derived
                   on the client and always have a number. */
                detail={
                  o.job === 'set' && !offersReady ? undefined : String(jobCounts[o.job])
                }
                onPress={() => {
                  onJob(job === o.job ? 'ALL' : o.job);
                  close();
                }}
                accessibilityLabel={`${o.label}, ${jobCounts[o.job]} cards`}
              />
            ))}

            <MenuDivider />
            <MenuHeading>Position</MenuHeading>
            <MenuChips
              options={POS_FILTERS.map((p) => ({
                key: p,
                label: p === 'ALL' ? 'All' : p,
                /* No count on `All`: it is the total, which the header's
                   context line prints two rows up. Same reason the tier row's
                   `All` carries none. */
                count: p === 'ALL' ? undefined : (positionCounts[p] ?? 0),
                selected: position === p,
                /* Not closed on press — see `MenuChips`. Pressing the active
                   one releases it, the same as every other facet in the app. */
                onPress: () => onPosition(position === p ? 'ALL' : p),
                accessibilityLabel:
                  p === 'ALL' ? 'All positions' : `${p}, ${positionCounts[p] ?? 0} cards`,
              }))}
            />

            <MenuDivider />
            <MenuHeading>Tier</MenuHeading>
            <MenuChips
              options={[
                {
                  key: 'ALL',
                  label: 'All',
                  selected: tier === 'ALL',
                  onPress: () => onTier('ALL'),
                  accessibilityLabel: `All tiers, ${tierTotal} cards`,
                },
                ...TierOrder.map((t) => ({
                  key: t,
                  /* `TierMark`, NOT `TierBadge`. The badge spells the tier out
                     and draws its rank pips — `DIAMOND ◆◆◆◆` — which is right on
                     a card face and is four chips' worth of width in a panel
                     260pt wide: the four of them wrapped onto three lines.
                     The one-letter mark is the same object the stats box on the
                     row already uses, so the two agree, and tier is still not
                     signalled by colour alone — B, S, G and D are four distinct
                     glyphs. The word survives in the spoken label below. */
                  glyph: <TierMark tier={t} size={11} />,
                  count: tierCounts[t],
                  selected: tier === t,
                  onPress: () => onTier(tier === t ? 'ALL' : t),
                  accessibilityLabel: `${getTierTheme(t, scheme).label} tier, ${tierCounts[t]} cards`,
                })),
              ]}
            />

          </>
        )}
      </MenuButton>


      {/* SORT KEEPS ITS OWN CIRCLE, and for one revision it did not.

          Narrowing and ORDERING are different verbs, and sort is the control
          reached for on nearly every visit — burying it under a menu of filters
          used occasionally is the wrong trade. It was folded in anyway when the
          stats box grew to 206pt and the row could not pay for a second circle.
          Dropping the four tier counts to the account screen gave that width
          back, so the argument gets to win again.

          NOT closed on press, unlike the filter menu. Pressing the key you are
          already sorted by REVERSES it — see `pressSort` on the screen — so the
          panel has to survive the second press, and the caret beside the active
          row is what says which way it went. */}
      <MenuButton icon="sort" label="Sort" active={false}>
        {() => (
          <>
            <MenuHeading>Sort by</MenuHeading>
            {SORT_OPTIONS.map((o) => (
              <MenuItem
                key={o.key}
                label={o.label}
                selected={o.key === sort}
                detail={o.key === sort ? (dir === 'desc' ? '↓' : '↑') : undefined}
                onPress={() => onSort(o.key)}
                accessibilityLabel={
                  o.key === sort
                    ? `${o.label}, ${dir === 'desc' ? 'descending' : 'ascending'}. Press to reverse.`
                    : `Sort by ${o.label}`
                }
              />
            ))}
          </>
        )}
      </MenuButton>
    </>
  );
}

/** The piles, in the order the filter menu lists them. See `JobFilter`. */
const JOB_OPTIONS: { job: Exclude<JobFilter, 'ALL'>; label: string }[] = [
  { job: 'set', label: 'Fits a set' },
  { job: 'starting', label: 'Starting' },
  { job: 'spare', label: 'Spare' },
];

/**
 * The multi-select control, and it says the word.
 *
 * IT WAS AN UNLABELLED SQUARE. `ToggleButton` with the `select` glyph, sitting
 * at the end of a row of round filter buttons in exactly their visual language
 * — so the one control on the row that changes what a TAP DOES read as a fourth
 * thing that narrows the grid. Nobody found it. Everything else about
 * multi-select worked and none of it mattered, because the door had no sign.
 *
 * SO IT KEEPS THE GLYPH AND GAINS THE WORD. Both, not one: the icon is what
 * ties it to the two circles beside it, and the word is the entire fix.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT CARRY A COUNT, AND IT USED TO
 * ---------------------------------------------------------------------------
 *
 * For one revision this read "Select 19" whenever a filter was on, so that one
 * press armed the whole filtered pile. The press still does exactly that — see
 * `startSelecting` — and the LABEL was wrong about it.
 *
 * A toggle's label should say what the next press does, and what this press
 * does is enter a mode. "Select 19" answers a question nobody asked at the
 * moment they are asking a different one, and it makes a control that is
 * sometimes a verb and sometimes a quantity. The count is real and it belongs
 * where a count belongs: `BulkBar` says "19 selected" the instant the mode
 * opens, which is after the press rather than before it.
 *
 * ---------------------------------------------------------------------------
 * QUIET AT REST
 * ---------------------------------------------------------------------------
 *
 * Same surface and same hairline as the two round menus beside it — three
 * controls in one family, one of them wider because it carries a word. It was
 * gold-outlined at rest to mark it as the row's primary control, and that was
 * the wrong trade twice over: gold is the app's SELECTION accent everywhere
 * else, so a permanent gold edge claims a state before anything is selected,
 * and a row whose loudest object is a mode toggle is a row shouting about its
 * own machinery.
 *
 * THE GOLD ARRIVES WITH THE MODE. Border and glyph, not a fill: a filled button
 * at this size reads as a call to action, and what it actually is by then is a
 * switch that is on. The label stays white so the button does not restyle its
 * text on every press.
 */
export function SelectButton({
  on,
  onPress,
  disabled,
}: {
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scheme = useScheme();
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: disabled === true }}
      /* The spoken label carries what the fill cannot: which way the press
         goes. Sighted readers get that from the gold; nobody else would. */
      accessibilityLabel={on ? 'Stop selecting cards' : 'Select several cards'}
      hitSlop={6}
      style={({ pressed }) => [
        styles.select,
        {
          backgroundColor: c.backgroundElement,
          borderColor: on ? accent : c.border,
          borderWidth: on ? 1 : StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
        disabled && styles.dim,
      ]}>
      <ActionIcon
        name="select"
        color={on ? accent : c.textSecondary}
        focused={on}
        size={13}
      />
      <Text numberOfLines={1} style={[Type.label, { color: on ? c.text : c.textSecondary }]}>
        Select
      </Text>
    </Pressable>
  );
}

/**
 * The count under the facets.
 *
 * It used to carry the availability toggle as a chip on its right. The filter
 * sheet owns that toggle now, and two controls for one filter is how a screen
 * ends up disagreeing with itself — press one, and the other still reads as
 * off. What is left says what the filter DID, which a control cannot: "12 of 40
 * cards", and the count of what is being hidden.
 *
 * IT SAYS NOTHING WHEN THE FILTERS DID NOTHING, which is most of the time.
 * `shown === total` means no filter is narrowing anything, and the line then
 * read "33 cards" — a fact `CollectionSummary` prints two rows above it, in a
 * cell labelled CARDS. One number, twice, eight points apart.
 *
 * This is the component doing what its name says rather than a special case.
 * It reports what the FILTERS did; the summary reports what you own. When the
 * filters have done nothing, there is nothing here to report — and a line that
 * only appears once a filter is on is also how a reader learns the two are
 * connected.
 *
 * IT USED TO CARRY A SECOND LINE, "N ruled out, hidden", belonging to an
 * availability filter that is gone — the round button that drove it said
 * nothing a player could act on, and nobody worked out what it was for. With
 * no filter to hide anything on injury grounds there is no hidden count to
 * report, so the line went with the button.
 */
export function ResultLine({ shown, total }: { shown: number; total: number }) {
  const c = Colors[useScheme()];

  /* Nothing narrowed, nothing to say — see the header. Before the wrapper, so
     the caller's spacing is all that is left behind. */
  if (shown === total) return null;

  return (
    <View style={styles.resultLine}>
      <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
        {`${shown} of ${total} cards`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* `flexShrink: 0`, for the reason the trend board's switch has it: the chips
     beside these are given `flex: 1` and are the side that is supposed to give.
     They scroll; these do not. */
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, flexShrink: 0 },
  /* `Radius.control`, not `Radius.chip`: this is a button, and the box beside
     it is drawn at the same radius so the row's three objects agree. Height
     matches `STATS_HEIGHT` rather than `ControlDiameter` for the same reason —
     see `InventoryStats`. `flexShrink: 0` because the stats box is the side
     that gives. */
  /* `Radius.control` rather than `Radius.chip`: this is a button, not a value
     you pick. `flexShrink: 0` because the row's give is the spacer. */
  select: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    height: TOOLBAR_HEIGHT,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two + 1,
  },
  /* Same metrics as ChipRow's own content row — this one is a ScrollView the
     sort strip owns, because it has a label and a direction chip pinned either
     side of the scrolling part. */
  resultLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.45 },
});
