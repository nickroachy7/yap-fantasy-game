/**
 * The one control that changes a friendship, wherever a friendship is drawn.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE COMPONENT AND NOT A BUTTON PER SCREEN
 * ---------------------------------------------------------------------------
 *
 * There are seven states (see `FriendLink`) and four verbs, and the mapping
 * between them is the entire feature's logic: which of the four is offered,
 * which is destructive, which state is a dead end, and what the button says
 * after the call comes back. That mapping is written once here, so the row in
 * the friends list, the row in the directory and the bar at the bottom of a
 * manager's sheet cannot disagree about what "Requested" does.
 *
 * The states, and what each one offers:
 *
 *   none / dismissed   Send friend request       — the ask
 *   outgoing           Requested                 — press to withdraw
 *   incoming           Accept / Decline          — the only two-control state
 *   friends            Friends                   — press to unfriend, confirmed
 *   declined           Request declined          — inert. The one dead end.
 *   self               nothing at all
 *
 * ---------------------------------------------------------------------------
 * IT REDRAWS FROM WHAT THE SERVER SAID, NOT FROM WHAT IT ASKED FOR
 * ---------------------------------------------------------------------------
 *
 * Pressing "Send friend request" on somebody who has already asked YOU makes
 * you friends, not a requester — the server accepts their pending row instead
 * of inserting a second one. Every verb therefore returns the resulting state
 * and `onChange` reports THAT, which is also what makes two people pressing at
 * the same moment end up with one friendship and no error.
 *
 * ---------------------------------------------------------------------------
 * ITS HOST MUST NOT BE A BUTTON
 * ---------------------------------------------------------------------------
 *
 * This is a `Pressable` with `accessibilityRole="button"`, which react-native-web
 * renders as a real `<button>`. Nested inside another role-button host it is a
 * `<button>` inside a `<button>`, which React rejects at runtime — the same trap
 * `SwapSheet`, `DropdownChip` and `PlayerSheetFrame` all document. So every row
 * that carries one keeps the name-link and this button as SIBLINGS, and the row
 * itself is a plain View. `ManagerRow` is the shape to copy.
 *
 * ---------------------------------------------------------------------------
 * ERRORS GO UP, NOT DOWN
 * ---------------------------------------------------------------------------
 *
 * A refusal ("that manager is not accepting a request from you") is a sentence,
 * and a sentence inside a 28pt row would reflow the list. So failures are
 * reported through `onError` and drawn by the host in its own one error line —
 * except the unfriend confirmation, which shows its refusal in the dialog that
 * caused it, where the reader is already looking.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  acceptRequest,
  declineRequest,
  sendRequest,
  undoFriendship,
  type FriendLink,
} from './friends';

export function FriendButton({
  userId,
  name,
  link,
  onChange,
  onError,
  wide = false,
}: {
  userId: string;
  /** Named in the unfriend confirmation, which is the one place it is read. */
  name: string;
  link: FriendLink;
  /** The state that came back. Hosts hold the link, so this component is pure. */
  onChange: (next: FriendLink) => void;
  onError?: (message: string | null) => void;
  /**
   * Fills its container rather than sitting at the end of a row.
   *
   * The sheet's footer is one control across the width of a bar; a list row is
   * a word at the end of a line. Same states, same verbs, two shapes.
   */
  wide?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  /** One runner for all four verbs: clear, call, report, stop. */
  async function run(verb: (id: string) => Promise<FriendLink>, inDialog = false) {
    setBusy(true);
    if (inDialog) setDialogError(null);
    else onError?.(null);
    try {
      const next = await verb(userId);
      onChange(next);
      if (inDialog) setConfirming(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'That did not work.';
      if (inDialog) setDialogError(message);
      else onError?.(message);
    }
    setBusy(false);
  }

  // Nothing to offer about yourself.
  if (link === 'self') return null;

  if (link === 'incoming') {
    return (
      <View style={[styles.pair, wide && styles.wide]}>
        <Button
          label="Accept"
          tone={c.positive}
          border={c.borderStrong}
          fill={c.surface}
          filled
          busy={busy}
          wide={wide}
          onPress={() => void run(acceptRequest)}
          hint={`Accept ${name}'s friend request`}
        />
        <Button
          label="Decline"
          tone={c.textSecondary}
          border={c.borderStrong}
          fill={c.surface}
          busy={busy}
          wide={wide}
          onPress={() => void run(declineRequest)}
          hint={`Decline ${name}'s friend request`}
        />
      </View>
    );
  }

  if (link === 'declined') {
    /* Inert, and it says why. A button that looks pressable and refuses every
       press is worse than a label, and a label with no explanation reads as a
       bug. This is the only dead end in the vocabulary. */
    return (
      <View style={[styles.inert, wide && styles.wide]}>
        <Text style={[Type.label, { color: c.textTertiary }]}>REQUEST DECLINED</Text>
      </View>
    );
  }

  if (link === 'friends') {
    return (
      <>
        <Button
          label="Friends"
          tone={c.textSecondary}
          border={c.borderStrong}
          fill={c.surface}
          busy={busy}
          wide={wide}
          onPress={() => {
            setDialogError(null);
            setConfirming(true);
          }}
          hint={`You are friends with ${name}. Opens the option to remove them.`}
        />
        {/* Confirmed, because it is the one irreversible-feeling act here: the
            other side loses the friendship too and is not told, and getting it
            back means asking again and being answered. */}
        <ConfirmDialog
          visible={confirming}
          title={`Remove ${name} from your friends?`}
          body="They come off your friends list and you come off theirs. Either of you can send a new request afterwards."
          confirmLabel="Remove friend"
          destructive
          busy={busy}
          error={dialogError}
          onConfirm={() => void run(undoFriendship, true)}
          onCancel={() => {
            if (busy) return;
            setConfirming(false);
            setDialogError(null);
          }}
        />
      </>
    );
  }

  if (link === 'outgoing') {
    /* Not disabled. "Requested" is a state you are allowed to leave, and the
       press that leaves it is the same press that entered it — which is why
       there is no separate Cancel control next to it. */
    return (
      <Button
        label="Requested"
        tone={c.textSecondary}
        border={c.borderStrong}
        fill={c.surface}
        busy={busy}
        wide={wide}
        onPress={() => void run(undoFriendship)}
        hint={`Waiting on ${name}. Press to withdraw the request.`}
      />
    );
  }

  // none, dismissed — the ask. `dismissed` is the pair the VIEWER refused
  // once, and asking them yourself is explicitly allowed; see the migration.
  return (
    <Button
      label={wide ? 'Send friend request' : 'Add'}
      tone={c.text}
      border={c.borderStrong}
      fill={c.surface}
      filled
      busy={busy}
      wide={wide}
      onPress={() => void run(sendRequest)}
      hint={`Send ${name} a friend request`}
    />
  );
}

