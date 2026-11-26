export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  source: "ADMIN" | "WHATSAPP";
  startsAt: string;
  endsAt: string;
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

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

export interface CreateAppointmentInput {
  serviceId: string;
  startsAt: string;
  customerId?: string;
  customer?: { name: string; phone: string };
  notes?: string;
  allowOutsideSchedule?: boolean;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Atendido",
  NO_SHOW: "No vino",
};

export const STATUS_STYLE: Record<AppointmentStatus, string> = {
  PENDING: "border-amber-400 bg-amber-50 text-amber-900",
  CONFIRMED: "border-stone-800 bg-stone-900 text-white",
  CANCELLED: "border-stone-300 bg-stone-100 text-stone-400 line-through",
  COMPLETED: "border-emerald-500 bg-emerald-50 text-emerald-900",
  NO_SHOW: "border-red-400 bg-red-50 text-red-800",
};
