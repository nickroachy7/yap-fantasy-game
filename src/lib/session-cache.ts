/**
 * A read that happens ONCE per session, keyed, and — the part that matters —
 * answerable SYNCHRONOUSLY once it has landed.
 *
 * WHY A PEEK, WHEN WE ALREADY HAD CACHES
 *
 * Several reads in this app were already cached for the session, and switching
 * between two pages that share one still showed a spinner. The reason is that a
 * cached PROMISE is not a cached VALUE: `await cachedPromise` costs no network,
 * but it still resolves in a microtask, so the remounted screen renders once
 * with nothing before it renders with everything. One frame of spinner, every
 * single time, on data that never left memory. That is the "very slight delay"
 * flipping between Trend and Leaders — not the network.
 *
 * `peek` closes it. A settled cache answers during the FIRST render of the new
 * screen, so the page below the nav swaps straight from one full board to the
 * other with no intermediate state at all.
 *
 * Reading module state during render is safe HERE specifically because peek is
 * an optimisation and never the only path: `useSessionRead`'s effect runs on
 * every mount regardless and writes the outcome as state, so a component that
 * peeks stale or peeks nothing still converges. Nothing depends on the peek
 * being the last word.
 *
 * A REJECTED READ IS NOT CACHED. It is dropped from the in-flight map so the
 * next mount retries, which is what keeps one network blip from making a screen
 * permanently empty for the rest of the session. Successes are kept until
 * something explicitly invalidates them — these are all "changes when the
 * nightly sync runs" reads, not live ones.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type SessionCache<K extends string, V> = {
  /** The value, from memory if it is there and from the network if it is not. */
  read: (key: K) => Promise<V>;
  /** The value IF it has already landed. Never starts a read. */
  peek: (key: K) => V | undefined;
  /** Forget one key, or the whole cache. The next read goes to the network. */
  invalidate: (key?: K) => void;
  /**
   * A number that changes whenever `key` is invalidated OR patched, and never
   * otherwise.
   *
   * This exists because changing a cached value does NOT reach a screen that is
   * already mounted, and in a tab navigator most screens are. A mounted hook
   * holds its rows in its own state; invalidating the cache leaves that state
   * exactly where it was. So a screen needs a way to ask "has anything happened
   * since I last read?" on the way back in, and comparing values cannot answer
   * it — a cache that was invalidated and then immediately re-read (which is
   * what a `reload()` from another screen does) looks identical to one that was
   * never touched.
   *
   * IT COUNTS PATCHES TOO, which is not about the focus check — subscribers are
   * told about those directly — but about the OTHER thing this number is for:
   * a read that started before the change must not be allowed to write its
   * answer afterwards. Compare it either side of an await and discard the
   * answer if it moved. `read` does exactly that internally; a caller holding
   * its own copy of the value should do the same.
   *
   * Monotonic, so a comparison is always safe.
   */
  version: (key: K) => number;
  /**
   * Rewrite a settled value in place, and tell every subscriber.
   *
   * NOT AN INVALIDATION, and the difference is the whole reason this exists.
   * Invalidating says "what I hold is no longer trustworthy, read it again";
   * this says "I know exactly what changed, and the value I hold is still the
   * best answer available". Selling six cards is the second of those: the
   * server names the six copies it took in the same answer that proves the sale
   * happened, so the held rows minus those six are correct — and correct NOW,
   * rather than a round trip from now.
   *
   * A NO-OP WHEN NOTHING IS SETTLED. There is no value to rewrite and the read
   * on its way will be right anyway, so a patch against an empty cache is not
   * an error and must not manufacture one.
   *
   * The version is deliberately NOT bumped: nothing was invalidated, so a
   * screen that catches up on focus by comparing versions has nothing to catch
   * up on. Subscribers are told directly instead — see `subscribe`.
   */
  patch: (key: K, fn: (value: V) => V) => void;
  /**
   * Be told when a key is patched.
   *
   * WHY A SUBSCRIPTION AND NOT THE VERSION COUNTER. The counter answers "have I
   * missed anything" on the way BACK IN, which is the right shape for an
   * invalidation — those happen on another screen by definition. A patch
   * happens under the reader's thumb, on the screen they are looking at, and
   * there is no way back in to ask on. It has to push.
   *
   * Returns its own unsubscribe.
   */
  subscribe: (fn: (key: K) => void) => () => void;
};

