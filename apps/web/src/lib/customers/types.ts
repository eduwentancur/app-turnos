import type { AppointmentStatus } from "@/lib/appointments/types";

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  visits: number;
  totalSpent: number;
  cancellations: number;
  noShows: number;
  lastVisit: string | null;
  nextAppointment: { id: string; startsAt: string; localDate: string; localStart: string } | null;
  createdAt: string;
}

export interface CustomerHistoryItem {
  id: string;
  status: AppointmentStatus;
  startsAt: string;
  localDate: string;
  localStart: string;
  service: string;
  barber: string;
  price: number;
  guestName: string | null;
}

export type CustomerDetail = CustomerSummary & { history: CustomerHistoryItem[] };

export interface CustomerPage {
  items: CustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerSort = "recent" | "frequent" | "inactive" | "name";
