/**
 * The room: who is in a friendly, how to get more people into it, and — for the
 * manager who built it — how to call it off.
 *
 * ---------------------------------------------------------------------------
 * WHY THE GUEST LIST IS NOT THE FIELD
 * ---------------------------------------------------------------------------
 *
 * `ContestFieldPanel` already draws everybody in a contest, and on every other
 * contest in the game that is the complete answer, because the only way to be
 * in one is to have filed a lineup. A friendly has a state before that: invited
 * and not yet entered. Those people are the whole subject of this panel — they
 * are who the creator is waiting on, and they are invisible to a scoreboard.
 *
 * So both are drawn, and they answer different questions. The field says who is
 * WINNING. This says who is COMING. Once everybody has filed the two lists hold
 * the same names, which is the point at which this panel stops being the
 * interesting one and quietly goes on saying something true.
 *
 * ---------------------------------------------------------------------------
 * THE CODE IS THE CREATOR'S, AND THE SERVER IS WHAT ENFORCES THAT
 * ---------------------------------------------------------------------------
 *
 * `contest_lobby` returns `join_code` as null for everybody but the creator, so
 * this component draws it whenever it HAS it rather than testing who is looking.
 * That is deliberate: a client-side `if (isMine)` around a value the server had
 * already sent would be a permission check in the one place it cannot be
 * enforced.
 *
 * ---------------------------------------------------------------------------
 * CALLING IT OFF IS DESTRUCTIVE AND IS TREATED AS SUCH
 * ---------------------------------------------------------------------------
 *
 * It deletes other people's entries and refunds them. It is behind
 * `ConfirmDialog` with `destructive`, and the dialog names the two consequences
 * the creator cannot see from here: how many managers are in, and that it
 * cannot be undone. The server refuses it once any card has kicked off — that
 * message is shown verbatim rather than pre-empted, because the exact moment
 * the door closes is the server's to know.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { useFriends } from '@/components/friends/use-friends';
import { useLoader, type Load } from '@/hooks/use-loader';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cancelFriendly, fetchMembers, inviteToFriendly, type Member } from './friendly';

export function FriendlyPanel({
  code,
  creatorName,
  joinCode,
  maxEntrants,
  onCancelled,
  onOpenManager,
}: {
  code: string;
  /** Whose contest it is. Drawn for a guest; the creator gets the code instead. */
  creatorName: string | null;
  /** Present only for the creator — see the header. */
  joinCode: string | null;
  maxEntrants: number | null;
  /** The contest no longer exists; leave the page. */
  onCancelled: () => void;
  onOpenManager?: (userId: string, name: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const mine = joinCode !== null;

  const [members, setMembers] = useState<Member[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* The friends list is only read once the creator opens the invite row, so a
     guest's visit to this page costs one query rather than two. */
  const { friends } = useFriends();

  /* `useLoader` rather than an effect that calls setState, which is the house
     pattern and which the lint rule enforces: it owns the mounted check, the
     newest-attempt-wins token and the error, so this only has to say what to
     read. See `use-loader`. */
  const load = useCallback<Load>(
    async (live) => {
      try {
        const rows = await fetchMembers(code);
        if (!live()) return null;
        setMembers(rows);
      } catch (err) {
        if (!live()) return null;
        return err instanceof Error ? err.message : 'Could not load the room.';
      }
      return null;
    },
    [code],
  );

  const { error, refresh } = useLoader(load);

  const invite = async (userId: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await inviteToFriendly(code, [userId]);
      await refresh();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not send that invitation.');
    }
    setBusy(false);
  };

  const callOff = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await cancelFriendly(code);
      setConfirming(false);
      onCancelled();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not call it off.');
      setBusy(false);
    }
  };

  const inRoom = (members ?? []).filter((m) => !m.declined);
  const entered = inRoom.filter((m) => m.entered).length;
  /* Friends who are not already in the room. A friend who DECLINED stays out of
     this list: the server will not re-invite them (`on conflict do nothing`
     leaves the declined row alone), so offering the button would be offering
     something that silently does nothing. */
  const askable = (friends ?? []).filter(
    (f) => !(members ?? []).some((m) => m.userId === f.userId),
  );

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text style={[Type.figure, { color: c.text }]}>The room</Text>
        <Text style={[Type.figure, NUMERIC, { color: c.textTertiary }]}>
          {inRoom.length}
          {maxEntrants ? `/${maxEntrants}` : ''}
        </Text>
      </View>
      <Text style={[Type.body, { color: c.textTertiary }]}>
        {mine
          ? `${entered} of ${inRoom.length} have filed a lineup.`
          : `${creatorName ?? 'A manager'} built this one. ${entered} of ${inRoom.length} have filed.`}
      </Text>

      {error ? <Text style={[Type.fine, { color: c.negative }]}>{error}</Text> : null}

      {members === null ? (
        <ActivityIndicator />
      ) : (
        <View style={styles.stack}>
          {inRoom.map((m) => (
            <Pressable
              key={m.userId}
              disabled={!onOpenManager}
              onPress={() => onOpenManager?.(m.userId, m.name)}
              accessibilityRole={onOpenManager ? 'button' : undefined}
              style={({ pressed }) => [
                styles.member,
                { borderColor: c.border },
                pressed && onOpenManager ? styles.pressed : null,
              ]}>
              <Text numberOfLines={1} style={[Type.body, styles.grow, { color: c.text }]}>
                {m.name}
              </Text>
              {m.isOwner ? <StatusChip label="Host" tone="neutral" /> : null}
              {/* IN, or ASKED. Two states and no third — "declined" is not
                  drawn because those rows are filtered out above: a list of
                  people who said no is a scoreboard of refusals, and the
                  creator can do nothing about any of them. */}
              <StatusChip
                label={m.entered ? 'In' : 'Asked'}
                tone={m.entered ? 'positive' : 'warning'}
              />
            </Pressable>
          ))}
        </View>
      )}

      {/* THE CODE, for whoever built it. Selectable rather than copied to the
          clipboard: `expo-clipboard` is a NATIVE dependency and this feature
          ships over the air (see AGENTS.md), so a copy button would strand
          every install that has not been rebuilt. Six characters from an
          alphabet with no I, L, O, 0 or 1 in it are readable aloud, which is
          how a group of friends will actually pass it around anyway. */}
      {mine ? (
        <View style={[styles.code, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
          <View style={styles.grow}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>Join code</Text>
            <Text selectable style={[Type.figure, NUMERIC, styles.codeText, { color: c.text }]}>
              {joinCode}
            </Text>
          </View>
          <Text style={[Type.micro, styles.codeHint, { color: c.textTertiary }]}>
            Anyone with this can join, friend or not.
          </Text>
        </View>
      ) : null}

      {mine && askable.length > 0 ? (
        <View style={styles.stack}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setInviting((v) => !v)}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              {inviting ? 'Done inviting ›' : `Invite more friends (${askable.length}) ›`}
            </Text>
          </Pressable>
          {inviting ? (
            <View style={styles.chipWrap}>
              {askable.map((f) => (
                <Chip
                  key={f.userId}
                  label={f.name}
                  accessibilityLabel={`Invite ${f.name}`}
                  selected={false}
                  disabled={busy}
                  onPress={() => invite(f.userId)}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {failed ? <Text style={[Type.fine, { color: c.negative }]}>{failed}</Text> : null}

      {mine ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirming(true)}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <Text style={[Type.fine, { color: c.negative }]}>Call this contest off</Text>
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title="Call it off?"
        body={
          entered > 0
            ? `${entered} manager${entered === 1 ? ' has' : 's have'} filed a lineup. Everybody gets back exactly what they paid.`
            : 'Nobody has filed yet, so there is nothing to refund.'
        }
        warning="The contest and every entry in it are deleted. This cannot be undone."
        confirmLabel="Call it off"
        destructive
        busy={busy}
        error={failed}
        onConfirm={callOff}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  stack: { gap: Spacing.two },
  grow: { flex: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.three,
  },
  codeText: { letterSpacing: 4 },
  codeHint: { flex: 1, textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
