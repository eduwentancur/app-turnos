import { z } from 'zod';

const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede superar los 128 caracteres');

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Email inválido')),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
    newPassword: password,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'La nueva contraseña debe ser distinta a la actual',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
