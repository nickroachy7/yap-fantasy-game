/**
 * One manager in a list: their name, one line about them, and the control that
 * changes where you stand with them.
 *
 * ---------------------------------------------------------------------------
 * TWO TARGETS, SIDE BY SIDE, AND NEITHER INSIDE THE OTHER
 * ---------------------------------------------------------------------------
 *
 * The name opens their profile; the button at the end acts on the friendship.
 * They are SIBLINGS in a plain `View`, and the row itself is not pressable —
 * because a `Pressable` wrapping a `Pressable` renders a `<button>` inside a
 * `<button>` on web, which React rejects at runtime. `SwapSheet`,
 * `DropdownChip`, `ConfirmDialog` and `PlayerSheetFrame` all document the same
 * trap; here it also happens to be the better interaction, since "open them"
 * and "add them" are two different acts and a row that did both would have to
 * pick one for the 90% of its width that is neither control.
 *
 * The name's role is `link`, not `button`, and that is load-bearing rather than
 * pedantry: `link` is the one interactive role react-native-web does NOT map to
 * a real `<button>` element, so a name-link can sit inside a pressable host
 * elsewhere in the app (a leaderboard row, a contest's field) without the same
 * nesting problem. It is also what it is — a thing that navigates.
 *
 * ---------------------------------------------------------------------------
 * THE STATE IS SAID ONCE
 * ---------------------------------------------------------------------------
 *
 * Every state has a word and every control has a label, and drawing both meant
 * a row that said "Requested" twice — chip and button — for four of the seven
 * states. The chip survives on exactly one: `incoming`, whose controls are
 * VERBS (Accept, Decline) and therefore say nothing about who asked whom. See
 * `chip` below.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamLogo } from '@/components/shell/TeamLogo';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FriendButton } from './FriendButton';
import { LINK_LABEL, type FriendLink } from './friends';

export function ManagerRow({
  userId,
  name,
  meta,
  link,
  onOpen,
  onChange,
  onError,
  /** False for the last row inside a panel, whose border is a hairline below. */
  rule = true,
}: {
  userId: string;
  name: string;
  /** One line under the name — "22 cards · #3 on points". */
  meta?: string;
  link: FriendLink;
  onOpen: () => void;
  onChange: (next: FriendLink) => void;
  onError?: (message: string | null) => void;
  rule?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  /**
   * ONLY WHERE THE CONTROL DOES NOT ALREADY SAY IT.
   *
   * The chip was drawn for every state that had a word, and against a button
   * carrying the same word it was simply the row saying "Requested" twice, and
   * "declined" twice, and "friend" twice. What is left is `incoming`, and it is
   * the one that genuinely adds something: its controls are VERBS — Accept,
   * Decline — so without the chip nothing on the row says which of the two
   * people did the asking.
   */
  const chip = link === 'incoming' ? LINK_LABEL.incoming : null;

  return (
    <View style={[styles.row, rule && { borderBottomColor: c.border }, rule && styles.ruled]}>
      {/* The link: avatar, name and the line under it are one target, because
          they are one statement about one person. */}
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={name}
        accessibilityHint="Opens this manager's profile"
        style={({ pressed }) => [styles.who, pressed && styles.pressed]}>
        <TeamLogo userId={userId} name={name} size={28} />
        <View style={styles.lines}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={[Type.strong, styles.name, { color: c.text }]}>
              {name}
            </Text>
            {chip ? (
              <Text numberOfLines={1} style={[Type.micro, styles.chip, { color: c.textTertiary }]}>
                {chip}
              </Text>
            ) : null}
          </View>
          {meta ? (
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <FriendButton
        userId={userId}
        name={name}
        link={link}
        onChange={onChange}
        onError={onError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  ruled: { borderBottomWidth: StyleSheet.hairlineWidth },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  lines: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 2, minWidth: 0 },
  /* The name is the only thing on the line allowed to give way — the chip
     behind it is two words and collapses to noise if it shrinks. */
  name: { flexShrink: 1, minWidth: 0 },
  chip: { flexShrink: 0 },
  pressed: { opacity: 0.6 },
});
