export interface TimeRange {
  startTime: string;
  endTime: string;
}

export interface WeekDay {
  dayOfWeek: number;
  ranges: TimeRange[];
}

export interface WeekResponse {
  barberId: string | null;
  timezone: string;
  days: WeekDay[];
}

export interface TimeOffResponse {
  id: string;
  barberId: string | null;
  startsAt: string;
  endsAt: string;
  /** Representación local para mostrar */
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  reason: string | null;
  /** Turnos activos que caen dentro del bloqueo (solo al crear) */
  conflictingAppointments?: number;
}
