import type { Service } from '../../generated/prisma/client.js';

export interface ServiceResponse {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toServiceResponse(service: Service): ServiceResponse {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes,
    price: Number(service.price.toString()),
    isActive: service.isActive,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}
