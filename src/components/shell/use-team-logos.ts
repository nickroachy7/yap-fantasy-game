/**
 * Who has a logo, asked once per screen rather than once per row.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT PART OF THE QUERIES THAT DRAW THE ROWS
 * ---------------------------------------------------------------------------
 *
 * A logo has to appear beside a manager's name on the boards, in a contest's
 * field, in the friends list, on a manager's profile, in the rail and on the
 * account page — six screens fed by six different RPCs. Threading a column
 * through them would mean dropping and recreating six functions, and a dropped
 * function comes back granted to PUBLIC unless every recreate remembers to say
 * otherwise. The migration makes that argument in full.
 *
 * `profiles` is already readable by any signed-in user, and every one of those
 * six screens already holds the `user_id` of every row it draws. So the rows
 * arrive as they always did, and the pictures are fetched alongside them.
 *
 * ---------------------------------------------------------------------------
 * ONE HOOK PER ROW, ONE QUERY PER SCREEN
 * ---------------------------------------------------------------------------
 *
 * The API is deliberately `useTeamLogo(userId)` — called by the ROW, not by the
 * list. A list-level hook would have meant editing all six screens to collect
 * their ids, hold them, and pass a lookup down; a row-level one means each row
 * asks for itself and every component that already knows a `userId` is one line
 * from drawing a logo.
 *
 * That is only affordable because asking is not fetching. Fifty rows mounting
 * in the same tick register fifty ids and schedule ONE microtask, which issues
 * ONE `in (...)`. The batching is the whole reason the ergonomic API is not
 * also the expensive one.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS HELD, AND WHAT INVALIDATES IT
 * ---------------------------------------------------------------------------
 *
 * `known` is module state, so it outlives every screen and a manager's picture
 * is fetched once for a whole session however many boards they appear on. Which
 * makes it per-account data, and per-account module state in this app has
 * exactly one obligation: it is registered in `forgetUserData`, or it is a bug
 * waiting for a second account on one device.
 *
 * A MISS IS CACHED AS "no logo", not left absent. Absent means "ask again", and
 * a manager with no logo would then be re-asked on every screen for the rest of
 * the session — the common case paying the cost of the rare one.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { NO_LOGO, type LogoMark } from '@/lib/team-logo';
import { supabase } from '@/lib/supabase';

/** Settled answers. See the header for why a miss is stored rather than left out. */
const known = new Map<string, LogoMark>();
/** Ids registered since the last flush, waiting for the batch to go out. */
const wanted = new Set<string>();
/** Ids currently in the air, so a re-render does not re-ask for them. */
const asking = new Set<string>();
const listeners = new Set<() => void>();
let scheduled = false;

/**
 * PostgREST puts `in (...)` in the query string, and a URL has a practical
 * ceiling. 200 uuids is roughly 7 KB of it — comfortably inside anything that
 * will refuse, and far larger than any list this app renders at once.
 */
const BATCH = 200;

function announce(): void {
  for (const fire of listeners) fire();
}

async function flush(): Promise<void> {
  scheduled = false;
  const ids = [...wanted];
  wanted.clear();
  if (ids.length === 0) return;
  for (const id of ids) asking.add(id);

  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, has_logo, logo_version')
        .in('id', slice);

      /* A FAILURE LEAVES THE IDS UNKNOWN rather than recording "no logo".
         Storing the miss would make one network blip permanently blank every
         logo on the screen for the rest of the session; leaving them absent
         means the next screen that renders these managers asks again. The rows
         themselves are unaffected either way — a logo nobody can fetch is
         initials, which is what the row drew yesterday. */
      if (error) {
        for (const id of slice) asking.delete(id);
        continue;
      }

      for (const id of slice) {
        known.set(id, NO_LOGO);
        asking.delete(id);
      }
      for (const row of data ?? []) {
        known.set(row.id, { hasLogo: row.has_logo, version: row.logo_version });
      }
    }
  } finally {
    for (const id of ids) asking.delete(id);
    announce();
  }
}

function request(userId: string): void {
  if (known.has(userId) || asking.has(userId) || wanted.has(userId)) return;
  wanted.add(userId);
  if (scheduled) return;
  scheduled = true;
  /* A microtask, not a timer: every row of a list mounts in the same tick, so
     this collects the whole screen and still goes out before the frame that
     rendered it has finished settling. */
  queueMicrotask(() => {
    void flush();
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Record a logo we already know about, without going to the network.
 *
 * The owner's own upload is the case: `PlayerContext` holds their mark and has
 * just been told the new version by the server, so every OTHER surface drawing
 * them — a leaderboard row, their entry in a contest field — should change in
 * the same frame rather than when its cache next happens to miss.
 */
export function noteTeamLogo(userId: string, mark: LogoMark): void {
  const held = known.get(userId);
  if (held && held.hasLogo === mark.hasLogo && held.version === mark.version) return;
  known.set(userId, mark);
  announce();
}

/** Registered in `forgetUserData`. See the header. */
export function invalidateTeamLogos(): void {
  known.clear();
  wanted.clear();
  asking.clear();
  announce();
}

/**
 * A manager's logo state, fetched if this is the first time anybody asked.
 *
 * Undefined means "not known yet" and is the first frame of every uncached
 * manager. Callers draw initials for it, which is also what they draw for
 * `hasLogo: false` — so nothing flickers between two different placeholders on
 * the way to an answer.
 */
export function useTeamLogo(userId: string | null | undefined): LogoMark | undefined {
  /* Requested from an effect rather than during render: registering an id is a
     side effect, and React may render this component without committing it. */
  useEffect(() => {
    if (userId) request(userId);
  }, [userId]);

  const snapshot = useCallback(
    () => (userId ? known.get(userId) : undefined),
    [userId],
  );

  /* Safe against the tearing check because `known` stores each mark by
     reference and only ever REPLACES it — two calls to the snapshot with
     nothing in between return the identical object, not an equal one. */
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
