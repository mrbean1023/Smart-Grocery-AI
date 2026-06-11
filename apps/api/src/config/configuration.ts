/**
 * Typed configuration loader. Registered via ConfigModule.forRoot({ load }).
 *
 * Access pattern (used across the codebase — keep keys stable):
 *   configService.get<string>('webUrl')
 *   configService.getOrThrow<string>('jwt.accessSecret')
 *   configService.get<number>('jwt.accessTtl', 900)
 *
 * Available keys:
 *   nodeEnv, port, webUrl, apiUrl, databaseUrl, redisUrl, elasticsearchNode,
 *   jwt.{accessSecret,refreshSecret,accessTtl,refreshTtl},
 *   google.{clientId,clientSecret},
 *   openai.{apiKey,chatModel,embeddingModel},
 *   gcp.credentialsPath,
 *   aws.{region,accessKeyId,secretAccessKey,s3Bucket,s3Endpoint,s3ForcePathStyle},
 *   stripe.{secretKey,webhookSecret,priceMonthly,priceYearly},
 *   smtp.{host,port,user,pass,from},
 *   sentryDsn, prometheusEnabled,
 *   freemium.{enforced,scansPerMonth,optimizationsPerDay}
 */

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const orUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

export interface AppConfig {
  nodeEnv: string;
  port: number;
  webUrl: string;
  apiUrl: string;
  databaseUrl: string | undefined;
  redisUrl: string;
  elasticsearchNode: string | undefined;
  jwt: {
    accessSecret: string | undefined;
    refreshSecret: string | undefined;
    accessTtl: number;
    refreshTtl: number;
  };
  google: { clientId: string | undefined; clientSecret: string | undefined };
  openai: { apiKey: string | undefined; chatModel: string; embeddingModel: string };
  gcp: { credentialsPath: string | undefined };
  aws: {
    region: string;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    s3Bucket: string;
    s3Endpoint: string | undefined;
    s3ForcePathStyle: boolean;
  };
  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
    priceMonthly: string | undefined;
    priceYearly: string | undefined;
  };
  smtp: {
    host: string;
    port: number;
    user: string | undefined;
    pass: string | undefined;
    from: string;
  };
  sentryDsn: string | undefined;
  prometheusEnabled: boolean;
  freemium: { enforced: boolean; scansPerMonth: number; optimizationsPerDay: number };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.API_PORT, 4000),
  webUrl: orUndefined(process.env.WEB_URL) ?? 'http://localhost:3000',
  apiUrl: orUndefined(process.env.API_URL) ?? 'http://localhost:4000',
  databaseUrl: orUndefined(process.env.DATABASE_URL),
  redisUrl: orUndefined(process.env.REDIS_URL) ?? 'redis://localhost:6379',
  elasticsearchNode: orUndefined(process.env.ELASTICSEARCH_NODE),
  jwt: {
    accessSecret: orUndefined(process.env.JWT_ACCESS_SECRET),
    refreshSecret: orUndefined(process.env.JWT_REFRESH_SECRET),
    accessTtl: toInt(process.env.JWT_ACCESS_TTL, 900),
    refreshTtl: toInt(process.env.JWT_REFRESH_TTL, 2_592_000),
  },
  google: {
    clientId: orUndefined(process.env.GOOGLE_CLIENT_ID),
    clientSecret: orUndefined(process.env.GOOGLE_CLIENT_SECRET),
  },
  openai: {
    apiKey: orUndefined(process.env.OPENAI_API_KEY),
    chatModel: orUndefined(process.env.OPENAI_CHAT_MODEL) ?? 'gpt-4o-mini',
    embeddingModel: orUndefined(process.env.OPENAI_EMBEDDING_MODEL) ?? 'text-embedding-3-small',
  },
  gcp: { credentialsPath: orUndefined(process.env.GOOGLE_APPLICATION_CREDENTIALS) },
  aws: {
    region: orUndefined(process.env.AWS_REGION) ?? 'ap-southeast-1',
    accessKeyId: orUndefined(process.env.AWS_ACCESS_KEY_ID),
    secretAccessKey: orUndefined(process.env.AWS_SECRET_ACCESS_KEY),
    s3Bucket: orUndefined(process.env.S3_BUCKET) ?? 'smart-grocery-uploads',
    s3Endpoint: orUndefined(process.env.S3_ENDPOINT),
    s3ForcePathStyle: toBool(process.env.S3_FORCE_PATH_STYLE, false),
  },
  stripe: {
    secretKey: orUndefined(process.env.STRIPE_SECRET_KEY),
    webhookSecret: orUndefined(process.env.STRIPE_WEBHOOK_SECRET),
    priceMonthly: orUndefined(process.env.STRIPE_PRICE_PREMIUM_MONTHLY),
    priceYearly: orUndefined(process.env.STRIPE_PRICE_PREMIUM_YEARLY),
  },
  smtp: {
    host: orUndefined(process.env.SMTP_HOST) ?? 'localhost',
    port: toInt(process.env.SMTP_PORT, 1025),
    user: orUndefined(process.env.SMTP_USER),
    pass: orUndefined(process.env.SMTP_PASS),
    from: orUndefined(process.env.SMTP_FROM) ?? 'Smart Grocery AI <no-reply@smartgrocery.sg>',
  },
  sentryDsn: orUndefined(process.env.SENTRY_DSN),
  prometheusEnabled: toBool(process.env.PROMETHEUS_ENABLED, true),
  freemium: {
    enforced: toBool(process.env.FREEMIUM_ENFORCED, true),
    scansPerMonth: toInt(process.env.FREE_TIER_SCANS_PER_MONTH, 5),
    optimizationsPerDay: toInt(process.env.FREE_TIER_OPTIMIZATIONS_PER_DAY, 1),
  },
});
