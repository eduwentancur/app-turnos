"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { DayAvailability, Slot } from "@/lib/availability/types";
import { Spinner } from "@/components/ui";

export function SlotPicker({
  serviceId,
  date,
  selected,
  onSelect,
}: {
  serviceId: string;
  date: string;
  selected: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<{ key: string; day: DayAvailability | null; error: string | null } | null>(null);
  const key = `${serviceId}|${date}`;

  useEffect(() => {
    if (!serviceId || !date) return;
    let cancelled = false;
    apiFetch(`/api/availability?serviceId=${serviceId}&date=${date}`)
      .then(async (res) => {
        if (!res.ok) throw await parseApiError(res);
        return (await res.json()) as DayAvailability;
      })
      .then((day) => !cancelled && setData({ key, day, error: null }))
      .catch((err: unknown) => !cancelled && setData({ key, day: null, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [apiFetch, serviceId, date, key]);

  if (!serviceId) return <p className="text-sm text-stone-400">Elegí un servicio para ver los horarios.</p>;
  if (!data || data.key !== key) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-stone-500">
        <Spinner className="size-4 border-stone-300 border-t-stone-700" /> Buscando horarios…
      </div>
    );
  }
  if (data.error) return <p className="text-sm text-red-600">{data.error}</p>;
  if (!data.day || data.day.totalSlots === 0) {
    return <p className="rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-500">No quedan horarios libres ese día.</p>;
  }

  return (
    <div className="space-y-3">
      {data.day.periods.map((p) => (
        <div key={p.key}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">{p.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {p.slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => onSelect(s)}
                aria-pressed={selected === s.start}
                className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums transition ${
                  selected === s.start
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white hover:border-stone-500"
                }`}
              >
                {s.localTime}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
