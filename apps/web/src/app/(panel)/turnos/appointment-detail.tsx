"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Field } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { formatDate, formatPrice } from "@/lib/format";
import { attendeeLabel, STATUS_LABEL, STATUS_STYLE, type Appointment } from "@/lib/appointments/types";
import { SlotPicker } from "./slot-picker";

type Mode = "view" | "reschedule" | "cancel";

export function AppointmentDetail({
  appointment: a,
  group = [],
  today,
  onReschedule,
  onCancel,
  onStatus,
  onClose,
}: {
  appointment: Appointment;
  /** Otros turnos de la misma reserva en grupo */
  group?: Appointment[];
  today: string;
  onReschedule: (startsAt: string) => Promise<unknown>;
  onCancel: (reason?: string) => Promise<unknown>;
  onStatus: (status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [date, setDate] = useState(a.localDate < today ? today : a.localDate);
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = a.status === "PENDING" || a.status === "CONFIRMED";
  const [openedAt] = useState(() => Date.now());
  const started = new Date(a.startsAt).getTime() <= openedAt;
  const waLink = `https://wa.me/${a.customer.phone.replace(/\D/g, "")}`;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold first-letter:uppercase">
            {formatDate(a.localDate)} · {a.localStart} a {a.localEnd}
          </p>
          <p className="text-sm text-stone-500">
            {a.service.name} · {a.barber.name} · {formatPrice(a.price)}
          </p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}>
          {STATUS_LABEL[a.status]}
        </span>
      </div>

      <div className="rounded-xl bg-stone-50 p-4 text-sm">
        {a.guestName && <p className="font-medium">Para: {a.guestName}</p>}
        <p className={a.guestName ? "text-stone-600" : "font-medium"}>
          {a.guestName && "Reservó: "}
          <Link href={`/clientes/${a.customer.id}`} className="hover:underline">
            {a.customer.name}
          </Link>
        </p>
        <a href={waLink} target="_blank" rel="noreferrer" className="tabular-nums text-emerald-700 hover:underline">
          {a.customer.phone} · abrir WhatsApp
        </a>
        {a.customer.notes && (
          <p className="mt-2 whitespace-pre-line rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">📝 {a.customer.notes}</p>
        )}
        {a.notes && <p className="mt-2 whitespace-pre-line text-stone-600">{a.notes}</p>}
        <p className="mt-2 text-xs text-stone-400">Reservado desde {a.source === "WHATSAPP" ? "WhatsApp" : "el panel"}</p>
      </div>

      {group.length > 0 && (
        <div className="rounded-xl border border-stone-200 p-4 text-sm">
          <p className="mb-1.5 font-medium">👥 Reserva en grupo</p>
          <ul className="space-y-0.5 text-stone-600">
            {group.map((g) => (
              <li key={g.id} className="tabular-nums">
                {g.localStart} · {attendeeLabel(g)} · {g.service.name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-400">Cancelar o reprogramar acá afecta solo a este turno.</p>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {mode === "view" && (
        <div className="flex flex-wrap gap-2">
          {active && !started && (
            <>
              <Button variant="secondary" onClick={() => setMode("reschedule")}>
                Reprogramar
              </Button>
              <Button variant="dangerGhost" onClick={() => setMode("cancel")}>
                Cancelar turno
              </Button>
            </>
          )}
          {active && started && (
            <>
              <Button loading={busy} onClick={() => void run(() => onStatus("COMPLETED"))}>
                Marcar atendido
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void run(() => onStatus("NO_SHOW"))}>
                No vino
              </Button>
              <Button variant="dangerGhost" onClick={() => setMode("cancel")}>
                Cancelar
              </Button>
            </>
          )}
          {!active && <p className="text-sm text-stone-500">Este turno ya no se puede modificar.</p>}
        </div>
      )}

      {mode === "reschedule" && (
        <div className="space-y-4 border-t border-stone-100 pt-4">
          <Field label="Nueva fecha" type="date" min={today} value={date} onChange={(e) => {
            setDate(e.target.value);
            setSlot(null);
          }} />
          <SlotPicker serviceId={a.service.id} date={date} selected={slot} onSelect={(s) => setSlot(s.start)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>
              Volver
            </Button>
            <Button loading={busy} disabled={!slot} onClick={() => slot && void run(() => onReschedule(slot))}>
              Confirmar cambio
            </Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-4 border-t border-stone-100 pt-4">
          <Field
            label="Motivo"
            hint="Opcional"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: el cliente avisó que no puede"
          />
          <p className="text-sm text-stone-500">El horario queda libre para otra reserva.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>
              Volver
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void run(() => onCancel(reason.trim() || undefined))}>
              Cancelar turno
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
