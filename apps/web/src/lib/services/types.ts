export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInput {
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
}

/** Límite de WhatsApp para el título de una fila de lista. */
export const SERVICE_NAME_MAX = 24;
