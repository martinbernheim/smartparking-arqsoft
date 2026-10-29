import { createApp } from './app';
import { createAuditPublisher } from './audit/audit.factory';
import { JwksClient } from './auth/jwks-client';
import { PrismaClienteRepository } from './clientes/cliente.repository';
import { CacheService, createRedisClient } from './cache/cache.service';
import { loadEnv } from './config/env';
import { closeDb, createDb } from './db/prisma';
import { UserAdminClient } from './identity/user-admin.client';
import { logger } from './logger';
import { PrismaReservaRepository } from './reservas/reserva.repository';
import { PrismaVehiculoRepository } from './vehiculos/vehiculo.repository';

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, env.DATABASE_REPLICA_URL);
  await db.primary.$connect();
  logger.info('Conectado a PostgreSQL', { replicaSeparada: db.replica !== db.primary });

  let ready = true;
  const app = createApp({
    env,
    jwks: new JwksClient(env.JWKS_URL, env.JWKS_CACHE_TTL_SECONDS * 1000),
    clientes: new PrismaClienteRepository(db),
    vehiculos: new PrismaVehiculoRepository(db),
    reservas: new PrismaReservaRepository(db),
    userAdmin: new UserAdminClient(env.IDENTITY_BASE_URL),
    audit: createAuditPublisher(env.AUDIT_PUBLISHER, { rabbitmqUrl: env.RABBITMQ_URL, exchange: env.AUDIT_EXCHANGE }),
    cache: new CacheService(env.REDIS_URL ? createRedisClient(env.REDIS_URL) : null, env.CACHE_TTL_SECONDS),
    isReady: () => ready,
  });

  const server = app.listen(env.PORT, () =>
    logger.info('API escuchando', { port: env.PORT, instance: env.INSTANCE_ID, audit: env.AUDIT_PUBLISHER, cache: Boolean(env.REDIS_URL) }),
  );

  const shutdown = () => {
    ready = false;
    server.close(() => closeDb(db).finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  logger.error('Fallo al iniciar', { reason: e?.message, stack: e?.stack });
  process.exit(1);
});
