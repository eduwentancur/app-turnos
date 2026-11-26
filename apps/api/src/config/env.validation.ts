import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL es obligatoria')
    .refine(
      (v) => v.startsWith('postgresql://') || v.startsWith('postgres://'),
      { message: 'DATABASE_URL debe ser una URL de PostgreSQL' },
    ),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  // Auth
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres')
    .refine((v) => !v.startsWith('CAMBIAR'), {
      message: 'JWT_ACCESS_SECRET tiene el valor de ejemplo: generá uno propio',
    }),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: booleanString,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al iniciar.
 * Si falta o es inválida alguna, la app no arranca (fail fast).
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}
