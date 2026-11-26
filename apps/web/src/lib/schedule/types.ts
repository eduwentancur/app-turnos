export interface TimeRange {
  startTime: string;
  endTime: string;
}

export interface WeekDay {
  dayOfWeek: number;
  ranges: TimeRange[];
}

export interface Week {
  barberId: string | null;
  timezone: string;
  days: WeekDay[];
}

export interface TimeOff {
  id: string;
  barberId: string | null;
  startsAt: string;
  endsAt: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  reason: string | null;
  conflictingAppointments?: number;
}

export interface TimeOffInput {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

/** Orden de visualización: lunes primero. */
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
