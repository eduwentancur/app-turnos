"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { TimeOff, TimeOffInput, Week, WeekDay } from "./types";

export function useSchedule() {
  const { apiFetch } = useAuth();
  const [week, setWeek] = useState<Week | null>(null);
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await apiFetch(path, init);
      if (!res.ok) throw await parseApiError(res);
      return (res.status === 204 ? undefined : await res.json()) as T;
    },
    [apiFetch],
  );

  const fetchTimeOffs = useCallback(() => request<TimeOff[]>("/api/schedule/time-offs"), [request]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([request<Week>("/api/schedule/working-hours"), fetchTimeOffs()])
      .then(([w, t]) => {
        if (cancelled) return;
        setWeek(w);
        setTimeOffs(t);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, fetchTimeOffs]);

  const saveWeek = useCallback(
    async (days: WeekDay[]) => {
      const saved = await request<Week>("/api/schedule/working-hours", {
        method: "PUT",
        body: JSON.stringify({ days }),
      });
      setWeek(saved);
      return saved;
    },
    [request],
  );

  const createTimeOff = useCallback(
    async (input: TimeOffInput) => {
      const created = await request<TimeOff>("/api/schedule/time-offs", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setTimeOffs(await fetchTimeOffs());
      return created;
    },
    [request, fetchTimeOffs],
  );

  const removeTimeOff = useCallback(
    async (id: string) => {
      await request<void>(`/api/schedule/time-offs/${id}`, { method: "DELETE" });
      setTimeOffs((prev) => prev.filter((t) => t.id !== id));
    },
    [request],
  );

  return { week, timeOffs, loading, error, saveWeek, createTimeOff, removeTimeOff };
}
