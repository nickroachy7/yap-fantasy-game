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
import { StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards';
import {
  Colors,
  NUMERIC,
  Spacing,
  TierOrder,
  Type,
  getTierTheme,
  type CardTier,
} from '@/constants/theme';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { MenuButton, MenuHeading, MenuItem, ToggleButton } from '@/components/ui/MenuButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SORT_OPTIONS,
  type SortDir,
  type SortKey,
  type TierFilter,
} from './types';

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
 * The inventory's controls that are not the position chips: four round buttons
 * at the end of the row, where the trend board puts its up/down switch.
 *
 * FOUR BUTTONS, NOT ONE. Folding all four behind a single "FILTERS" button
 * would buy back another 100pt of the row, and it is the wrong trade: one
 * button for four unrelated jobs can only be labelled with the generic word, so
 * nothing on the row would say what is available, and the count of what is
 * applied would have to be inferred from a badge. Each filter wears its own
 * glyph instead, and the two that hold a choice drop a menu directly beneath
 * themselves — see `MenuButton`.
 *
 * THE GLYPHS ARE THE ACTION BAR'S, not new ones. `search`, `tiers`, `sort` and
 * `available` are four of the eleven that set already draws, and they were
 * drawn for exactly these four facets back when they were chips in that bar.
 *
 * SEARCH AND AVAILABLE OPEN NOTHING. Available is on or off, and search reveals
 * the field pinned below the row — a `TextInput` inside a menu that closes on
 * an outside press is a field you cannot scroll away from or tap beside.
 */
export function InventoryControls({
  searchable,
  searchOpen,
  onToggleSearch,
  searching,
  tier,
  onTier,
  tierTotal,
  tierCounts,
  sort,
  dir,
  onSort,
}: {
  /** False for a small collection, where the facets alone find anything. */
  searchable: boolean;
  searchOpen: boolean;
  onToggleSearch: () => void;
  /** True when something has actually been typed, so the button reads as on. */
  searching: boolean;
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
    <View style={styles.controls}>
      {searchable ? (
        <ToggleButton
          icon="search"
          label="Search your collection"
          on={searchOpen || searching}
          onPress={onToggleSearch}
        />
      ) : null}

      <MenuButton icon="tiers" label="Tier" active={tier !== 'ALL'}>
        {(close) => (
          <>
            <MenuHeading>Tier</MenuHeading>
            <MenuItem
              label="All tiers"
              selected={tier === 'ALL'}
              detail={String(tierTotal)}
              onPress={() => {
                onTier('ALL');
                close();
              }}
              accessibilityLabel={`All tiers, ${tierTotal} cards`}
            />
            {TierOrder.map((t) => {
              const theme = getTierTheme(t, scheme);
              return (
                <MenuItem
                  key={t}
                  selected={tier === t}
                  detail={String(tierCounts[t])}
                  /* The badge INSTEAD of a label, not beside one: it spells the
                     tier in letters itself — that is what makes it safe to use
                     where colour alone would not be — so a text label next to
                     it was the same word twice. */
                  glyph={<TierBadge tier={t} size="grid" />}
                  onPress={() => {
                    onTier(tier === t ? 'ALL' : t);
                    close();
                  }}
                  accessibilityLabel={`${theme.label} tier, ${tierCounts[t]} cards`}
                />
              );
            })}
          </>
        )}
      </MenuButton>

      {/* NOT closed on press, unlike the tier menu. Pressing the key you are
          already sorted by REVERSES it — see `pressSort` on the screen — so the
          menu has to stay open for the second press, and the caret beside the
          active row is what tells you which way it went. */}
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
    </View>
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
});
