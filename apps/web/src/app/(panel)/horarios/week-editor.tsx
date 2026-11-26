"use client";

import { useState } from "react";
import { Alert, Button, Toggle } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { fromMinutes, toMinutes } from "@/lib/format";
import { DAY_NAMES, DISPLAY_ORDER, type TimeRange, type WeekDay } from "@/lib/schedule/types";

const DEFAULT_RANGE: TimeRange = { startTime: "09:00", endTime: "13:00" };
const MAX_RANGES = 4;

function validateDay(ranges: TimeRange[]): string | null {
  const sorted = [...ranges].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  for (const r of sorted) {
    if (!r.startTime || !r.endTime) return "Completá todas las horas";
    if (toMinutes(r.endTime) <= toMinutes(r.startTime)) return "El cierre debe ser posterior a la apertura";
  }
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) {
      return "Las franjas se superponen";
    }
  }
  return null;
}

const clone = (days: WeekDay[]) => days.map((d) => ({ ...d, ranges: d.ranges.map((r) => ({ ...r })) }));

export function WeekEditor({
  initial,
  canEdit,
  onSave,
}: {
  initial: WeekDay[];
  canEdit: boolean;
  onSave: (days: WeekDay[]) => Promise<unknown>;
}) {
  const [days, setDays] = useState<WeekDay[]>(() => clone(initial));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(days) !== baseline;
  const errors = Object.fromEntries(days.map((d) => [d.dayOfWeek, validateDay(d.ranges)]));
  const hasErrors = Object.values(errors).some(Boolean);

  function update(dayOfWeek: number, ranges: TimeRange[]) {
    setSaved(false);
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ranges } : d)));
  }

  function addRange(day: WeekDay) {
    const last = day.ranges.at(-1);
    if (!last) return update(day.dayOfWeek, [{ ...DEFAULT_RANGE }]);
    const start = toMinutes(last.endTime) + 60;
    update(day.dayOfWeek, [...day.ranges, { startTime: fromMinutes(start), endTime: fromMinutes(start + 240) }]);
  }

  function copyToOpenDays(source: WeekDay) {
    setSaved(false);
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek !== source.dayOfWeek && d.ranges.length > 0
          ? { ...d, ranges: source.ranges.map((r) => ({ ...r })) }
          : d,
      ),
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const payload = days.map((d) => ({ dayOfWeek: d.dayOfWeek, ranges: d.ranges }));
      await onSave(payload);
      setBaseline(JSON.stringify(days));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {DISPLAY_ORDER.map((dow) => {
          const day = days.find((d) => d.dayOfWeek === dow)!;
          const open = day.ranges.length > 0;
          return (
            <div key={dow} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <div className="flex w-40 shrink-0 items-center gap-3 pt-1.5">
                <Toggle
                  checked={open}
                  disabled={!canEdit}
                  label={`${DAY_NAMES[dow]} ${open ? "abierto" : "cerrado"}`}
                  onChange={(v) => update(dow, v ? [{ ...DEFAULT_RANGE }, { startTime: "16:00", endTime: "20:00" }] : [])}
                />
                <span className={`text-sm font-medium ${open ? "" : "text-stone-400"}`}>{DAY_NAMES[dow]}</span>
              </div>

              <div className="flex-1">
                {!open ? (
                  <p className="pt-1.5 text-sm text-stone-400">Cerrado</p>
                ) : (
                  <div className="space-y-2">
                    {day.ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          step={300}
                          aria-label={`${DAY_NAMES[dow]} franja ${i + 1} apertura`}
                          disabled={!canEdit}
                          value={r.startTime}
                          onChange={(e) =>
                            update(dow, day.ranges.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))
                          }
                          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                        />
                        <span className="text-stone-400">a</span>
                        <input
                          type="time"
                          step={300}
                          aria-label={`${DAY_NAMES[dow]} franja ${i + 1} cierre`}
                          disabled={!canEdit}
                          value={r.endTime}
                          onChange={(e) =>
                            update(dow, day.ranges.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))
                          }
                          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            aria-label="Quitar franja"
                            onClick={() => update(dow, day.ranges.filter((_, j) => j !== i))}
                            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {errors[dow] && <p className="text-xs text-red-600">{errors[dow]}</p>}
                    {canEdit && (
                      <div className="flex gap-3 pt-1 text-sm">
                        {day.ranges.length < MAX_RANGES && (
                          <button type="button" onClick={() => addRange(day)} className="text-stone-600 hover:text-stone-900 hover:underline">
                            + Agregar franja
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => copyToOpenDays(day)}
                          className="text-stone-600 hover:text-stone-900 hover:underline"
                        >
                          Copiar a los demás días abiertos
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} loading={saving} disabled={!dirty || hasErrors}>
            Guardar horario
          </Button>
          {dirty && !saving && <span className="text-sm text-amber-700">Hay cambios sin guardar</span>}
          {saved && !dirty && <span className="text-sm text-emerald-700">Horario guardado ✓</span>}
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}
