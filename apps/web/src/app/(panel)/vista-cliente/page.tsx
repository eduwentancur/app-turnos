"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, FullScreenLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import { formatDuration, formatLongDate, formatPrice, formatShortDate } from "@/lib/format";
import type { Service } from "@/lib/services/types";
import type { DayAvailability, DaySummary, DaysAvailability, Slot } from "@/lib/availability/types";
import { paginateSlots, WHATSAPP_MAX_ROWS } from "@/lib/availability/whatsapp-list";
import { BotBubble, ListSheet, Phone, UserBubble, type SheetRow } from "./whatsapp-ui";

type Sheet = "services" | "days" | "slots" | null;
interface Barber {
  id: string;
  name: string;
}

export default function ClientPreviewPage() {
  const { user, apiFetch } = useAuth();
  const [services, setServices] = useState<Service[] | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [service, setService] = useState<Service | null>(null);
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [page, setPage] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [loadingStep, setLoadingStep] = useState(false);

  const get = useCallback(
    async <T,>(path: string): Promise<T> => {
      const res = await apiFetch(path);
      if (!res.ok) throw await parseApiError(res);
      return (await res.json()) as T;
    },
    [apiFetch],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([get<Service[]>("/api/services"), get<Barber[]>("/api/barbers")])
      .then(([s, b]) => {
        if (cancelled) return;
        setServices(s);
        setBarbers(b);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [get]);

  function reset() {
    setService(null);
    setDays(null);
    setDay(null);
    setSlot(null);
    setPage(0);
    setSheet(null);
    setError(null);
  }

  async function pickService(s: Service) {
    reset();
    setService(s);
    setLoadingStep(true);
    try {
      const res = await get<DaysAvailability>(`/api/availability/days?serviceId=${s.id}&days=21`);
      setDays(res.days.filter((d) => d.availableSlots > 0).slice(0, WHATSAPP_MAX_ROWS));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingStep(false);
    }
  }

  async function pickDay(date: string) {
    if (!service) return;
    setSheet(null);
    setSlot(null);
    setPage(0);
    setLoadingStep(true);
    try {
      setDay(await get<DayAvailability>(`/api/availability?serviceId=${service.id}&date=${date}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingStep(false);
    }
  }

  if (!services && !error) return <FullScreenLoader />;

  const shopName = user?.barbershop.name ?? "Barbería";
  const list = day ? paginateSlots(day.periods, page) : null;
  const barberName = (id?: string) => barbers.find((b) => b.id === id)?.name ?? "—";

  const messages: ReactNode[] = [
    <UserBubble key="hola">Hola!</UserBubble>,
    <BotBubble key="menu" button="Ver servicios" onButton={() => setSheet("services")}>
      {`¡Hola! 👋 Bienvenido a ${shopName}.\n¿Qué servicio querés reservar?`}
    </BotBubble>,
  ];

  if (service) {
    messages.push(<UserBubble key="svc">{service.name}</UserBubble>);
    if (days && days.length === 0) {
      messages.push(
        <BotBubble key="nodays">
          No hay horarios disponibles en los próximos días 😕. Revisá los horarios de atención en el panel.
        </BotBubble>,
      );
    } else if (days) {
      messages.push(
        <BotBubble key="days" button="Ver días" onButton={() => setSheet("days")}>
          {`Perfecto, ${service.name} (${formatDuration(service.durationMinutes)}, ${formatPrice(service.price)}).\n¿Qué día te queda bien?`}
        </BotBubble>,
      );
    }
  }

  if (day && list) {
    messages.push(<UserBubble key="day">{formatShortDate(day.date)}</UserBubble>);
    messages.push(
      day.totalSlots === 0 ? (
        <BotBubble key="noslots">Ese día ya no quedan horarios. Elegí otro 🙏</BotBubble>
      ) : (
        <BotBubble key={`slots-${page}`} button="Ver horarios" onButton={() => setSheet("slots")}>
          {`Elegí el horario para tu ${service?.name} del ${formatShortDate(day.date)} 💈${
            list.totalPages > 1 ? `\n(página ${page + 1} de ${list.totalPages})` : ""
          }`}
        </BotBubble>
      ),
    );
  }

  if (slot && day && service) {
    messages.push(<UserBubble key="slot">{slot.localTime}</UserBubble>);
    messages.push(
      <BotBubble key="confirm">
        {`Revisá tu turno:\n\nServicio: ${service.name}\nFecha: ${formatLongDate(day.date)}\nHora: ${slot.localTime}\nBarbero: ${barberName(slot.barberIds[0])}\nPrecio: ${formatPrice(service.price)}`}
      </BotBubble>,
      <div key="buttons" className="mb-2 grid max-w-[85%] grid-cols-2 gap-1">
        {["Confirmar", "Cambiar horario"].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => b === "Cambiar horario" && setSheet("slots")}
            className="rounded-lg bg-white py-2 text-[14px] font-medium text-[#008069] shadow-sm"
          >
            {b}
          </button>
        ))}
      </div>,
    );
  }

  let sheetNode: ReactNode = null;
  if (sheet === "services" && services) {
    sheetNode = (
      <ListSheet
        title="Servicios"
        sections={[
          {
            rows: services.slice(0, WHATSAPP_MAX_ROWS).map((s) => ({
              id: s.id,
              title: s.name,
              description: `${formatPrice(s.price)} · ${formatDuration(s.durationMinutes)}`,
            })),
          },
        ]}
        onClose={() => setSheet(null)}
        onSelect={(row: SheetRow) => {
          const s = services.find((x) => x.id === row.id);
          if (s) void pickService(s);
        }}
      />
    );
  } else if (sheet === "days" && days) {
    sheetNode = (
      <ListSheet
        title="Días disponibles"
        sections={[
          {
            rows: days.map((d) => ({
              id: d.date,
              title: formatShortDate(d.date),
              description: `${d.availableSlots} horario${d.availableSlots === 1 ? "" : "s"} libre${d.availableSlots === 1 ? "" : "s"}`,
            })),
          },
        ]}
        onClose={() => setSheet(null)}
        onSelect={(row) => void pickDay(row.id)}
      />
    );
  } else if (sheet === "slots" && list) {
    sheetNode = (
      <ListSheet
        title="Horarios"
        sections={list.sections}
        onClose={() => setSheet(null)}
        onSelect={(row) => {
          if (row.id.startsWith("MORE:")) {
            setPage(Number(row.id.split(":")[1]));
            setSlot(null);
            setSheet(null);
            return;
          }
          const picked = list.sections.flatMap((s) => s.rows).find((r) => r.id === row.id)?.slot;
          if (picked) setSlot(picked);
          setSheet(null);
        }}
      />
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vista del cliente</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Simulación de lo que verá un cliente en WhatsApp, con la disponibilidad real. Las listas respetan el
            límite de 10 opciones de WhatsApp. Todavía no reserva: eso llega con la sección Turnos.
          </p>
        </div>
        {service && (
          <button type="button" onClick={reset} className="text-sm text-stone-600 hover:text-stone-900 hover:underline">
            Reiniciar conversación
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-6">
        <Phone title={shopName}>
          {messages}
          {loadingStep && <p className="text-center text-xs text-stone-500">escribiendo…</p>}
          {sheetNode}
        </Phone>
      </div>
    </div>
  );
}
