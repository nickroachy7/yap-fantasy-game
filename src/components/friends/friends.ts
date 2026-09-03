/**
 * Friends: the model layer. One vocabulary, four verbs, four reads.
 *
 * ---------------------------------------------------------------------------
 * THE STATE IS A CLOSED VOCABULARY, AND EVERY SCREEN SWITCHES ON IT
 * ---------------------------------------------------------------------------
 *
 * `friend_link()` answers one question — where do these two stand — from the
 * VIEWER's side, and the seven answers below are the whole surface. The button,
 * the row and the sheet all draw themselves from this one word rather than from
 * a bag of booleans, because the states are mutually exclusive and a bag would
 * let two of them be true at once.
 *
 * `declined` and `dismissed` are the same row read from its two ends: I asked
 * and was refused, or I refused them. They are separate words because they lead
 * to different buttons — the first is the one dead end in the system, and the
 * second is a request I am still free to make myself. See the migration.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER IS RE-COERCED, FOR THE REASON `community.ts` DOCUMENTS
 * ---------------------------------------------------------------------------
 *
 * These RPCs return `bigint` and `numeric` columns and both can arrive as
 * STRINGS depending on how the driver renders them. The generated types say
 * `number` because they describe the SQL type, not the wire. A string does not
 * throw, it formats wrong ("12" + 1 = "121"), so everything numeric goes
 * through `num()` on the way in.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No optimism. A friend action is one round trip and the server is the only
 * thing that knows whether an ask crossed with an ask, so the verbs below
 * RETURN the resulting state and callers redraw from that — rather than
 * guessing 'outgoing' and being wrong every time two people press at once.
 */
import { supabase } from '@/lib/supabase';

/** Where the viewer stands with someone. `friend_link()`'s closed vocabulary. */
export type FriendLink =
  | 'self'
  | 'none'
  | 'friends'
  | 'outgoing'
  | 'incoming'
  /** The viewer asked and was refused. The one dead end. */
  | 'declined'
  /** The viewer refused them, and may still ask them themselves. */
  | 'dismissed';

/** A friend on your list, with enough of their season to be worth a row. */
export type Friend = {
  userId: string;
  name: string;
  since: string | null;
  /** Null for a friend outside the boards' window — drawn as a dash. */
  points: number | null;
  weeks: number | null;
  rank: number | null;
  cards: number | null;
  value: number | null;
};

/** A request waiting on somebody. `incoming` is the one that is a to-do. */
export type FriendRequest = {
  userId: string;
  name: string;
  direction: 'incoming' | 'outgoing';
  at: string;
};

/** A row of the manager directory. */
export type ManagerHit = {
  userId: string;
  name: string;
  link: FriendLink;
  cards: number;
  since: string;
};

/** Somebody's account screen — theirs or your own, read the same way. */
export type ManagerProfile = {
  userId: string;
  name: string;
  memberSince: string;
  season: number;
  seasonType: number;
  link: FriendLink;
  friendsSince: string | null;
  friendCount: number;
  points: number | null;
  weeks: number | null;
  rank: number | null;
  fieldSize: number;
  bestWeek: number | null;
  bestPoints: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  winPct: number | null;
  cards: number | null;
  inSets: number | null;
  players: number | null;
  goldPlus: number | null;
  diamond: number | null;
  value: number | null;
  careerFp: number | null;
  valueRank: number | null;
  setsDone: number | null;
  rungs: number | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Null-tolerant: a figure the boards genuinely do not have stays absent. */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A state the client does not know is treated as `none`.
 *
 * The alternative is a screen that draws nothing at all because the server
 * grew an eighth word, and "offer the request button" is the one wrong answer
 * that costs nothing: the server refuses it and says why.
 */
const LINKS: FriendLink[] = [
  'self',
  'none',
  'friends',
  'outgoing',
  'incoming',
  'declined',
  'dismissed',
];
export const asLink = (v: unknown): FriendLink =>
  LINKS.includes(v as FriendLink) ? (v as FriendLink) : 'none';

/* ------------------------------------------------------------------ reads */

export async function fetchFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('my_friends');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    since: r.friends_since ?? null,
    points: numOrNull(r.points),
    weeks: numOrNull(r.weeks_played),
    rank: numOrNull(r.rank),
    cards: numOrNull(r.cards),
    value: numOrNull(r.value_coins),
  }));
}

