"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { formatDate, toMinutes } from "@/lib/format";
import type { TimeOff, TimeOffInput } from "@/lib/schedule/types";

function describe(t: TimeOff): string {
  const sameDay = t.startDate === t.endDate;
  if (t.allDay) {
    return sameDay ? `${formatDate(t.startDate)} · todo el día` : `${formatDate(t.startDate)} al ${formatDate(t.endDate)}`;
  }
  return sameDay
    ? `${formatDate(t.startDate)} · ${t.startTime} a ${t.endTime}`
    : `${formatDate(t.startDate)} ${t.startTime} al ${formatDate(t.endDate)} ${t.endTime}`;
}

export function TimeOffs({
  timeOffs,
  today,
  canEdit,
  onCreate,
  onRemove,
}: {
  timeOffs: TimeOff[];
  today: string;
  canEdit: boolean;
  onCreate: (input: TimeOffInput) => Promise<TimeOff>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    if (!startDate || !endDate) return setError("Completá las fechas");
    if (endDate < startDate) return setError("La fecha de fin no puede ser anterior a la de inicio");
    if (!allDay && startDate === endDate && toMinutes(endTime) <= toMinutes(startTime)) {
      return setError("La hora de fin debe ser posterior a la de inicio");
    }
    setSaving(true);
    try {
      const created = await onCreate({
        startDate,
        endDate,
        ...(allDay ? {} : { startTime, endTime }),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason("");
      if (created.conflictingAppointments) {
        const n = created.conflictingAppointments;
        setWarning(
          `Ojo: hay ${n} turno${n === 1 ? "" : "s"} ya reservado${n === 1 ? "" : "s"} en ese período. No se cancelan solos: revisalos en Turnos.`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await onRemove(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        {timeOffs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
            No hay bloqueos próximos.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {timeOffs.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium first-letter:uppercase">{describe(t)}</p>
                  {t.reason && <p className="truncate text-sm text-stone-500">{t.reason}</p>}
                </div>
                {canEdit && (
                  <Button
                    variant="dangerGhost"
                    className="px-3"
                    loading={removing === t.id}
                    onClick={() => void remove(t.id)}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
          <h3 className="font-medium">Nuevo bloqueo</h3>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
            {[
              { v: true, label: "Día completo" },
              { v: false, label: "Rango horario" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setAllDay(o.v)}
                className={`rounded-md py-1.5 transition ${allDay === o.v ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Desde"
              type="date"
              min={today}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
            />
            <Field label="Hasta" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora inicio" type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <Field label="Hora fin" type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
          <Field
            label="Motivo"
            hint="Opcional"
            placeholder="Feriado, vacaciones, trámite…"
            maxLength={120}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <Alert>{error}</Alert>}
          {warning && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              {warning}
            </div>
          )}
          <Button type="submit" loading={saving} className="w-full">
            Bloquear
          </Button>
        </form>
      )}
    </div>
  );
}
