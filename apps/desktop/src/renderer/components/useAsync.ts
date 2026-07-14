import { useCallback, useEffect, useRef, useState } from "react";

/** Loads and optionally polls async renderer data without overlapping requests. */
export function useAsync<T>(load: () => Promise<T>, dependencies: React.DependencyList = [], pollMs = 5_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    const request = (async () => {
      if (mountedRef.current) {
        setLoading(!loadedRef.current);
        setError(null);
      }
      try {
        const next = await load();
        if (mountedRef.current) {
          setData(next);
          loadedRef.current = true;
        }
      } catch (caught) {
        if (mountedRef.current) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    })().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = request;
    return request;
  }, dependencies);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh]);

  return { data, error, loading, refresh };
}