export async function fetchRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('my_friend_requests');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    direction: r.direction === 'outgoing' ? 'outgoing' : 'incoming',
    at: r.requested_at,
  }));
}

/**
 * The directory, or a search of it.
 *
 * An empty query is not an empty result — see `find_managers`. The box opens
 * showing who is here, which in a beta this size is the whole feature.
 */
export async function findManagers(query: string): Promise<ManagerHit[]> {
  const { data, error } = await supabase.rpc('find_managers', {
    p_query: query.trim() === '' ? undefined : query.trim(),
    p_limit: 25,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    link: asLink(r.friend_state),
    cards: num(r.cards),
    since: r.member_since,
  }));
}

export async function fetchManagerProfile(userId: string): Promise<ManagerProfile | null> {
  const { data, error } = await supabase.rpc('manager_profile', { p_user: userId });
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    userId: r.user_id,
    name: r.display_name,
    memberSince: r.member_since,
    season: num(r.season),
    seasonType: num(r.season_type),
    link: asLink(r.friend_state),
    friendsSince: r.friends_since ?? null,
    friendCount: num(r.friend_count),
    points: numOrNull(r.points),
    weeks: numOrNull(r.weeks_played),
    rank: numOrNull(r.points_rank),
    fieldSize: num(r.field_size),
    bestWeek: numOrNull(r.best_week),
    bestPoints: numOrNull(r.best_points),
    wins: numOrNull(r.wins),
    losses: numOrNull(r.losses),
    ties: numOrNull(r.ties),
    winPct: numOrNull(r.win_pct),
    cards: numOrNull(r.cards),
    inSets: numOrNull(r.in_sets),
    players: numOrNull(r.players),
    goldPlus: numOrNull(r.gold_plus),
    diamond: numOrNull(r.diamond),
    value: numOrNull(r.value_coins),
    careerFp: numOrNull(r.career_fp),
    valueRank: numOrNull(r.value_rank),
    setsDone: numOrNull(r.sets_done),
    rungs: numOrNull(r.rungs),
  };
}

/* ------------------------------------------------------------------ verbs */

/**
 * How many friendships this session has changed.
 *
 * THE SAME CATCH-UP `useSets` USES, and it is here for the same symptom read
 * the other way round. A manager's profile is a sheet presented OVER the
 * account screen, so unfriending somebody from the sheet leaves the friends
 * list mounted underneath with the row still on it — and dismissing a sheet is
 * not a navigation, so nothing re-reads on its own.
 *
 * A COUNTER RATHER THAN A CACHE. `useSets` invalidates a `sessionCache` because
 * its reads are shared between screens and worth a synchronous peek; there is
 * one friends list and it is on one tab, so all that is needed is a number that
 * says "something moved since you last read". Screens compare it on focus.
 */
let changes = 0;
export const friendsVersion = (): number => changes;

/**
 * The four verbs, each returning the state the pair is in afterwards.
 *
 * `request` can come back 'accepted' rather than 'pending' — asking somebody
 * who has already asked you IS accepting, and the caller must redraw from what
 * came back rather than from what it expected.
 */
async function verb(fn: 'friend_request' | 'friend_accept' | 'friend_decline' | 'friend_remove', userId: string) {
  const { data, error } = await supabase.rpc(fn, { p_user: userId });
  if (error) throw new Error(error.message);
  // Only a call that actually changed something bumps it — a failed ask leaves
  // every list on screen correct, and refreshing them would be noise.
  changes += 1;
  return asLink(data);
}

export const sendRequest = (userId: string) => verb('friend_request', userId);
export const acceptRequest = (userId: string) => verb('friend_accept', userId);
export const declineRequest = (userId: string) => verb('friend_decline', userId);
/** Withdraw an ask, unfriend, or clear a no you gave. One undo. */
export const undoFriendship = (userId: string) => verb('friend_remove', userId);

/* ------------------------------------------------------------------ words */

/** What the state is called on screen, where a state needs naming. */
export const LINK_LABEL: Record<FriendLink, string | null> = {
  self: null,
  none: null,
  friends: 'FRIEND',
  outgoing: 'REQUESTED',
  incoming: 'ASKED YOU',
  declined: 'DECLINED',
  dismissed: null,
};

/** "Friends since March" — the one sentence a friendship has to offer. */
export function sinceLabel(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return undefined;
  return `Friends since ${when.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}
