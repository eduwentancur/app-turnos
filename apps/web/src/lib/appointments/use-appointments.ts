"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { Appointment, CreateAppointmentInput } from "./types";

const POLL_MS = 30_000;

/**
 * Turnos de un rango de fechas locales (inclusive).
 * Se actualiza solo cada 30 s (mientras la pestaña está visible) y avisa con
 * `onNewFromWhatsapp` cuando entran turnos reservados por el bot.
 */
export function useAppointments(
  from: string,
  to: string,
  onNewFromWhatsapp?: (appointments: Appointment[]) => void,
) {
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

  const knownIds = useRef<Set<string> | null>(null);
  const notify = useRef(onNewFromWhatsapp);
  useEffect(() => {
    notify.current = onNewFromWhatsapp;
  }, [onNewFromWhatsapp]);

  useEffect(() => {
    let cancelled = false;
    knownIds.current = null;
    fetchRange()
      .then((data) => {
        if (cancelled) return;
        knownIds.current = new Set(data.map((a) => a.id));
        setAppointments(data);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchRange]);

  // Actualización automática
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchRange()
        .then((data) => {
          const known = knownIds.current;
          if (known) {
            const fresh = data.filter((a) => !known.has(a.id) && a.source === "WHATSAPP");
            if (fresh.length) notify.current?.(fresh);
          }
          knownIds.current = new Set(data.map((a) => a.id));
          setAppointments(data);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchRange]);

  const mutate = useCallback(
    async (path: string, method: string, body?: unknown) => {
      const result = await request<Appointment>(path, {
        method,
        body: body === undefined ? JSON.stringify({}) : JSON.stringify(body),
      });
      const data = await fetchRange();
      knownIds.current = new Set(data.map((a) => a.id));
      setAppointments(data);
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
