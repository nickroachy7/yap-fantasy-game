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
import { Colors, ControlDiameter, Radius, Spacing, Type, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Diameter, shared with the action bar's detached button. See the theme. */
const SIZE = ControlDiameter;
/** Gap between the button's bottom edge and the panel's top. */
const DROP = 6;
/** Keeps a right-aligned panel from touching the screen edge. */
const MARGIN = Spacing.two;

type Anchor = { x: number; y: number; width: number; height: number };

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

export function MenuButton({
  icon,
  label,
  active,
  children,
}: {
  icon: ActionIconName;
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
  const { width: screenW, height: screenH } = useWindowDimensions();

  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  /* Measured on PRESS rather than on layout. A button in a row that scrolls, on
     a screen whose header can change height, has no position worth caching —
     and measuring once at mount is how a menu ends up opening where the button
     used to be. */
  const open = useCallback(() => {
    trigger.current?.measureInWindow((x, y, width, height) =>
      setAnchor({ x, y, width, height }),
    );
  }, []);
  const close = useCallback(() => setAnchor(null), []);

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
        <ActionIcon
          name={icon}
          color={active ? accent : c.textSecondary}
          focused={active}
          size={16}
        />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        // Android's hardware back must dismiss this, or the menu is a trap on
        // the one platform where it is not obvious how to escape.
        onRequestClose={close}>
        {/* The dismiss target is a SIBLING of the panel, not its parent.
            Wrapping the panel in a pressable backdrop produces a button
            containing buttons, which react-native-web renders as real nested
            <button> elements and React rejects at runtime — the trap
            `DropdownChip`, `SwapSheet` and `ConfirmDialog` all document.

            Undimmed on purpose. A scrim says "the screen behind this is
            suspended", which is true of a confirmation and false of a filter
            you are watching take effect. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={close}
        />
        {anchor ? (
          <View
            style={[
              styles.panel,
              {
                backgroundColor: c.surface,
                borderColor: c.borderStrong,
                top: anchor.y + anchor.height + DROP,
                /* Right-aligned to the trigger, because these buttons sit at
                   the right end of their row: a panel growing rightwards from a
                   button 20pt from the screen edge would be off it. Clamped so
                   it cannot leave the screen on either side. */
                right: Math.max(MARGIN, screenW - (anchor.x + anchor.width)),
                maxHeight: screenH - (anchor.y + anchor.height + DROP) - MARGIN * 2,
              },
            ]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {children(close)}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * One row in a menu panel.
 *
 * The current choice is marked by a filled dot in the accent AND by its label
 * going to full `text` weight — never by colour alone, which is the rule the
 * tier chips and the action bar both keep. `detail` is the quiet figure on the
 * right: a count, or the direction of the sort you are already on.
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
  glyph,
  onPress,
  accessibilityLabel,
}: {
  /** Omit when `glyph` already names the option. */
  label?: string;
  selected: boolean;
  detail?: string;
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
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.backgroundElement }]}>
      <View
        style={[
          styles.dot,
          selected ? { backgroundColor: accent } : { borderColor: c.border, borderWidth: 1 },
        ]}
      />
      {glyph ? (
        <View style={styles.itemLabel}>{glyph}</View>
      ) : (
        <Text
          numberOfLines={1}
          style={[
            Type.body,
            styles.itemLabel,
            { color: selected ? c.text : c.textSecondary, fontWeight: selected ? '700' : '500' },
          ]}>
          {label}
        </Text>
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
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  panel: {
    position: 'absolute',
    minWidth: 176,
    maxWidth: 260,
    borderRadius: Radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 40,
  },
  /* Fixed width whether it is filled or outlined, so labels do not step
     sideways as the selection moves down the list. */
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  itemLabel: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  heading: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  pressed: { opacity: 0.6 },
});
