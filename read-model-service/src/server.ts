import { MongoClient } from 'mongodb';
import { createApp } from './app';
import { JwksClient } from './auth/jwks-client';
import { loadEnv } from './config';
import { ProjectionConsumer } from './consumer/projection-consumer';
import { logger } from './logger';
import { Projector } from './projection/projector';
import { MongoReadModelStore } from './store/mongo-store';

const main = async () => {
  const env = loadEnv();
  const mongo = new MongoClient(env.READMODEL_MONGO_URL);
  await mongo.connect();
  const store = new MongoReadModelStore(mongo.db(env.READMODEL_DB));
  await store.ensureIndexes();

  const projector = new Projector(store);
  const consumer = new ProjectionConsumer({
    url: env.RABBITMQ_URL,
    exchange: env.READMODEL_EXCHANGE,
    queue: env.READMODEL_QUEUE,
    routingKeys: env.READMODEL_ROUTING_KEYS.split(',').map((k) => k.trim()).filter(Boolean),
    prefetch: env.READMODEL_PREFETCH,
    retries: env.READMODEL_RETRIES,
    retryBaseMs: env.READMODEL_RETRY_BASE_MS,
    handler: async (evento) => {
      const r = await projector.apply(evento);
      logger.debug('Evento proyectado', { eventId: evento.eventId, resultado: r });
    },
    logger,
  });

  const jwks = new JwksClient(env.JWKS_URL, env.JWKS_CACHE_TTL_SECONDS * 1000);
  const server = createApp({ jwks, issuer: env.JWT_ISSUER, store, projector, isReady: () => consumer.isConnected() }).listen(
    env.PORT,
    () => logger.info('read-model-service escuchando', { port: env.PORT }),
  );

  void consumer.start(); // reintenta con backoff si RabbitMQ aún no está listo

  const shutdown = async () => {
    await consumer.stop();
    server.close();
    await mongo.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((err) => {
  logger.error('Fallo al iniciar read-model-service', { error: String(err) });
  process.exit(1);
});
