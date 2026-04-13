import { useState, useCallback } from "react";
import { API_BASE } from "../config";

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async <T>(path: string, options?: RequestInit): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data as T;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const get = useCallback(
    <T>(path: string) => request<T>(path),
    [request]
  );

  const post = useCallback(
    <T>(path: string, body: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    [request]
  );

  const del = useCallback(
    <T>(path: string) => request<T>(path, { method: "DELETE" }),
    [request]
  );

  return { get, post, del, loading, error };
}
