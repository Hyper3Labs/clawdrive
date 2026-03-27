import { useState, useEffect, useCallback } from "react";
import { getProjections, recomputeProjections } from "../../api";
import type { ProjectionPoint } from "../../types";

export function useProjections() {
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProjections();
      setPoints(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const recompute = useCallback(async () => {
    try {
      setLoading(true);
      const data = await recomputeProjections();
      setPoints(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { points, loading, error, recompute };
}
