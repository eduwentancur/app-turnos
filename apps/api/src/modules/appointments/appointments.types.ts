import type { AppointmentSource, AppointmentStatus } from '../../generated/prisma/enums.js';

export interface AppointmentResponse {
  id: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  startsAt: string;
  endsAt: string;
  /** Fecha y horas en la zona horaria de la barbería, listas para mostrar */
  localDate: string;
  localStart: string;
  localEnd: string;
  service: { id: string; name: string; durationMinutes: number };
  barber: { id: string; name: string };
  customer: { id: string; name: string; phone: string; notes: string | null };
  price: number;
  notes: string | null;
  cancelledAt: string | null;
  createdAt: string;
}
