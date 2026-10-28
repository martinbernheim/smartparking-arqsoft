import mongoose from 'mongoose';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { loadKeyPair } from './keys/key-provider';
import { MongoUserRepository } from './users/user.repository';
import { PasswordHasher } from './users/password-hasher';
import { seedUsers } from './seed/seed-users';
import { logger } from './logger';

async function main() {
  const env = loadEnv();
  const keys = loadKeyPair(env.JWT_PRIVATE_KEY_PATH, env.JWT_PUBLIC_KEY_PATH);
  await mongoose.connect(env.MONGO_URL);
  logger.info('Conectado a Identity DB');

  const repo = new MongoUserRepository();
  await seedUsers(env, repo, new PasswordHasher(env.BCRYPT_ROUNDS));

  const app = createApp({ env, keys, repo, isReady: () => mongoose.connection.readyState === 1 });
  app.listen(env.PORT, () => logger.info('Identity Service escuchando', { port: env.PORT, kid: keys.kid }));
}

main().catch((e) => {
  logger.error('Fallo al iniciar', { message: e?.message, stack: e?.stack });
  process.exit(1);
});
