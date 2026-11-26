import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "09:30" -> 570 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Fecha y hora locales de la barbería -> instante UTC. */
export function localToUtc(date: string, time: string, timezone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(+new TZDate(y, mo - 1, d, h, mi, timezone));
}

/** Instante UTC -> fecha y hora locales de la barbería. */
export function utcToLocal(instant: Date, timezone: string): { date: string; time: string } {
  const local = new TZDate(instant, timezone);
  return { date: format(local, 'yyyy-MM-dd'), time: format(local, 'HH:mm') };
}

/** Suma días a una fecha "YYYY-MM-DD" (sin depender de la zona horaria). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}
