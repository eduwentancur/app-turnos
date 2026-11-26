import type { PeriodKey } from './slot-calculator.js';

export interface SlotResponse {
  start: string;
  end: string;
  localTime: string;
  barberIds: string[];
}

export interface DayAvailabilityResponse {
  date: string;
  timezone: string;
  service: { id: string; name: string; durationMinutes: number; price: number };
  periods: { key: PeriodKey; label: string; slots: SlotResponse[] }[];
  totalSlots: number;
}

export interface DaySummary {
  date: string;
  dayOfWeek: number;
  availableSlots: number;
}

export interface DaysAvailabilityResponse {
  timezone: string;
  service: { id: string; name: string; durationMinutes: number; price: number };
  days: DaySummary[];
}
