/**
 * The head of the Players board: which players, in what order, showing what.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACED
 * ---------------------------------------------------------------------------
 *
 * A section nav — SEARCH / TREND / TOP — plus a row of position chips, plus a
 * page-specific Up/Down switch. Three bands of furniture above the first
 * player, two of which were navigation between three pages that differed by a
 * sort key. See `board-view.ts` for why they are one board now.
 *
 * It is two bands, and each has one job:
 *
 *     WHICH PLAYERS   position chips · the facet menu · the way to search
 *     HOW THEY READ   the order, named in full — which is also what the
 *                     numbers on the rows are measuring
 *
 * That split is the reason the sort is a BAR and the other two are circles.
 * `BoardControls` on the leaderboard made the same call for the same reason and
 * the note there is worth not repeating: a control the width of the page reads
 * as the page's premise, which "ordered by market rank" is, while a round
 * button is this app's shorthand for "this opens a choice" rather than "this is
 * a value you can pick". A row of six sort pills was measured at ~520pt in a
 * 343pt row and opened clipped at both ends.
 *
 * NOTHING HERE SCROLLS WITH THE LIST. The board runs to a thousand rows, and
 * "what am I looking at, and can I change it" has to be answerable from row two
 * hundred.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { PositionFilter } from '@/components/cards/PositionFilter';
import {
  MenuBar,
  MenuButton,
  MenuChips,
  MenuDivider,
  MenuHeading,
  MenuItem,
} from '@/components/ui/MenuButton';
import { ActionIcon } from '@/components/shell/ActionBar';
import { SegmentedControl } from '@/components/shell/SegmentedControl';
import { Colors, ControlDiameter, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import {
  ORDERS,
  activeFilterCount,
  orderOf,
  sortLabel,
  variantOf,
  type BoardFilters,
  type BoardSort,
  type SortDir,
} from './board-view';

export function PlayerBoardControls({
  sort,
  dir,
  onSort,
  filters,
  onFilters,
  onSearch,
  /** Every club with a player in the pool, uppercase, already ordered. */
  teams,
}: {
  sort: BoardSort;
  dir: SortDir;
  onSort: (key: BoardSort, dir: SortDir) => void;
  filters: BoardFilters;
  onFilters: (next: BoardFilters) => void;
  onSearch: () => void;
  teams: string[];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const facets = activeFilterCount(filters);
  const order = orderOf(sort);
  const variant = variantOf(sort, dir);
  const set = (patch: Partial<BoardFilters>) => onFilters({ ...filters, ...patch });

  return (
    <View style={styles.wrap}>
      {/* WHICH PLAYERS. */}
      <View style={styles.row}>
        <View style={styles.flex}>
          <PositionFilter value={filters.pos} onChange={(pos) => set({ pos })} />
        </View>

        <MenuButton icon="filters" label="Filters" active={facets > 0}>
          {() => (
            <>
              {/* CLUB. Thirty-two chips, wrapped, which is more than any other
                  facet in the app puts in a panel — and it works for the one
                  reason a long chip grid ever does: they are alphabetical and
                  every label is two or three characters, so finding DET is
                  reading, not scanning. A menu of 32 rows would have been the
                  same information at six times the height. */}
              <MenuHeading>Club</MenuHeading>
              <MenuChips
                options={[
                  {
                    key: 'ALL',
                    label: 'Any',
                    selected: filters.team === null,
                    onPress: () => set({ team: null }),
                    accessibilityLabel: 'Any club',
                  },
                  ...teams.map((t) => ({
                    key: t,
                    label: t,
                    selected: filters.team === t,
                    onPress: () => set({ team: filters.team === t ? null : t }),
                    accessibilityLabel: `${t} only`,
                  })),
                ]}
              />

              <MenuDivider />

              {/* THIS WEEK. The only facet that decides a lineup: a man on a
                  bye cannot be started however good the rest of his row looks.
                  Reads off the same fixture map the rows print. */}
              <MenuHeading>This week</MenuHeading>
              <MenuChips
                options={[
                  {
                    key: 'all',
                    label: 'Any',
                    selected: filters.availability === 'all',
                    onPress: () => set({ availability: 'all' }),
                    accessibilityLabel: 'Playing or not',
                  },
                  {
                    key: 'playing',
                    label: 'Has a game',
                    selected: filters.availability === 'playing',
                    onPress: () => set({ availability: 'playing' }),
                    accessibilityLabel: 'Only players with a game this week',
                  },
                  {
                    key: 'idle',
                    label: 'On a bye',
                    selected: filters.availability === 'idle',
                    onPress: () => set({ availability: 'idle' }),
                    accessibilityLabel: 'Only players with no game this week',
                  },
                ]}
              />

              <MenuDivider />

              {/* IN CIRCULATION. The facet no other fantasy app could offer:
                  "nobody holds one of these yet" is a reason to open a pack,
                  and "there are forty out there" is a reason not to. */}
              <MenuHeading>Cards</MenuHeading>
              <MenuChips
                options={[
                  {
                    key: 'all',
                    label: 'Any',
                    selected: filters.circulation === 'all',
                    onPress: () => set({ circulation: 'all' }),
                    accessibilityLabel: 'Held or not',
                  },
                  {
                    key: 'owned',
                    label: 'In circulation',
                    selected: filters.circulation === 'owned',
                    onPress: () => set({ circulation: 'owned' }),
                    accessibilityLabel: 'Only players somebody holds a copy of',
                  },
                  {
                    key: 'unowned',
                    label: 'Nobody holds one',
                    selected: filters.circulation === 'unowned',
                    onPress: () => set({ circulation: 'unowned' }),
                    accessibilityLabel: 'Only players nobody holds a copy of',
                  },
                ]}
              />

              <MenuDivider />

              {/* EXPERIENCE, under its own heading rather than tacked onto the
                  end of the cards group, where it sat for one revision and read
                  as a fourth kind of card. It is a fact about the FOOTBALLER —
                  his first season — and the three chips beside it were facts
                  about how many copies of him exist. Two subjects under one
                  heading is a heading that has stopped meaning anything. */}
              <MenuHeading>Experience</MenuHeading>
              <MenuChips
                options={[
                  {
                    key: 'any',
                    label: 'Any',
                    selected: !filters.rookies,
                    onPress: () => set({ rookies: false }),
                    accessibilityLabel: 'Any experience',
                  },
                  {
                    key: 'rookies',
                    label: 'Rookies',
                    selected: filters.rookies,
                    onPress: () => set({ rookies: true }),
                    accessibilityLabel: 'Rookies only',
                  },
                ]}
              />
            </>
          )}
        </MenuButton>

        {/* THE WAY OUT TO SEARCH.
 
            A button rather than a field, because search stayed a full-screen
            takeover when the three routes merged — it is a tool you pick up
            with a name in mind and put down four seconds later, and the case
            for giving it the whole screen did not weaken. A round button is
            the same shorthand the two beside it use: this OPENS something.
 
            Not a `MenuButton`, which would want a panel. This is the one
            control on the row that navigates. */}
        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel="Search players by name, team or college"
          hitSlop={6}
          style={({ pressed }) => [
            styles.round,
            { backgroundColor: c.backgroundElement, borderColor: c.border },
            pressed && styles.pressed,
          ]}>
          <ActionIcon name="search" color={c.textSecondary} focused={false} />
        </Pressable>
      </View>

      {/* HOW THEY ARE ORDERED — and, with it, what the numbers on them are.
 
          TWO CONTROLS, AND THEY ARE NOT THE PAIR THIS ROW USED TO HOLD. It
          carried a bar naming the order and a three-way switch choosing what
          the rows showed — Value, Rank, Form — which were the same list twice
          and let a reader sit on a board sorted by a number it would not print.
          The order carries its own measure now; see `SORTS`.
 
          What is beside the bar instead is the READING — which of the order's
          two ways of being looked at — and it is here because it was in the
          wrong place. It lived inside the dropdown as a "Reverse" row on
          whichever order was active, so flipping a board (the most repeated
          action on this screen, and the whole of what the old trend page's
          Up/Down switch did) cost opening a menu, finding the row you were
          already on, and pressing it. It is one tap now, always visible, and it
          reads in the order's own words: Best/Worst, Up/Down, Total/Per game.

          IT IS ALSO WHAT LET THE MENU DROP FROM SIX ENTRIES TO THREE. Season
          points and Points per game were mirror images — the same three numbers
          on the row, differing only in which was the headline — and the switch
          on both of them offered a "Least" nobody has ever wanted. Two dead
          segments and one duplicated entry became one entry with two live
          readings. See `ORDERS`.
 
          THE BAR TAKES THE WIDTH and the switch keeps its size, for the reason
          every row in this app that mixes the two gives: a two-word switch
          cannot be narrowed to `U…`/`D…`, where a label you can push is merely
          narrower. */}
      <View style={styles.row}>
        <View style={styles.flex}>
          <MenuBar value={sortLabel(sort)} label="Order">
            {(close) => (
              <>
                {ORDERS.map((o) => (
                  <MenuItem
                    key={o.label}
                    label={o.label}
                    selected={o === order}
                    /* The unit its FIRST reading puts on the row, which is the
                       one you get by picking it. The three differ by measure and
                       not only by sequence, and a list of bare names hides
                       that. */
                    detail={o.variants[0].unit}
                    onPress={() => {
                      /* Picking the order you are already on is a no-op rather
                         than a reset: the switch beside this is what changes the
                         reading, and a menu that silently snapped back to the
                         first one would fight it. */
                      if (o !== order) onSort(o.variants[0].sort, o.variants[0].dir);
                      close();
                    }}
                  />
                ))}
              </>
            )}
          </MenuBar>
        </View>

        {/* THE READING, not the direction — see `ORDERS`. On two of the three
            orders the two readings are the same measure from either end, and on
            the third they are two measures; the control does not know the
            difference and does not need to. */}
        <SegmentedControl<string>
          compact
          segments={order.variants.map((v) => ({ value: v.label, label: v.label }))}
          value={variant.label}
          onChange={(label) => {
            const next = order.variants.find((v) => v.label === label);
            if (next) onSort(next.sort, next.dir);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Matches the rows' own gutter, so the controls line up with the names under
     them rather than sitting two points inside. The list runs edge to edge and
     hands the gutter back to whatever sits above it. */
  wrap: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* `minWidth: 0` is load-bearing on both rows: without it a scrolling chip
     strip reports its full content width as its minimum and pushes the round
     buttons off the row instead of scrolling inside what is left. */
  flex: { flex: 1, minWidth: 0 },
  round: {
    width: ControlDiameter,
    height: ControlDiameter,
    borderRadius: ControlDiameter / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pressed: { opacity: 0.6 },
});
