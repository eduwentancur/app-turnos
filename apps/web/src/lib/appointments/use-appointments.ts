"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { Appointment, CreateAppointmentInput } from "./types";

/** Turnos de un rango de fechas locales (inclusive). */
export function useAppointments(from: string, to: string) {
  const { apiFetch } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await apiFetch(path, init);
      if (!res.ok) throw await parseApiError(res);
      return (await res.json()) as T;
    },
    [apiFetch],
  );

  const fetchRange = useCallback(
    () => request<Appointment[]>(`/api/appointments?from=${from}&to=${to}`),
    [request, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    fetchRange()
      .then((data) => {
        if (cancelled) return;
        setAppointments(data);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchRange]);

  const mutate = useCallback(
    async (path: string, method: string, body?: unknown) => {
      const result = await request<Appointment>(path, {
        method,
        body: body === undefined ? JSON.stringify({}) : JSON.stringify(body),
      });
      setAppointments(await fetchRange());
      return result;
    },
    [request, fetchRange],
  );

  return {
    appointments,
    loading,
    error,
    create: (input: CreateAppointmentInput) => mutate("/api/appointments", "POST", input),
    reschedule: (id: string, startsAt: string, allowOutsideSchedule?: boolean) =>
      mutate(`/api/appointments/${id}/reschedule`, "PATCH", { startsAt, allowOutsideSchedule }),
    cancel: (id: string, reason?: string) =>
      mutate(`/api/appointments/${id}/cancel`, "POST", reason ? { reason } : {}),
    setStatus: (id: string, status: "CONFIRMED" | "COMPLETED" | "NO_SHOW") =>
      mutate(`/api/appointments/${id}/status`, "PATCH", { status }),
  };
}
