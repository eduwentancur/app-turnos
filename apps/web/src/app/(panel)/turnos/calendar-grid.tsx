"use client";

import { DAY_NAMES } from "@/lib/schedule/types";
import { dayOfWeek, nowMinutesIn, toMinutes } from "@/lib/format";
import { STATUS_STYLE, type Appointment } from "@/lib/appointments/types";

const PX_PER_MIN = 1.1;

export function CalendarGrid({
  days,
  today,
  timezone,
  startHour,
  endHour,
  openDays,
  appointments,
  onSelect,
  onEmpty,
}: {
  days: string[];
  today: string;
  timezone: string;
  startHour: number;
  endHour: number;
  openDays: Set<number>;
  appointments: Appointment[];
  onSelect: (a: Appointment) => void;
  onEmpty: (date: string) => void;
}) {
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = (endHour - startHour) * 60 * PX_PER_MIN;
  const nowMinutes = nowMinutesIn(timezone);

  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
      <div className={days.length > 1 ? "min-w-[680px]" : ""}>
        {/* Encabezado */}
        <div className="grid border-b border-stone-200" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => {
            const isToday = d === today;
            return (
              <div key={d} className={`border-l border-stone-100 px-2 py-2.5 text-center ${openDays.has(dayOfWeek(d)) ? "" : "text-stone-400"}`}>
                <p className="text-xs uppercase tracking-wide text-stone-500">{DAY_NAMES[dayOfWeek(d)].slice(0, 3)}</p>
                <p className={`mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-amber-600 text-white" : ""}`}>
                  {Number(d.slice(8))}
                </p>
              </div>
            );
          })}
        </div>

        {/* Cuerpo */}
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-stone-400"
                style={{ top: (h - startHour) * 60 * PX_PER_MIN }}
              >
                {h > startHour ? `${String(h).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayAppointments = appointments.filter((a) => a.localDate === d);
            return (
              <div
                key={d}
                role="button"
                tabIndex={-1}
                aria-label={`Nuevo turno el ${d}`}
                onClick={(e) => e.target === e.currentTarget && onEmpty(d)}
                className={`relative cursor-pointer border-l border-stone-100 ${openDays.has(dayOfWeek(d)) ? "" : "bg-stone-50"}`}
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX_PER_MIN - 1}px, #f0eeec ${60 * PX_PER_MIN - 1}px, #f0eeec ${60 * PX_PER_MIN}px)`,
                }}
              >
                {d === today && nowMinutes > startHour * 60 && nowMinutes < endHour * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-amber-600"
                    style={{ top: (nowMinutes - startHour * 60) * PX_PER_MIN }}
                  />
                )}
                {dayAppointments.map((a) => {
                  const top = (toMinutes(a.localStart) - startHour * 60) * PX_PER_MIN;
                  const h = Math.max((toMinutes(a.localEnd) - toMinutes(a.localStart)) * PX_PER_MIN, 22);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelect(a)}
                      className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-95 ${STATUS_STYLE[a.status]}`}
                      style={{ top: Math.max(top, 0), height: h }}
                      title={`${a.localStart} ${a.customer.name} · ${a.service.name}`}
                    >
                      {a.source === "WHATSAPP" && <span aria-label="Reservado por WhatsApp">📲 </span>}
                      <span className="font-semibold tabular-nums">{a.localStart}</span>{" "}
                      <span className="font-medium">{a.customer.name}</span>
                      {h > 34 && <span className="block truncate opacity-80">{a.service.name}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
