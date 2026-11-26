export interface Slot {
  start: string;
  end: string;
  localTime: string;
  barberIds: string[];
}

export interface Period {
  key: "MORNING" | "AFTERNOON" | "EVENING";
  label: string;
  slots: Slot[];
}

export interface DayAvailability {
  date: string;
  timezone: string;
  service: { id: string; name: string; durationMinutes: number; price: number };
  periods: Period[];
  totalSlots: number;
}

export interface DaySummary {
  date: string;
  dayOfWeek: number;
  availableSlots: number;
}

export interface DaysAvailability {
  timezone: string;
  days: DaySummary[];
}
