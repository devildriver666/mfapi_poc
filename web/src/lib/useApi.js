import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an API call whenever `deps` change, with in-flight cancellation so a
 * fast-typing user doesn't get an older response landing on top of a newer one.
 *
 * `fn` receives { signal } and should pass it through to the api client.
 * Pass `enabled: false` to hold off (e.g. until an id is known).
 */
export function useApi(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, meta: null, loading: false, error: null });
      return undefined;
    }

    const controller = new AbortController();
    let live = true;

    setState((s) => ({ ...s, loading: true, error: null }));

    fnRef
      .current({ signal: controller.signal })
      .then((res) => {
        if (!live) return;
        setState({ data: res?.data ?? null, meta: res ?? null, loading: false, error: null });
      })
      .catch((err) => {
        if (!live || err?.name === 'AbortError') return;
        setState({ data: null, meta: null, loading: false, error: err });
      });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refetch };
}

/** Debounce a rapidly-changing value (search box → request). */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Counts down the Retry-After window from a 429 so the UI can show
 * "retry in 42s" and re-enable itself. Never waits longer than 60s, which is
 * the documented ceiling for this API.
 */
export function useRetryCountdown(error, onExpire) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (error?.code !== 'RATE_LIMITED') {
      setLeft(0);
      return undefined;
    }
    const seconds = Math.min(Number(error.retryAfter) || 60, 60);
    setLeft(seconds);

    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(t);
          onExpire?.();
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return left;
}
