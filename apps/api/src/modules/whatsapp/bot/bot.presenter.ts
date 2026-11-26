import type { WeekDay } from '../../schedule/schedule.types.js';

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const SHORT_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LONG_DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const price = (value: number) => ars.format(value).replace(/ /g, ' ');

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dow = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** "2026-11-18" -> "Mié 18/11" */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${SHORT_DAYS[dow(date)]} ${d}/${m}`;
}

/** "2026-11-18" -> "18/11/2026" */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-11-18" -> "miércoles 18/11" */
export function dayAndDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${LONG_DAYS[dow(date)]} ${d}/${m}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Resumen de horarios agrupando días iguales: "Lun a Vie: 09:00 a 13:00 y 16:00 a 20:00" */
export function weeklyHours(days: WeekDay[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const describe = (d: number) => {
    const ranges = days.find((x) => x.dayOfWeek === d)?.ranges ?? [];
    return ranges.length ? ranges.map((r) => `${r.startTime} a ${r.endTime}`).join(' y ') : 'Cerrado';
  };
  const groups: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    const t = describe(d);
    const last = groups.at(-1);
    if (last && last.text === t) last.to = d;
    else groups.push({ from: d, to: d, text: t });
  }
  return groups
    .map((g) => {
      const label = g.from === g.to ? SHORT_DAYS[g.from] : `${SHORT_DAYS[g.from]} a ${SHORT_DAYS[g.to]}`;
      return `• ${label}: ${g.text}`;
    })
    .join('\n');
}

export function mapsLink(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}
