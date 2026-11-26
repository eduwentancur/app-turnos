"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Field, FullScreenLoader, Modal, TextArea } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import { formatDate, formatPhone, formatPrice, timeAgo, todayIn } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/appointments/types";
import type { CustomerDetail } from "@/lib/customers/types";
import type { Service } from "@/lib/services/types";
import type { Week } from "@/lib/schedule/types";
import { AppointmentForm } from "../../turnos/appointment-form";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      const res = await apiFetch(path, init);
      if (!res.ok) throw await parseApiError(res);
      return (await res.json()) as T;
    },
    [apiFetch],
  );
  const load = useCallback(() => request<CustomerDetail>(`/api/customers/${id}`), [request, id]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((c) => !cancelled && setCustomer(c))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error && !customer) return <Alert>{error}</Alert>;
  if (!customer) return <FullScreenLoader />;

  const refresh = async () => setCustomer(await load());

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/clientes" className="text-sm text-stone-500 hover:text-stone-900">
        ‹ Clientes
      </Link>

      <Header customer={customer} onSaved={refresh} request={request} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visitas" value={String(customer.visits)} />
        <Stat label="Total gastado" value={formatPrice(customer.totalSpent)} />
        <Stat label="Última visita" value={customer.lastVisit ? timeAgo(customer.lastVisit, now) : "—"} />
        <Stat
          label="Cancelaciones / faltas"
          value={`${customer.cancellations} / ${customer.noShows}`}
          tone={customer.noShows >= 2 ? "warn" : undefined}
        />
      </div>

      <Notes customer={customer} request={request} onSaved={refresh} />

      <section>
        <h2 className="mb-3 font-semibold">Historial</h2>
        {customer.history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-500">
            Sin turnos todavía.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {customer.history.map((h) => (
              <li key={h.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <div className="w-40 shrink-0 first-letter:uppercase">
                  {formatDate(h.localDate)} · <span className="tabular-nums">{h.localStart}</span>
                </div>
                <div className="min-w-0 flex-1 truncate text-stone-600">
                  {h.service} · {h.barber}
                </div>
                <span className="tabular-nums">{formatPrice(h.price)}</span>
                <span className={`w-24 shrink-0 rounded-md border px-2 py-0.5 text-center text-xs ${STATUS_STYLE[h.status]}`}>
                  {STATUS_LABEL[h.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

function Header({ customer, onSaved, request }: { customer: CustomerDetail; onSaved: () => Promise<void>; request: Request }) {
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState<{ services: Service[]; week: Week } | null>(null);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await request(`/api/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ name, phone }) });
      await onSaved();
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openBooking() {
    try {
      const [services, week] = await Promise.all([
        request<Service[]>("/api/services"),
        request<Week>("/api/schedule/working-hours"),
      ]);
      setBooking({ services, week });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <a
          href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="tabular-nums text-emerald-700 hover:underline"
        >
          {formatPhone(customer.phone)} · WhatsApp
        </a>
        {customer.nextAppointment && (
          <p className="mt-1 text-sm text-stone-600 first-letter:uppercase">
            Próximo turno: {formatDate(customer.nextAppointment.localDate)} a las {customer.nextAppointment.localStart}
          </p>
        )}
        {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button onClick={() => void openBooking()}>Reservar turno</Button>
      </div>

      <Modal open={editing} title="Editar cliente" onClose={() => setEditing(false)}>
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Teléfono (WhatsApp)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={booking !== null} title={`Turno para ${customer.name}`} onClose={() => setBooking(null)}>
        {booking && (
          <AppointmentForm
            services={booking.services}
            initialCustomer={{ id: customer.id, name: customer.name, phone: customer.phone, notes: customer.notes }}
            initialDate={todayIn(booking.week.timezone)}
            today={todayIn(booking.week.timezone)}
            timezone={booking.week.timezone}
            onCancel={() => setBooking(null)}
            onSubmit={async (input) => {
              const created = await request<{ localDate: string; localStart: string }>("/api/appointments", {
                method: "POST",
                body: JSON.stringify(input),
              });
              setBooking(null);
              setNotice(`Turno reservado para el ${formatDate(created.localDate)} a las ${created.localStart}.`);
              await onSaved();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Notes({ customer, request, onSaved }: { customer: CustomerDetail; request: Request; onSaved: () => Promise<void> }) {
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = notes.trim() !== (customer.notes ?? "");

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await request(`/api/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
      await onSaved();
      setStatus("Guardado ✓");
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <TextArea
        label="Notas del cliente"
        hint="Se muestran al abrir sus turnos"
        rows={3}
        maxLength={1000}
        placeholder="Ej: degradé bajo, tijera arriba. Prefiere sábados."
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setStatus(null);
        }}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button variant="secondary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Guardar notas
        </Button>
        {status && <span className="text-sm text-stone-500">{status}</span>}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warn" ? "border-red-200 bg-red-50" : "border-stone-200 bg-white"}`}>
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warn" ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
