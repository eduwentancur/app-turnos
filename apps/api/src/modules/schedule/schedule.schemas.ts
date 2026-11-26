import { z } from 'zod';
import { DATE_REGEX, TIME_REGEX, timeToMinutes } from '../../common/time.js';

const time = z.string().regex(TIME_REGEX, 'Hora inválida, usá el formato HH:mm');
const date = z.string().regex(DATE_REGEX, 'Fecha inválida, usá el formato AAAA-MM-DD');
const barberId = z.uuid('barberId inválido').nullable().optional();

const range = z
  .object({ startTime: time, endTime: time })
  .refine((r) => timeToMinutes(r.endTime) > timeToMinutes(r.startTime), {
    message: 'La hora de cierre debe ser posterior a la de apertura',
  });

const day = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    ranges: z.array(range).max(4, 'Máximo 4 franjas por día'),
  })
  .superRefine((d, ctx) => {
    const sorted = [...d.ranges].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].startTime) < timeToMinutes(sorted[i - 1].endTime)) {
        ctx.addIssue({ code: 'custom', message: 'Las franjas de un mismo día no pueden superponerse' });
        return;
      }
    }
  });

export const replaceWeekSchema = z
  .object({
    barberId,
    days: z.array(day).max(7),
  })
  .refine((w) => new Set(w.days.map((d) => d.dayOfWeek)).size === w.days.length, {
    message: 'Hay días repetidos',
  });
export type ReplaceWeekInput = z.infer<typeof replaceWeekSchema>;

export const weekQuerySchema = z.object({ barberId: z.uuid().optional() });
export type WeekQuery = z.infer<typeof weekQuerySchema>;

export const createTimeOffSchema = z
  .object({
    barberId,
    startDate: date,
    endDate: date,
    /** Sin horas = día completo */
    startTime: time.optional(),
    endTime: time.optional(),
    reason: z.string().trim().max(120).optional(),
  })
  .refine((t) => (t.startTime === undefined) === (t.endTime === undefined), {
    message: 'Indicá hora de inicio y de fin, o ninguna para bloquear el día completo',
  })
  .refine((t) => t.endDate >= t.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
  });
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;

export const listTimeOffsQuerySchema = z.object({
  /** Por defecto: desde hoy */
  from: date.optional(),
});
export type ListTimeOffsQuery = z.infer<typeof listTimeOffsQuerySchema>;
