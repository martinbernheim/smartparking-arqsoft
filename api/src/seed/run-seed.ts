import { loadEnv } from '../config/env';
import { closeDb, createDb } from '../db/prisma';
import { logger } from '../logger';
import { seed } from './seed';

// npm run seed (también se ejecuta al iniciar el contenedor, tras las migraciones).
async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, env.DATABASE_URL);
  try {
    await seed(db.primary, env);
  } finally {
    await closeDb(db);
  }
}

main().catch((e) => {
  logger.error('Fallo en seed', { reason: e?.message, stack: e?.stack });
  process.exit(1);
});
