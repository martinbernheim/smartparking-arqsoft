import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ObjectId de 24 hex');

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  MONGO_URL: z.string().default('mongodb://localhost:27017/identity'),
  JWT_ISSUER: z.string().default('smartparking-identity'),
  JWT_EXPIRES_IN: z.coerce.number().default(3600),
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().default(10),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),
  SEED_CLIENT1_EMAIL: z.string().email().optional(),
  SEED_CLIENT1_PASSWORD: z.string().optional(),
  SEED_CLIENT1_ID: objectId.optional(),
  SEED_CLIENT2_EMAIL: z.string().email().optional(),
  SEED_CLIENT2_PASSWORD: z.string().optional(),
  SEED_CLIENT2_ID: objectId.optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => EnvSchema.parse(source);
