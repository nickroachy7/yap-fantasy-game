/**
 * A round icon button, and the menu it drops directly underneath itself.
 *
 * ANCHORED, NOT CENTRED, WHICH IS THE WHOLE POINT
 *
 * The obvious way to build this is the way `DropdownChip` and `ConfirmDialog`
 * already do: a panel centred in the screen over a dimmed backdrop. That is the
 * shape of a CONFIRMATION — it says the screen behind is suspended and wants an
 * answer — and spending it on "sort by name" makes a lightweight choice feel
 * like an interruption. It also severs the panel from the control that summoned
 * it, so nothing on screen says which button you pressed.
 *
 * A menu should read as an extension of the thing you pressed. This one is
 * measured against its trigger and drawn immediately below it, aligned to its
 * right edge, so the panel is visibly attached to the button and the rest of
 * the screen stays where it was.
 *
 * WHY IT IS STILL A MODAL UNDERNEATH. An absolutely-positioned View is clipped
 * by any scroll container above it, and every one of these sits over a list —
 * the same constraint `DropdownChip` documents. The Modal is a transparent
 * layer for positioning, not a dialog: nothing is dimmed, and a press anywhere
 * outside dismisses it.
 *
 * ROUND, AND THAT IS NOT DECORATION. These sit at the end of a row of square
 * chips. A round button is the app's shorthand for "this does something" rather
 * than "this is a value you can pick" — the chips beside them hold a state, and
 * these open a choice or flip a switch. A fifth and sixth rectangle on that row
 * would have read as two more positions.
 *
 * TWO TRIGGERS, ONE MENU. `MenuBar` is the same anchored panel hung off a
 * full-width bar instead of a circle, for the one choice on a screen that IS
 * the screen's subject — the leaderboard's board picker. The positioning, the
 * dismissal and the items are shared through `useAnchor` and `AnchoredPanel`
 * below, because two copies of "measure the trigger, drop a Modal under it" is
 * the drift this file already argues against.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { ActionIcon, type ActionIconName } from '@/components/shell/ActionBar';
import { Chip } from '@/components/ui/Chip';
import {
  Colors,
  ControlDiameter,
  NUMERIC,
  Radius,
  Spacing,
  Type,
  selectionAccent,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Diameter, shared with the action bar's detached button. See the theme. */
const SIZE = ControlDiameter;
/** Gap between the button's bottom edge and the panel's top. */
const DROP = 6;
/** Keeps a right-aligned panel from touching the screen edge. */
const MARGIN = Spacing.two;

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Measure the trigger on PRESS and hold the result while the menu is open.
 *
 * On press rather than on layout: a trigger in a row that scrolls, on a screen
 * whose header can change height, has no position worth caching — and measuring
 * once at mount is how a menu ends up opening where the button used to be.
 */
function useAnchor() {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = useCallback(() => {
    trigger.current?.measureInWindow((x, y, width, height) =>
      setAnchor({ x, y, width, height }),
    );
  }, []);
  const close = useCallback(() => setAnchor(null), []);

  return { trigger, anchor, open, close };
}

/**
 * The panel itself: a transparent Modal used for POSITIONING, not as a dialog.
 *
 * An absolutely-positioned View is clipped by any scroll container above it,
 * and every one of these sits over a list — the same constraint `DropdownChip`
 * documents. Nothing is dimmed, and a press anywhere outside dismisses it.
 *
 * `align` is the only difference between the two triggers. A round button sits
 * at the right end of its row, so its panel grows leftwards from that edge or
 * it runs off the screen. A full-width bar's panel matches the bar, so the menu
 * reads as the bar opening rather than as a card appearing near it.
 */
