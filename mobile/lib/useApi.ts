import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { messageFor } from "./api";

/**
 * Screen data loading: fetch on focus, expose the error, allow a retry.
 *
 * Every screen previously wrote its own `useState` + `useFocusEffect` +
 * `refreshing` block ending in `.catch(() => {})`. That swallowed the failure,
 * so a backend that was down, unreachable on the LAN, or simply slow left the
 * user on a spinner forever with no message and no way to retry - the single
 * most likely failure during a live demo, since the app's whole setup story is
 * "point the phone at a laptop on the same Wi-Fi".
 *
 * There is no caching here. A screen refetches when it regains focus, which is
 * correct but wasteful: the home screen issues six requests every time you
 * switch tabs back to it. TanStack Query is the right answer and would slot in
 * behind this same signature; it is noted in the report as the next step rather
 * than pulled in now.
 */
export type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (value: T) => void;
};

export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Held in a ref so `run` stays stable while still calling the newest loader.
  const loader = useRef(load);
  loader.current = load;

  const run = useCallback(async (isRefresh: boolean) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setData(await loader.current());
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  useFocusEffect(
    useCallback(() => {
      void run(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps),
  );

  return { data, error, loading, refreshing, reload, refresh, setData };
}

/**
 * A one-shot action with its own busy and error state: submitting a form,
 * activating a boost. Separate from `useApi` because an action's failure
 * belongs next to its button, not in place of the screen.
 */
export function useAction<Args extends unknown[], R>(action: (...args: Args) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await action(...args);
      } catch (e) {
        setError(messageFor(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [action],
  );

  return { run, busy, error, setError };
}
