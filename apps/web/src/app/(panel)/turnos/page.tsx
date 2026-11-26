"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, FullScreenLoader, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import { addDays, formatDate, formatMonthYear, formatPrice, startOfWeek, todayIn, toMinutes } from "@/lib/format";
import type { Week } from "@/lib/schedule/types";
import type { Service } from "@/lib/services/types";
import { useAppointments } from "@/lib/appointments/use-appointments";
import type { Appointment } from "@/lib/appointments/types";
import { AppointmentDetail } from "./appointment-detail";
import { AppointmentForm } from "./appointment-form";
import { CalendarGrid } from "./calendar-grid";

type View = "day" | "week";

export default function AppointmentsPage() {
  const { apiFetch } = useAuth();
  const [week, setWeek] = useState<Week | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const get = async <T,>(path: string) => {
      const res = await apiFetch(path);
      if (!res.ok) throw await parseApiError(res);
      return (await res.json()) as T;
    };
    Promise.all([get<Week>("/api/schedule/working-hours"), get<Service[]>("/api/services")])
      .then(([w, s]) => {
        if (cancelled) return;
        setWeek(w);
        setServices(s);
      })
      .catch((err: unknown) => !cancelled && setSetupError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  if (setupError) return <Alert>{setupError}</Alert>;
  if (!week) return <FullScreenLoader />;
  return <Calendar week={week} services={services} />;
}

function Calendar({ week, services }: { week: Week; services: Service[] }) {
  const today = todayIn(week.timezone);
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week",
  );
  const [anchor, setAnchor] = useState(today);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const monday = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [view, anchor]);

  const onNewFromWhatsapp = useCallback((fresh: Appointment[]) => {
    const a = fresh[0];
    setNotice(
      fresh.length === 1
        ? `📲 Nuevo turno por WhatsApp: ${a.customer.name}, ${formatDate(a.localDate)} a las ${a.localStart}.`
        : `📲 Entraron ${fresh.length} turnos nuevos por WhatsApp.`,
    );
  }, []);
  const { appointments, loading, error, create, reschedule, cancel, setStatus } = useAppointments(
    days[0],
    days[days.length - 1],
    onNewFromWhatsapp,
  );

  // Rango horario visible: desde la apertura más temprana hasta el cierre más tardío
  const { startHour, endHour, openDays } = useMemo(() => {
    const ranges = week.days.flatMap((d) => d.ranges);
    const apptMinutes = appointments.flatMap((a) => [toMinutes(a.localStart), toMinutes(a.localEnd)]);
    const starts = [...ranges.map((r) => toMinutes(r.startTime)), ...apptMinutes];
    const ends = [...ranges.map((r) => toMinutes(r.endTime)), ...apptMinutes];
    return {
      startHour: starts.length ? Math.floor(Math.min(...starts) / 60) : 8,
      endHour: ends.length ? Math.min(24, Math.ceil(Math.max(...ends) / 60)) : 21,
      openDays: new Set(week.days.filter((d) => d.ranges.length > 0).map((d) => d.dayOfWeek)),
    };
  }, [week, appointments]);

  const step = view === "day" ? 1 : 7;
  const label =
    view === "day"
      ? formatDate(anchor)
      : `${formatDate(days[0])} – ${formatDate(days[6])}`;

  const visible = appointments.filter((a) => a.status !== "CANCELLED");
  const income = visible.filter((a) => a.status !== "NO_SHOW").reduce((sum, a) => sum + a.price, 0);
  const noServices = services.length === 0;
  const noHours = openDays.size === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
          <p className="mt-1 text-sm text-stone-500">
            {formatMonthYear(days[0])} · {visible.length} turno{visible.length === 1 ? "" : "s"} · {formatPrice(income)} estimado
          </p>
        </div>
        <Button onClick={() => setCreatingOn(anchor)} disabled={noServices}>
          + Nuevo turno
        </Button>
      </div>

      {(noServices || noHours) && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          {noServices ? "Cargá al menos un servicio en Servicios" : "Configurá los horarios de atención en Horarios"} para poder
          reservar turnos.
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" className="px-3" aria-label="Anterior" onClick={() => setAnchor(addDays(anchor, -step))}>
            ‹
          </Button>
          <Button variant="secondary" className="px-3" onClick={() => setAnchor(today)}>
            Hoy
          </Button>
          <Button variant="secondary" className="px-3" aria-label="Siguiente" onClick={() => setAnchor(addDays(anchor, step))}>
            ›
          </Button>
          <span className="ml-2 text-sm font-medium first-letter:uppercase">{label}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 transition ${view === v ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}
            >
              {v === "day" ? "Día" : "Semana"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <FullScreenLoader />
      ) : (
        <CalendarGrid
          days={days}
          today={today}
          timezone={week.timezone}
          startHour={startHour}
          endHour={endHour}
          openDays={openDays}
          appointments={appointments}
          onSelect={setSelected}
          onEmpty={(d) => !noServices && setCreatingOn(d)}
        />
      )}

      <Modal open={creatingOn !== null} title="Nuevo turno" onClose={() => setCreatingOn(null)}>
        {creatingOn && (
          <AppointmentForm
            services={services}
            initialDate={creatingOn}
            today={today}
            timezone={week.timezone}
            onCancel={() => setCreatingOn(null)}
            onSubmit={async (input) => {
              const created = await create(input);
              setCreatingOn(null);
              setAnchor(created.localDate);
              setNotice(`Turno reservado: ${created.customer.name}, ${formatDate(created.localDate)} a las ${created.localStart}.`);
            }}
          />
        )}
      </Modal>

      <Modal open={selected !== null} title="Turno" onClose={() => setSelected(null)}>
        {selected && (
          <AppointmentDetail
            appointment={selected}
            today={today}
            onClose={() => setSelected(null)}
            onReschedule={async (startsAt) => {
              const updated = await reschedule(selected.id, startsAt);
              setNotice(`Turno reprogramado para ${formatDate(updated.localDate)} a las ${updated.localStart}.`);
            }}
            onCancel={async (reason) => {
              await cancel(selected.id, reason);
              setNotice("Turno cancelado. El horario quedó libre.");
            }}
            onStatus={async (status) => {
              await setStatus(selected.id, status);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
