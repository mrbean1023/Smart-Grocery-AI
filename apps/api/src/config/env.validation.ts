import { z } from 'zod';

/**
 * Environment validation — runs once at bootstrap via ConfigModule `validate`.
 * Fails fast with a clear message listing every missing/invalid variable.
 *
 * Truly required (no sane default possible): DATABASE_URL, REDIS_URL,
 * JWT_ACCESS_SECRET, JWT_REFRESH_SECRET. Everything else is optional with
 * sane development defaults.
 */

const booleanString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === ''
        ? defaultValue
        : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
    );

export const envSchema = z.object({
  // ---- Core ----
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),

  // ---- Required infrastructure ----
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required (e.g. redis://localhost:6379)'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),

  // ---- Optional infrastructure ----
  ELASTICSEARCH_NODE: z.string().url().optional(),

  // ---- JWT TTLs (seconds) ----
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  // ---- Google OAuth ----
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ---- OpenAI ----
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // ---- Google Cloud (Vision OCR) ----
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ---- AWS / S3 ----
  AWS_REGION: z.string().default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('smart-grocery-uploads'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: booleanString(false),

  // ---- Stripe ----
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PREMIUM_YEARLY: z.string().optional(),

  // ---- SMTP ----
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Smart Grocery AI <no-reply@smartgrocery.sg>'),

  // ---- Observability ----
  SENTRY_DSN: z.string().optional(),
  PROMETHEUS_ENABLED: booleanString(true),

  // ---- Freemium ----
  FREEMIUM_ENFORCED: booleanString(true),
  FREE_TIER_SCANS_PER_MONTH: z.coerce.number().int().min(0).default(5),
  FREE_TIER_OPTIMIZATIONS_PER_DAY: z.coerce.number().int().min(0).default(1),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * ConfigModule `validate` hook. Empty-string values are treated as unset so
 * that blank lines in .env templates fall back to defaults.
 */
export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const cleaned = Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed. Fix the following variables (see .env.example):\n${problems}`,
    );
  }
  return result.data;
}