export function sessionCache<K extends string, V>(
  fetch: (key: K) => Promise<V>,
): SessionCache<K, V> {
  const inFlight = new Map<string, Promise<V>>();
  const settled = new Map<string, V>();
  /** Per-key invalidation counts, plus a whole-cache one. Both only rise. */
  const bumps = new Map<string, number>();
  const listeners = new Set<(key: K) => void>();
  let epoch = 0;

  return {
    read(key) {
      const held = inFlight.get(key);
      if (held) return held;
      /**
       * The version this read STARTED at.
       *
       * A read that is overtaken must not store its answer. Selling six cards
       * while a refresh is in the air used to end with the refresh landing
       * second and writing the pre-sale rows back over the patched ones — the
       * six cards reappearing in the grid a moment after they left it, from a
       * request that was correct when it was sent and stale by the time it
       * arrived. Dropping it from `inFlight` is not enough, because the promise
       * goes on resolving into its own `then`.
       *
       * The value is still RETURNED to whoever asked, because they may want it
       * for something other than the cache; it simply stops being the cached
       * answer. See `version`, which callers should compare the same way.
       */
      const startedAt = epoch + (bumps.get(key) ?? 0);
      const attempt = fetch(key).then(
        (value) => {
          if (epoch + (bumps.get(key) ?? 0) === startedAt) settled.set(key, value);
          return value;
        },
        (err) => {
          inFlight.delete(key);
          throw err;
        },
      );
      inFlight.set(key, attempt);
      return attempt;
    },
    peek(key) {
      return settled.get(key);
    },
    invalidate(key) {
      if (key === undefined) {
        epoch += 1;
        inFlight.clear();
        settled.clear();
        return;
      }
      bumps.set(key, (bumps.get(key) ?? 0) + 1);
      inFlight.delete(key);
      settled.delete(key);
    },
    version(key) {
      return epoch + (bumps.get(key) ?? 0);
    },
    patch(key, fn) {
      if (!settled.has(key)) return;
      const next = fn(settled.get(key) as V);
      /* Bumped BEFORE the value is stored, so a read already in the air is
         overtaken by it and cannot write the pre-patch rows back. See `read`. */
      bumps.set(key, (bumps.get(key) ?? 0) + 1);
      settled.set(key, next);
      inFlight.delete(key);
      for (const fire of listeners) fire(key);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type SessionRead<V> = {
  /** Undefined only while there is genuinely nothing to show yet. */
  value: V | undefined;
  /** False the instant a peek succeeds — a revisit never reports loading. */
  loading: boolean;
  error: string | null;
  /** Drop the cached value and read again. */
  reload: () => void;
};

const UNKNOWN = 'Something went wrong.';

/**
 * Subscribe a component to one key of a session cache.
 *
 * `key` may be null for "nothing to read yet" — a slate that has not been
 * worked out, a season still being resolved — and the hook simply idles.
 *
 * State is written only from the effect's CONTINUATION, never from its body,
 * for the same reason `useLoader` is built the way it is: writing "I have
 * started" synchronously inside an effect commits a render whose only content
 * is that fact. Here the first render already has the answer whenever the cache
 * does, so there is nothing to announce.
 */
export function useSessionRead<K extends string, V>(
  cache: SessionCache<K, V>,
  key: K | null,
): SessionRead<V> {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    key: K;
    attempt: number;
    value?: V;
    error: string | null;
  } | null>(null);

  /** Newest read wins; an older answer is discarded rather than written. */
  const token = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (key === null) return;
    const mine = ++token.current;
    const live = () => token.current === mine && mounted.current;

    void (async () => {
      try {
        const value = await cache.read(key);
        if (live()) setOutcome({ key, attempt, value, error: null });
      } catch (e) {
        if (live()) {
          setOutcome({ key, attempt, error: e instanceof Error ? e.message : UNKNOWN });
        }
      }
    })();
  }, [cache, key, attempt]);

  /**
   * Drop the cached value and read it again.
   *
   * NOT quiet: the value goes away with the cache entry, so `loading` goes true
   * until the new answer lands. That is right for a "try again" control and
   * wrong for a pull-to-refresh, which wants what is on screen to stay there —
   * a refresh wants `useLoader`, which keeps the old outcome while it re-reads.
   */
  const reload = useCallback(() => {
    if (key !== null) cache.invalidate(key);
    setAttempt((n) => n + 1);
  }, [cache, key]);

  const current = outcome !== null && outcome.key === key && outcome.attempt === attempt ? outcome : null;
  // The peek is the whole point: on a revisit it answers before the effect
  // above has even been scheduled, so the screen never renders empty.
  const value = (key === null ? undefined : cache.peek(key)) ?? current?.value;

  return {
    value,
    loading: value === undefined && current?.error == null && key !== null,
    error: current?.error ?? null,
    reload,
  };
}
