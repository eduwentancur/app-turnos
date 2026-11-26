const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const formatPrice = (value: number) => ars.format(value);

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-12-24" -> "jue, 24 dic" (sin corrimientos por zona horaria) */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return dayFormatter.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Fecha de hoy en una zona horaria, como "YYYY-MM-DD". */
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const fromMinutes = (minutes: number) => {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 55));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};
