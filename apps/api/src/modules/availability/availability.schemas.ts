import { z } from 'zod';
import { DATE_REGEX } from '../../common/time.js';

const date = z.string().regex(DATE_REGEX, 'Fecha inválida, usá el formato AAAA-MM-DD');

export const dayAvailabilityQuerySchema = z.object({
  serviceId: z.uuid('serviceId inválido'),
  date,
  barberId: z.uuid('barberId inválido').optional(),
});
export type DayAvailabilityQuery = z.infer<typeof dayAvailabilityQuerySchema>;

export const daysAvailabilityQuerySchema = z.object({
  serviceId: z.uuid('serviceId inválido'),
  /** Por defecto: hoy */
  from: date.optional(),
  days: z.coerce.number().int().min(1).max(31).default(14),
  barberId: z.uuid('barberId inválido').optional(),
});
export type DaysAvailabilityQuery = z.infer<typeof daysAvailabilityQuerySchema>;
