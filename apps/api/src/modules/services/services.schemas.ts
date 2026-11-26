import { z } from 'zod';

/**
 * Límites pensados para WhatsApp: el nombre es el título de una fila de lista
 * interactiva (máx. 24 caracteres).
 */
export const SERVICE_NAME_MAX = 24;

const name = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(SERVICE_NAME_MAX, `El nombre no puede superar los ${SERVICE_NAME_MAX} caracteres (límite de WhatsApp)`);

const description = z
  .string()
  .trim()
  .max(200, 'La descripción no puede superar los 200 caracteres')
  .transform((v) => (v.length ? v : null))
  .nullable();

const durationMinutes = z.coerce
  .number({ error: 'La duración debe ser un número' })
  .int('La duración debe ser un número entero de minutos')
  .min(5, 'La duración mínima es de 5 minutos')
  .max(480, 'La duración máxima es de 8 horas')
  .refine((v) => v % 5 === 0, 'La duración debe ser múltiplo de 5 minutos');

const price = z.coerce
  .number({ error: 'El precio debe ser un número' })
  .min(0, 'El precio no puede ser negativo')
  .max(99_999_999, 'El precio es demasiado alto')
  .refine((v) => Number.isInteger(Number((v * 100).toFixed(6))), 'El precio admite hasta 2 decimales');

export const createServiceSchema = z.object({
  name,
  description: description.optional(),
  durationMinutes,
  price,
  isActive: z.boolean().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'No se envió ningún campo para actualizar');
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
