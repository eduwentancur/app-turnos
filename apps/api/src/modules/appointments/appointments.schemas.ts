import { z } from 'zod';
import { DATE_REGEX } from '../../common/time.js';

const date = z.string().regex(DATE_REGEX, 'Fecha inválida, usá el formato AAAA-MM-DD');
const instant = z.iso
  .datetime({ offset: true, message: 'Fecha y hora inválidas (ISO 8601 con zona horaria)' })
  .transform((v) => new Date(v));

const customer = z.object({
  name: z.string().trim().min(2, 'Ingresá el nombre del cliente').max(80),
  phone: z.string().trim().min(8, 'Ingresá un teléfono válido').max(25),
});

export const createAppointmentSchema = z
  .object({
    serviceId: z.uuid('serviceId inválido'),
    startsAt: instant,
    barberId: z.uuid('barberId inválido').optional(),
    customerId: z.uuid('customerId inválido').optional(),
    customer: customer.optional(),
    notes: z.string().trim().max(300).optional(),
    /** Solo OWNER: permite reservar fuera del horario de atención (igual se evitan choques). */
    allowOutsideSchedule: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.customerId) !== Boolean(d.customer), {
    message: 'Indicá un cliente existente (customerId) o los datos de uno nuevo (customer)',
    path: ['customer'],
  });
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const listAppointmentsQuerySchema = z
  .object({
    from: date,
    to: date,
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
    barberId: z.uuid().optional(),
    includeCancelled: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .refine((q) => q.to >= q.from, { message: '"to" no puede ser anterior a "from"', path: ['to'] });
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const rescheduleSchema = z.object({
  startsAt: instant,
  barberId: z.uuid().optional(),
  allowOutsideSchedule: z.boolean().optional(),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const cancelSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type CancelInput = z.infer<typeof cancelSchema>;

export const statusSchema = z.object({
  status: z.enum(['CONFIRMED', 'COMPLETED', 'NO_SHOW']),
});
export type StatusInput = z.infer<typeof statusSchema>;
