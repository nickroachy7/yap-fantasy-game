/**
 * A blocking yes/no for something that cannot be taken back.
 *
 * The spec's rule for these is followed exactly: the irreversible action is the
 * RIGHTMOST button, and it is the only one that carries colour. Cancel is the
 * quiet one on the left and is what the backdrop and the Android back button
 * both resolve to, so every accidental dismissal fails safe.
 *
 * `destructive` is not decoration. It is the difference between "you are about
 * to spend coins" and "you are about to destroy something you cannot get back",
 * and selling a card is the second kind — the copy carries its earned tier and
 * its start history with it.
 *
 * Same Modal-with-sibling-backdrop construction as DropdownChip: a pressable
 * wrapping the sheet would render a <button> containing <button>s on web.
 */
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ConfirmDialog({
  visible,
  title,
  body,
  warning,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  /**
   * A consequence the reader would not predict from the title, set apart from
   * `body` rather than folded into it.
   *
   * `body` is the terms of the act — what it costs, what it leaves. A warning is
   * something that happens SOMEWHERE ELSE as a result, and a sentence about a
   * different screen buried in the fourth line of a paragraph about this one is
   * a sentence nobody reads. Bordered in the warning tone for the same reason
   * the error line below is bordered in the negative one.
   */
  warning?: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  /** Server-side refusal, shown in place rather than as a second dialog. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = destructive ? c.negative : c.text;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          // Dismissing by backdrop must never be the destructive path.
          onPress={busy ? undefined : onCancel}
        />
        <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
          <Text style={[Type.section, { color: c.text }]}>{title}</Text>
          {body ? (
            <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>{body}</Text>
          ) : null}

          {warning ? (
            <Text style={[Type.fine, styles.warning, { color: c.warning, borderColor: c.warning }]}>
              {warning}
            </Text>
          ) : null}

          {error ? (
            <Text style={[Type.fine, styles.error, { color: c.negative, borderColor: c.negative }]}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={[Type.strong, { color: c.textSecondary }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy, disabled: busy }}
              style={({ pressed }) => [
                styles.button,
                styles.confirm,
                { backgroundColor: accent },
                pressed && styles.pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color={c.background} />
              ) : (
                <Text style={[Type.strong, { color: c.background }]}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  error: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.two,
  },
  /* Same frame as the error line — it is the same job, one step less severe. */
  warning: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    minHeight: 40,
    minWidth: 92,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  confirm: {},
  pressed: { opacity: 0.75 },
});
