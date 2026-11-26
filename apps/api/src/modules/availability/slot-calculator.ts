import { localToUtc, minutesToTime, timeToMinutes } from '../../common/time.js';

/**
 * Cálculo puro de horarios disponibles (sin base de datos), para poder testearlo a fondo
 * y reutilizarlo tanto al listar opciones como al validar una reserva.
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface BarberDaySchedule {
  barberId: string;
  /** Franjas del día en hora local ("HH:mm") */
  ranges: { startTime: string; endTime: string }[];
  /** Turnos activos y bloqueos que afectan a este barbero */
  busy: Interval[];
}

export interface SlotCalculationInput {
  /** Fecha local "YYYY-MM-DD" */
  date: string;
  timezone: string;
  durationMinutes: number;
  stepMinutes: number;
  /** No se ofrecen turnos que empiecen antes de este instante (ahora + anticipación mínima) */
  notBefore: Date;
  barbers: BarberDaySchedule[];
}

export interface Slot {
  start: Date;
  end: Date;
  /** Hora local de inicio "HH:mm" */
  localTime: string;
  /** Barberos libres en ese horario */
  barberIds: string[];
}

export type PeriodKey = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface Period {
  key: PeriodKey;
  label: string;
  slots: Slot[];
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export function calculateSlots(input: SlotCalculationInput): Slot[] {
  const byStart = new Map<number, Slot>();

  for (const barber of input.barbers) {
    for (const range of barber.ranges) {
      const rangeEnd = timeToMinutes(range.endTime);

      for (
        let m = timeToMinutes(range.startTime);
        m + input.durationMinutes <= rangeEnd;
        m += input.stepMinutes
      ) {
        const localTime = minutesToTime(m);
        const start = localToUtc(input.date, localTime, input.timezone);
        if (start < input.notBefore) continue;

        const candidate = { start, end: new Date(start.getTime() + input.durationMinutes * 60_000) };
        if (barber.busy.some((b) => overlaps(candidate, b))) continue;

        const existing = byStart.get(start.getTime());
        if (existing) existing.barberIds.push(barber.barberId);
        else byStart.set(start.getTime(), { ...candidate, localTime, barberIds: [barber.barberId] });
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Agrupa por franja del día (Mañana / Tarde / Noche) según los cortes de la barbería.
 * Omite las franjas sin horarios. Es el formato que usan las listas de WhatsApp.
 */
export function groupByPeriod(
  slots: Slot[],
  cuts: { afternoonStartsAt: string; eveningStartsAt: string },
): Period[] {
  const afternoon = timeToMinutes(cuts.afternoonStartsAt);
  const evening = timeToMinutes(cuts.eveningStartsAt);
  const periods: Period[] = [
    { key: 'MORNING', label: 'Mañana', slots: [] },
    { key: 'AFTERNOON', label: 'Tarde', slots: [] },
    { key: 'EVENING', label: 'Noche', slots: [] },
  ];
  for (const slot of slots) {
    const m = timeToMinutes(slot.localTime);
    periods[m < afternoon ? 0 : m < evening ? 1 : 2].slots.push(slot);
  }
  return periods.filter((p) => p.slots.length > 0);
}
