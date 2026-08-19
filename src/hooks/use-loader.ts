/**
 * One async read, and the three flags every screen draws around it.
 *
 * Nine hooks and screens had independently written the same twenty lines:
 * `loading`, `refreshing` and `error` state, a `load(mode)` callback opening
 * with `setLoading(true); setError(null)`, and `useEffect(() => { void load() },
 * [load])` to run it. That opening pair is what React 19's
 * `react-hooks/set-state-in-effect` is pointing at: it writes state
 * synchronously inside the effect body, so every run commits a render whose
 * only content is "I have started" before the render that shows the result.
 *
 * None of it needs storing. An attempt is named by the loader's identity (which
 * changes when what it reads changes) plus a retry counter; what IS stored is
 * the OUTCOME of the attempt that finished. `loading` then means "the current
 * attempt has produced no outcome yet", and `error` means "the outcome of the
 * CURRENT attempt" — so a dependency change or a retry clears the previous
 * error in the same render that starts the new read, which is exactly what
 * `setError(null)` used to do, minus the extra commit.
 *
 * CANCELLATION. Every attempt takes the next token and only the newest one may
 * write, so a slow response can never overwrite a faster, newer one, and an
 * unmounted screen is never written to. Loaders are handed a `live()` predicate
 * so they can hold the same line for the state they own.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Do the read, write whatever state you own once it lands, and either return a
 * message describing the failure or return nothing.
 *
 * Two rules, both load-bearing:
 *  - Write NO state before your first `await`. Reporting that a read has
 *    started is this hook's job, and a loader that also reports it costs a
 *    render — the very thing the lint rule is complaining about.
 *  - Check `live()` after each `await`, before writing. A loader that skips it
 *    can still clobber a newer read with an older answer.
 *
 * Returning nothing is a valid answer for a loader that reports its own errors
 * — a screen whose one error line is shared with an action, say — in which case
 * `error` below simply stays null.
 */
export type Load = (live: () => boolean) => Promise<string | null | void>;

export type Loader = {
  /** True until the current attempt settles. False throughout a `refresh()`. */
  loading: boolean;
  /** True while a `refresh()` is in flight — the pull-to-refresh flag. */
  refreshing: boolean;
  /** The current attempt's failure, or null. */
  error: string | null;
  /** Read again, showing `loading` — a "try again" control. */
  reload: () => void;
  /**
   * Read again WITHOUT `loading`, so what is on screen stays on screen.
   * Resolves when the read settles, so callers can sequence work after it.
   */
  refresh: () => Promise<void>;
};

const UNKNOWN = 'Something went wrong.';

type Outcome = { load: Load; attempt: number; error: string | null };

export function useLoader(load: Load): Loader {
  /** Bumped by reload(); with `load`'s identity it names the current attempt. */
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Newest attempt wins; an older one is discarded rather than written. */
  const token = useRef(0);
  const mounted = useRef(true);

  // Declared before the reading effect so that a remount re-arms this flag
  // before the read below is started again.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (source: Load, forAttempt: number) => {
    const mine = ++token.current;
    const live = () => token.current === mine && mounted.current;

    let message: string | null = null;
    try {
      message = (await source(live)) ?? null;
    } catch (e) {
      message = e instanceof Error ? e.message : UNKNOWN;
    }

    if (!live()) return;
    setOutcome({ load: source, attempt: forAttempt, error: message });
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // Started here, resolved in the continuation: `run` writes nothing until
    // the loader's first await has returned, which is the difference between
    // an effect that kicks off work and an effect that renders.
    void (async () => {
      await run(load, attempt);
    })();
  }, [run, load, attempt]);

  /** The outcome we are showing, or null while the current attempt is open. */
  const current =
    outcome !== null && outcome.load === load && outcome.attempt === attempt ? outcome : null;

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const refresh = useCallback(async () => {
    // An event handler rather than an effect, so writing state here is not the
    // cascading render the rule guards against — and clearing the error now is
    // what `setError(null)` at the top of the old load() did.
    setRefreshing(true);
    setOutcome((o) => (o === null ? o : { ...o, error: null }));
    await run(load, attempt);
  }, [run, load, attempt]);

  return {
    loading: current === null,
    refreshing,
    error: current?.error ?? null,
    reload,
    refresh,
  };
}
