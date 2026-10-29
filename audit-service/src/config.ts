import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3003),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  AUDIT_INDEX: z.string().default('audit-events'),
  AUDIT_EXCHANGE: z.string().default('smartparking.events'),
  AUDIT_QUEUE: z.string().default('audit-log'),
  AUDIT_PREFETCH: z.coerce.number().int().positive().default(50),
  AUDIT_WRITE_RETRIES: z.coerce.number().int().min(0).default(5),
  AUDIT_RETRY_BASE_MS: z.coerce.number().int().positive().default(200),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => EnvSchema.parse(source);
