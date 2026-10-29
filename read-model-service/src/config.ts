import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3004),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  READMODEL_EXCHANGE: z.string().default('smartparking.events'),
  READMODEL_QUEUE: z.string().default('read-model.reservas'),
  // Solo lo que alimenta la proyección (NO '#'). cliente.* aporta nombre/email/identityUserId.
  READMODEL_ROUTING_KEYS: z.string().default('reserva.*,vehiculo.*,cliente.*'),
  READMODEL_PREFETCH: z.coerce.number().int().positive().default(1), // 1 = proyección serial
  READMODEL_RETRIES: z.coerce.number().int().min(0).default(3),
  READMODEL_RETRY_BASE_MS: z.coerce.number().int().positive().default(200),
  // Base DERIVADA y reconstruible, separada de la de Identity (misma instancia de MongoDB).
  READMODEL_MONGO_URL: z.string().default('mongodb://localhost:27017'),
  READMODEL_DB: z.string().default('smartparking_read'),
  JWKS_URL: z.string().default('http://localhost:3001/.well-known/jwks.json'),
  JWKS_CACHE_TTL_SECONDS: z.coerce.number().default(300),
  JWT_ISSUER: z.string().default('smartparking-identity'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => EnvSchema.parse(source);
