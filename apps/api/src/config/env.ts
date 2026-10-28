import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CONFIG_ENCRYPTION_KEY: z.string().optional().default(''),
  FILE_SIGNING_SECRET: z.string().min(16, 'FILE_SIGNING_SECRET es obligatorio'),
  STORAGE_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Saldio POS <no-reply@example.invalid>'),
  BOOTSTRAP_ENABLED: bool,
  AUTO_APPROVE_STORES: bool,
  PAYMENTS_PROVIDER: z.string().default('test'),
  PAYMENTS_WEBHOOK_SECRET: z.string().optional().default(''),
  PAYMENTS_MODE: z.enum(['test', 'production']).default('test'),
  FISCAL_PROVIDER: z.string().default('disabled'),
  FISCAL_MODE: z.enum(['test', 'production']).default('test'),
  SUPPORT_SESSION_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuracion invalida: ${details}`);
  }
  return result.data;
}

export function corsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
