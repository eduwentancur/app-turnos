"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { Service, ServiceInput } from "./types";

export function useServices() {
  const { apiFetch } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(async (): Promise<Service[]> => {
    const res = await apiFetch("/api/services?includeInactive=true");
    if (!res.ok) throw await parseApiError(res);
    return (await res.json()) as Service[];
  }, [apiFetch]);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    fetchServices()
      .then((data) => {
        if (cancelled) return;
        setServices(data);
        setError(null);
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
  }, [fetchServices]);

  const send = useCallback(
    async (path: string, method: string, body?: unknown) => {
      const res = await apiFetch(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw await parseApiError(res);
      setServices(await fetchServices());
    },
    [apiFetch, fetchServices],
  );

  return {
    services,
    loading,
    error,
    create: (input: ServiceInput) => send("/api/services", "POST", input),
    update: (id: string, input: Partial<ServiceInput>) => send(`/api/services/${id}`, "PATCH", input),
    remove: (id: string) => send(`/api/services/${id}`, "DELETE"),
  };
}
