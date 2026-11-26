import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** Variables opcionales: una línea vacía en el .env ("CLAVE=") cuenta como no definida. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

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

  // WhatsApp Cloud API (opcionales: sin ellas funciona todo menos el número real)
  WHATSAPP_VERIFY_TOKEN: optional(z.string().min(8, 'WHATSAPP_VERIFY_TOKEN: usá al menos 8 caracteres')),
  WHATSAPP_APP_SECRET: optional(z.string().min(16)),
  WHATSAPP_ACCESS_TOKEN: optional(z.string().min(20)),
  WHATSAPP_PHONE_NUMBER_ID: optional(z.string().regex(/^\d+$/, 'WHATSAPP_PHONE_NUMBER_ID debe ser numérico')),
  /** Barbería a la que pertenece el número (por slug) */
  WHATSAPP_BARBERSHOP_SLUG: optional(z.string().min(1)),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v25.0'),

  // Transcripción de audios (Whisper local, sin costo por uso)
  TRANSCRIPTION_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  TRANSCRIPTION_MODEL: z.string().min(1).default('onnx-community/whisper-small'),
  /** Carpeta donde se guarda el modelo descargado (~250 MB la primera vez) */
  TRANSCRIPTION_CACHE_DIR: optional(z.string().min(1)),
  TRANSCRIPTION_MAX_SECONDS: z.coerce.number().int().min(5).max(300).default(90),
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
