import { z } from 'zod';

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  /** recent: última visita · frequent: más visitas · inactive: hace más tiempo que no vienen · name */
  sort: z.enum(['recent', 'frequent', 'inactive', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80).optional(),
    phone: z.string().trim().min(8, 'Teléfono inválido').max(25).optional(),
    notes: z
      .string()
      .trim()
      .max(1000, 'Las notas no pueden superar los 1000 caracteres')
      .transform((v) => (v.length ? v : null))
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'No se envió ningún campo para actualizar');
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
