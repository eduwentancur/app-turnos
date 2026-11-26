"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, TextArea, Toggle } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/api-client";
import { formatDuration, formatPrice, zonedToIso } from "@/lib/format";
import type { Service } from "@/lib/services/types";
import type { CreateAppointmentInput, Customer } from "@/lib/appointments/types";
import { SlotPicker } from "./slot-picker";

export function AppointmentForm({
  services,
  initialDate,
  today,
  timezone,
  onSubmit,
  onCancel,
}: {
  services: Service[];
  initialDate: string;
  today: string;
  timezone: string;
  onSubmit: (input: CreateAppointmentInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { user, apiFetch } = useAuth();
  const isOwner = user?.role === "OWNER";
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(initialDate < today ? today : initialDate);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [manualTime, setManualTime] = useState("10:00");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sugerencias de clientes existentes al escribir teléfono o nombre
  const term = customerId ? "" : phone.replace(/\D/g, "").length >= 3 ? phone : name.trim().length >= 2 ? name : "";
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch(`/api/customers?search=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? (res.json() as Promise<Customer[]>) : []))
        .then((list) => !cancelled && setSuggestions(list.slice(0, 5)))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, apiFetch]);

  const service = services.find((s) => s.id === serviceId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const startsAt = outside ? zonedToIso(date, manualTime, timezone) : slotStart;
    if (!service) return setError("Elegí un servicio");
    if (!startsAt) return setError("Elegí un horario");
    if (!customerId && (name.trim().length < 2 || phone.replace(/\D/g, "").length < 8)) {
      return setError("Completá nombre y teléfono del cliente");
    }
    setSaving(true);
    try {
      await onSubmit({
        serviceId,
        startsAt,
        ...(customerId ? { customerId } : { customer: { name: name.trim(), phone: phone.trim() } }),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(outside ? { allowOutsideSchedule: true } : {}),
      });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
      setSlotStart(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-stone-700">Servicio</span>
        <select
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setSlotStart(null);
          }}
          className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatDuration(s.durationMinutes)} · {formatPrice(s.price)}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="Fecha"
        type="date"
        min={today}
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          setSlotStart(null);
        }}
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-stone-700">Horario</span>
          {isOwner && (
            <span className="flex items-center gap-2 text-xs text-stone-500">
              Fuera de horario
              <Toggle checked={outside} onChange={setOutside} label="Reservar fuera del horario de atención" />
            </span>
          )}
        </div>
        {outside ? (
          <div className="space-y-1">
            <input
              type="time"
              step={300}
              aria-label="Hora del turno"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm tabular-nums"
            />
            <p className="text-xs text-stone-500">Se reserva aunque esté fuera de las franjas; igual se evita pisar otro turno.</p>
          </div>
        ) : (
          date && <SlotPicker serviceId={serviceId} date={date} selected={slotStart} onSelect={(s) => setSlotStart(s.start)} />
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-stone-700">Cliente</span>
          {customerId && (
            <button
              type="button"
              onClick={() => {
                setCustomerId(null);
                setName("");
                setPhone("");
              }}
              className="text-xs text-stone-500 hover:underline"
            >
              Cambiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Teléfono (WhatsApp)"
            type="tel"
            placeholder="3764 123456"
            value={phone}
            disabled={Boolean(customerId)}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Field label="Nombre" value={name} disabled={Boolean(customerId)} onChange={(e) => setName(e.target.value)} />
        </div>
        {!customerId && term && suggestions.length > 0 && (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId(c.id);
                    setName(c.name);
                    setPhone(c.phone);
                    setSuggestions([]);
                  }}
                  className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                >
                  <span>{c.name}</span>
                  <span className="tabular-nums text-stone-500">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TextArea label="Notas" hint="Opcional" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Reservar turno
        </Button>
      </div>
    </form>
  );
}