/**
 * A control, at either of the two sizes.
 *
 * MODULE LEVEL, not nested inside `FriendButton`: a component declared in a
 * render body is a new type on every render, so React unmounts and remounts it
 * — which here would throw away the pressed state mid-press. It takes its
 * colours as props for the same reason everything else in this file does.
 */
function Button({
  label,
  tone,
  border,
  fill,
  filled = false,
  busy,
  wide,
  onPress,
  hint,
}: {
  label: string;
  tone: string;
  border: string;
  fill: string;
  filled?: boolean;
  busy: boolean;
  wide: boolean;
  onPress: () => void;
  hint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy }}
      style={({ pressed }) => [
        styles.button,
        wide ? styles.wideButton : styles.rowButton,
        { borderColor: filled ? tone : border },
        filled && { backgroundColor: fill },
        busy && styles.dim,
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Text numberOfLines={1} style={[wide ? Type.strong : Type.label, { color: tone }]}>
          {wide ? label : label.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: Spacing.one + 2, alignItems: 'center' },
  wide: { flex: 1 },
  button: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* A word at the end of a line. 28 keeps a row of managers at list density; the
     whole row is the profile link, so this is not the only target on it. */
  rowButton: { minHeight: 28, paddingHorizontal: Spacing.two + 2 },
  /** A bar's worth. 44 is the app's tappable minimum for a primary action. */
  wideButton: { flex: 1, minHeight: 44, paddingHorizontal: Spacing.three },
  inert: {
    /* NO BORDER, deliberately: `declined` is the one state that does nothing,
       and in a column beside `Requested` and `Friends` — which look the same
       and are both pressable — a box was the only thing saying "button". A
       label without one is the honest shape for a dead end. */
    borderRadius: Radius.chip,
    minHeight: 28,
    paddingHorizontal: Spacing.two + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
