import { hostname } from 'node:os';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  // Por defecto la réplica es la propia primaria (D6).
  DATABASE_REPLICA_URL: z.string().min(1).optional(),
  IDENTITY_BASE_URL: z.string().default('http://localhost:3001'),
  JWKS_URL: z.string().optional(),
  JWKS_CACHE_TTL_SECONDS: z.coerce.number().default(300),
  JWT_ISSUER: z.string().default('smartparking-identity'),
  AUDIT_PUBLISHER: z.string().default('log'),
  AUDIT_EXCHANGE: z.string().default('smartparking.events'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  REDIS_URL: z.string().optional(),
  CACHE_TTL_SECONDS: z.coerce.number().default(30),
  INSTANCE_ID: z.string().default(hostname()),
  SEED_CLIENT1_EMAIL: z.string().email().optional(),
  SEED_CLIENT1_ID: z.string().optional(),
  SEED_CLIENT2_EMAIL: z.string().email().optional(),
  SEED_CLIENT2_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { JWKS_URL: string; DATABASE_REPLICA_URL: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const e = EnvSchema.parse(source);
  return {
    ...e,
    JWKS_URL: e.JWKS_URL ?? `${e.IDENTITY_BASE_URL.replace(/\/$/, '')}/.well-known/jwks.json`,
    DATABASE_REPLICA_URL: e.DATABASE_REPLICA_URL ?? e.DATABASE_URL,
  };
}