function AnchoredPanel({
  anchor,
  align,
  close,
  children,
}: {
  anchor: Anchor;
  align: 'right' | 'stretch';
  close: () => void;
  children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { width: screenW, height: screenH } = useWindowDimensions();

  return (
    <>
      {/* The dismiss target is a SIBLING of the panel, not its parent. Wrapping
          the panel in a pressable backdrop produces a button containing
          buttons, which react-native-web renders as real nested <button>
          elements and React rejects at runtime — the trap `DropdownChip`,
          `SwapSheet` and `ConfirmDialog` all document. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        onPress={close}
      />
      <View
        style={[
          styles.panel,
          {
            backgroundColor: c.surface,
            borderColor: c.borderStrong,
            top: anchor.y + anchor.height + DROP,
            maxHeight: screenH - (anchor.y + anchor.height + DROP) - MARGIN * 2,
          },
          align === 'right'
            ? {
                right: Math.max(MARGIN, screenW - (anchor.x + anchor.width)),
                minWidth: 176,
                maxWidth: 260,
              }
            : { left: anchor.x, width: anchor.width },
        ]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {children}
        </ScrollView>
      </View>
    </>
  );
}

/**
 * The button alone — no menu.
 *
 * For a filter that is simply on or off, where a panel containing one switch
 * would be a menu with a single item in it. Filled when on, which is the whole
 * state, and the accessibility label carries it for anyone who cannot see the
 * fill.
 */
export function ToggleButton({
  icon,
  label,
  on,
  onPress,
}: {
  icon: ActionIconName;
  /** What the button does, spoken. e.g. "Available only". */
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: on ? accent : c.backgroundElement, borderColor: on ? accent : c.border },
        pressed && styles.pressed,
      ]}>
      <ActionIcon name={icon} color={on ? c.background : c.textSecondary} focused={on} size={16} />
    </Pressable>
  );
}

/**
 * A wrap of small toggles inside a menu, for a facet whose options are short.
 *
 * WHY A MENU NEEDS THIS AT ALL. `MenuItem` is one option per row, which is
 * right for a list you READ — four piles with counts, six sort keys. It is
 * wrong for a facet whose options are two characters long: five positions and
 * four tiers as `MenuItem`s put eleven rows in a panel, most of them holding a
 * two-letter word and a number, and the inventory's filter menu ran off the
 * bottom of a phone before it reached the last of them. A reader scrolling a
 * menu to find `PK` is a reader the menu has failed.
 *
 * Laid out as chips the same eleven options are two lines. The panel fits, and
 * — the part that matters more — every option is visible at once, which is what
 * a facet is for.
 *
 * IT DOES NOT CLOSE THE MENU. Position and tier are commonly set together, and
 * a panel that shut on the first press would have to be reopened to make the
 * second choice. The rows above it close on press because picking a pile IS the
 * decision; these narrow it afterwards.
 *
 * THE CHIP IS `Chip`, not a copy of it — the same object the boards' position
 * filters draw, so a facet does not change shape depending on whether it is on
 * a row or in a panel.
 */
export function MenuChips({
  options,
}: {
  options: {
    key: string;
    label?: string;
    /** Drawn in the label's place — the tier chips pass their badge. */
    glyph?: ReactNode;
    count?: number;
    selected: boolean;
    onPress: () => void;
    accessibilityLabel: string;
  }[];
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip
          key={o.key}
          selected={o.selected}
          label={o.label}
          count={o.count}
          onPress={o.onPress}
          accessibilityLabel={o.accessibilityLabel}>
          {o.glyph}
        </Chip>
      ))}
    </View>
  );
}

/** A rule between two facets in a panel. See `MenuChips`. */
export function MenuDivider() {
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  return <View style={[styles.menuDivider, { backgroundColor: c.border }]} />;
}

export type MenuTrigger =
  /* Exactly one of the two. A round button shows a glyph OR a two-or-three
     character value, never both — there is room for one thing in a circle. */
  | { icon: ActionIconName; text?: never }
  | { text: string; icon?: never };

