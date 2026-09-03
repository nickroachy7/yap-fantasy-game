/**
 * The Friends tab on your own account screen: who is waiting, who you have,
 * and how you find anybody else.
 *
 * ---------------------------------------------------------------------------
 * THREE PANELS IN ONE ORDER, AND THE ORDER IS THE ARGUMENT
 * ---------------------------------------------------------------------------
 *
 *   Requests   only when there are any. It is the only thing on the tab that
 *              is a TO-DO, so it goes first and disappears when it is done.
 *   Friends    the list. The reason the tab exists.
 *   Find       the directory, always open, always showing somebody.
 *
 * The find panel is not behind a button and is not a separate screen, which is
 * the whole reason this tab is worth having. "Add friends" as a route means a
 * player has to know they want to add somebody before they can see that there
 * is anybody to add; a box already showing seven names answers the question
 * before it is asked. In a beta of seven that is the entire feature.
 *
 * ---------------------------------------------------------------------------
 * ONE ERROR LINE FOR EVERY ACTION ON THE TAB
 * ---------------------------------------------------------------------------
 *
 * `FriendButton` reports refusals upward rather than drawing them in a 28pt row
 * (see there), and they all land in the same line under the tabs. It is cleared
 * by the next press, so it always describes the last thing the reader did.
 *
 * ---------------------------------------------------------------------------
 * A PRESS RE-READS THE LISTS AND PATCHES THE SEARCH
 * ---------------------------------------------------------------------------
 *
 * Accepting somebody moves them between the two panels, which is a re-read;
 * the search results below are patched in place instead, because they are
 * debounced and re-running the query would slide rows under the finger. Both
 * halves of that rule are in `use-friends.ts`.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ManagerRow } from './ManagerRow';
import { useOpenManager } from './use-open-manager';
import { sinceLabel, type Friend, type FriendLink, type FriendRequest } from './friends';
import { useManagerSearch, type FriendsState } from './use-friends';

export function FriendsPanel({ state }: { state: FriendsState }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const search = useManagerSearch();
  const [actionError, setActionError] = useState<string | null>(null);

  const { friends, requests, refresh } = state;

  const openManager = useOpenManager();

  /**
   * What every button on this tab does afterwards.
   *
   * The lists are re-read and the search row is patched — see the header. The
   * search is NOT re-read, so `patch` is what keeps its button honest until the
   * next keystroke settles.
   */
  /* `patch` rather than `search`, so the callback's identity survives a
     keystroke: the hook returns a fresh object every render and depending on it
     would rebuild every row's handler on every letter typed. */
  const patch = search.patch;
  const changed = useCallback(
    (userId: string, next: FriendLink) => {
      patch(userId, next);
      void refresh();
    },
    [patch, refresh],
  );

  const pending = requests ?? [];
  /* Bound locally so the rows below narrow: TypeScript loses `search.hits`'s
     non-null narrowing the moment it is read inside a callback. */
  const hits = search.hits;

  return (
    <>
      {actionError ? (
        <Text style={[Type.body, { color: c.negative }]}>{actionError}</Text>
      ) : null}

      {/* Only when there is something to answer. An empty "Requests" panel is
          furniture, and this tab already has a permanent list below it. */}
      {pending.length > 0 ? (
        <Panel
          title="Requests"
          hint={hintFor(pending)}>
          {pending.map((r, i) => (
            <ManagerRow
              key={r.userId}
              userId={r.userId}
              name={r.name}
              meta={requestMeta(r)}
              link={r.direction === 'incoming' ? 'incoming' : 'outgoing'}
              onOpen={() => openManager(r.userId, r.name)}
              onChange={(next) => changed(r.userId, next)}
              onError={setActionError}
              rule={i < pending.length - 1}
            />
          ))}
        </Panel>
      ) : null}

      <Panel
        title="Your friends"
        hint={friends ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}` : undefined}>
        {friends === null ? (
          <ActivityIndicator style={styles.pad} />
        ) : friends.length === 0 ? (
          <EmptyState
            title="No friends yet"
            body="Anybody you play against is in the directory below. Add them and their season shows up here."
          />
        ) : (
          friends.map((f, i) => (
            <ManagerRow
              key={f.userId}
              userId={f.userId}
              name={f.name}
              meta={friendMeta(f)}
              link="friends"
              onOpen={() => openManager(f.userId, f.name)}
              onChange={(next) => changed(f.userId, next)}
              onError={setActionError}
              rule={i < friends.length - 1}
            />
          ))
        )}
      </Panel>

      <Panel
        title="Find managers"
        hint={search.typed.trim() === '' ? 'Everyone playing' : undefined}>
        <View style={styles.searchRow}>
          <TextInput
            value={search.typed}
            onChangeText={search.setTyped}
            placeholder="Search by name"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search for a manager by name"
            style={[
              Type.body,
              styles.input,
              { color: c.text, borderColor: c.borderStrong, backgroundColor: c.surfaceSunken },
            ]}
          />
        </View>

        {search.error ? (
          <Text style={[Type.fine, styles.searchNote, { color: c.negative }]}>{search.error}</Text>
        ) : hits === null ? (
          <ActivityIndicator style={styles.pad} />
        ) : hits.length === 0 ? (
          <Text style={[Type.fine, styles.searchNote, { color: c.textTertiary }]}>
            {search.typed.trim() === ''
              ? 'Nobody else is playing yet.'
              : `No manager matches “${search.typed.trim()}”.`}
          </Text>
        ) : (
          hits.map((h, i) => (
            <ManagerRow
              key={h.userId}
              userId={h.userId}
              name={h.name}
              meta={`${h.cards} ${h.cards === 1 ? 'card' : 'cards'}`}
              link={h.link}
              onOpen={() => openManager(h.userId, h.name)}
              onChange={(next) => changed(h.userId, next)}
              onError={setActionError}
              rule={i < hits.length - 1}
            />
          ))
        )}
      </Panel>
    </>
  );
}

/** "2 waiting on you" — the half of the panel that is a to-do, counted. */
function hintFor(rows: FriendRequest[]): string {
  const incoming = rows.filter((r) => r.direction === 'incoming').length;
  const outgoing = rows.length - incoming;
  const parts: string[] = [];
  if (incoming > 0) parts.push(`${incoming} waiting on you`);
  if (outgoing > 0) parts.push(`${outgoing} sent`);
  return parts.join(' · ');
}

/** The date, not a duration: "3 days ago" on a beta this size is always "today". */
function requestMeta(r: FriendRequest): string {
  const when = new Date(r.at);
  const date = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${r.direction === 'incoming' ? 'Asked you' : 'Request sent'}${date ? ` · ${date}` : ''}`;
}

/**
 * A friend's line: where they are, what they have scored, what they hold.
 *
 * Every figure is dropped rather than dashed when it is missing — a row is a
 * sentence, and "— pts · — cards" is not one. The one thing always present is
 * the friendship's own date, which is the only fact this screen owns.
 */
function friendMeta(f: Friend): string {
  const parts: string[] = [];
  if (f.rank !== null) parts.push(`#${f.rank}`);
  if (f.points !== null) parts.push(`${f.points.toFixed(1)} pts`);
  if (f.cards !== null) parts.push(`${f.cards} ${f.cards === 1 ? 'card' : 'cards'}`);
  if (parts.length === 0) {
    const since = sinceLabel(f.since);
    return since ?? 'No season yet';
  }
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.three },
  searchRow: { padding: Spacing.two + 2 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 38,
  },
  searchNote: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
});
