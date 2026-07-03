import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync<T>(load: () => Promise<T>, dependencies: React.DependencyList = [], pollMs = 5_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(!loadedRef.current);
    setError(null);
    try {
      setData(await load());
      loadedRef.current = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, dependencies);

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
