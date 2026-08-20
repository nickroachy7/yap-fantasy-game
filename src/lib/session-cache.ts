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
};

export function sessionCache<K extends string, V>(
  fetch: (key: K) => Promise<V>,
): SessionCache<K, V> {
  const inFlight = new Map<string, Promise<V>>();
  const settled = new Map<string, V>();

  return {
    read(key) {
      const held = inFlight.get(key);
      if (held) return held;
      const attempt = fetch(key).then(
        (value) => {
          settled.set(key, value);
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
        inFlight.clear();
        settled.clear();
        return;
      }
      inFlight.delete(key);
      settled.delete(key);
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