export function MenuButton({
  icon,
  text,
  label,
  active,
  children,
}: MenuTrigger & {
  /** What the menu is, spoken — e.g. "Tier". */
  label: string;
  /** True when this filter is doing something, so the button reads as on. */
  active: boolean;
  /** The panel's contents. Given `close` so an item can dismiss the menu. */
  children: (close: () => void) => ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);
  const { trigger, anchor, open, close } = useAnchor();

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={open}
        accessibilityRole="button"
        accessibilityState={{ expanded: anchor !== null }}
        accessibilityLabel={label}
        hitSlop={6}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: c.backgroundElement,
            borderColor: active ? accent : c.border,
          },
          pressed && styles.pressed,
        ]}>
        {icon ? (
          <ActionIcon
            name={icon}
            color={active ? accent : c.textSecondary}
            focused={active}
            size={16}
          />
        ) : (
          /* The VALUE in the circle, not a glyph for the category. `W3` says
             which week you are on; a calendar icon would only say that weeks
             exist, and the button would need a label beside it to be read at
             all. Two or three characters is the whole budget. */
          <Text
            numberOfLines={1}
            style={[Type.micro, NUMERIC, { color: active ? accent : c.textSecondary }]}>
            {text}
          </Text>
        )}
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        // Android's hardware back must dismiss this, or the menu is a trap on
        // the one platform where it is not obvious how to escape.
        onRequestClose={close}>
        {anchor ? (
          <AnchoredPanel anchor={anchor} align="right" close={close}>
            {children(close)}
          </AnchoredPanel>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * The same menu, hung off a bar that spans its container.
 *
 * FOR THE CHOICE THAT IS THE SCREEN'S SUBJECT, which is a different thing from
 * a filter. The leaderboard's board picker decides what the entire page is a
 * list OF — six views that are not variations of one board but six different
 * boards — and a chip sized to its own word gave that the same weight as a
 * position filter sitting beside it.
 *
 * It replaced a `DropdownChip`, whose panel is centred over a dimmed backdrop.
 * That is the shape of a CONFIRMATION, as the note at the head of this file
 * says, and it severs the panel from the control that summoned it. This drops
 * from the bar, at the bar's own width, so the menu reads as the bar opening.
 */
export function MenuBar({
  value,
  label,
  children,
}: {
  /** The current choice, drawn in the bar. */
  value: string;
  /** What the menu is, spoken — e.g. "Board". */
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { trigger, anchor, open, close } = useAnchor();

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={open}
        accessibilityRole="button"
        accessibilityState={{ expanded: anchor !== null }}
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.bar,
          { backgroundColor: c.backgroundElement, borderColor: c.border },
          pressed && styles.pressed,
        ]}>
        <Text numberOfLines={1} style={[Type.strong, styles.barLabel, { color: c.text }]}>
          {value}
        </Text>
        <Text style={[Type.fine, { color: c.textTertiary }]}>▾</Text>
      </Pressable>

      <Modal visible={anchor !== null} transparent animationType="none" onRequestClose={close}>
        {anchor ? (
          <AnchoredPanel anchor={anchor} align="stretch" close={close}>
            {children(close)}
          </AnchoredPanel>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * One row in a menu panel.
 *
 * THE SELECTION IS A CHECK AND A BAND, and it used to be an 8pt dot: filled in
 * the accent when chosen, drawn as a hairline circle when not. The outline was
 * the problem. Every unchosen row carried a faint empty ring, so a menu of six
 * boards drew five pieces of furniture whose only job was to be ignored, and
 * the one that mattered was an 8pt dot competing with all of them. A menu
 * should be a list of words.
 *
 * What replaced it says the same thing three ways and adds no ink to the rows
 * that are not chosen: a check in the leading slot, the label at full `text`
 * weight, and the row on `backgroundElement`. Colour is never the only signal
 * and is not one here — the check and the weight both survive greyscale, which
 * is the rule the tier chips and the action bar keep.
 *
 * THE LEADING SLOT IS FIXED WIDTH whether or not it holds a check, because a
 * label that steps sideways as the selection moves down the list is the thing
 * the dot got right and is worth keeping.
 *
 * `detail` is the quiet figure on the right: a count, the unit a board ranks
 * by, or the direction of the sort you are already on.
 *
 * `label` and `glyph` are alternatives, not a pair. A glyph that already spells
 * its own name — the tier badge does, in letters, which is the whole reason
 * that badge exists — gets a row to itself and no text, because "BRONZE ▪
 * Bronze" is the same word twice and cost the label its width.
 */
export function MenuItem({
  label,
  selected,
  detail,
  description,
  glyph,
  onPress,
  accessibilityLabel,
}: {
  /** Omit when `glyph` already names the option. */
  label?: string;
  selected: boolean;
  detail?: string;
  /**
   * A sentence under the label, for a menu whose options need explaining
   * rather than counting.
   *
   * IT IS AN ALTERNATIVE TO `detail`, not a companion. A right-aligned figure
   * works while it is a figure — a count, a unit, a sort direction — and stops
   * working the moment it is a phrase: the label and the phrase end up on one
   * line at opposite edges with a gulf between them, and the eye has to travel
   * the width of the panel to pair two halves of one thought. Under the label
   * there is no gulf, and the sentence has room to be a sentence.
   */
  description?: string;
  /** Drawn in the label's place — the tier menu puts its badge here. */
  glyph?: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.item,
        selected && { backgroundColor: c.backgroundElement },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <Text style={[styles.check, { color: accent }]}>{selected ? '✓' : ''}</Text>
      {glyph ? (
        <View style={styles.itemLabel}>{glyph}</View>
      ) : (
        <View style={styles.itemLabel}>
          <Text
            numberOfLines={1}
            style={[
              Type.body,
              { color: selected ? c.text : c.textSecondary, fontWeight: selected ? '700' : '500' },
            ]}>
            {label}
          </Text>
          {description ? (
            <Text numberOfLines={2} style={[Type.fine, styles.itemDesc, { color: c.textTertiary }]}>
              {description}
            </Text>
          ) : null}
        </View>
      )}
      {detail ? (
        <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A heading above a group of items, for a panel that holds more than one. */
export function MenuHeading({ children }: { children: string }) {
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <Text style={[Type.micro, styles.heading, { color: c.textTertiary }]}>
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  /* Matches `MenuItem`'s own horizontal padding exactly, so a chip line and a
     row line start on the same left edge. It was `Spacing.two` against the
     item's `Spacing.three` and the two were quietly out of step. */
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.two + 2,
    marginVertical: Spacing.one,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  /* Width comes from `align` — see AnchoredPanel. */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: 38,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  barLabel: { flexShrink: 1, minWidth: 0 },
  panel: {
    position: 'absolute',
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    /* Top, not centre: a row carrying a description is two lines tall and the
       check belongs beside the LABEL rather than floating between the two. The
       nudge below puts it on the label's own optical line. */
    alignItems: 'flex-start',
    gap: Spacing.two,
    /* One step tighter than the panel's old 16, so the leading slot sits under
       the heading's own left edge rather than inside it. */
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two + 2,
    minHeight: 40,
  },
  /* Fixed width whether or not it holds a check — see the note above. */
  check: { width: 12, fontSize: 12, lineHeight: 22, fontWeight: '700', flexShrink: 0 },
  itemLabel: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  itemDesc: { marginTop: 2 },
  /* Aligned with the item rows below it, and given more air above than below:
     a heading belongs to what follows it, and the gap either side being equal
     is what made the groups read as one long list. */
  heading: {
    paddingHorizontal: Spacing.two + 2,
    paddingTop: Spacing.two + 2,
    paddingBottom: Spacing.one,
    letterSpacing: 0.4,
  },
  pressed: { opacity: 0.6 },
});
