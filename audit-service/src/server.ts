import { Client } from '@elastic/elasticsearch';
import { createApp } from './app';
import { loadEnv } from './config';
import { logger } from './logger';
import { AuditConsumer } from './consumer/audit-consumer';
import { AuditWriter } from './writer/audit-writer';

const main = async () => {
  const env = loadEnv();
  const es = new Client({ node: env.ELASTICSEARCH_URL });
  const writer = new AuditWriter(es, env.AUDIT_INDEX, logger);
  const consumer = new AuditConsumer({
    url: env.RABBITMQ_URL,
    exchange: env.AUDIT_EXCHANGE,
    queue: env.AUDIT_QUEUE,
    prefetch: env.AUDIT_PREFETCH,
    writeRetries: env.AUDIT_WRITE_RETRIES,
    retryBaseMs: env.AUDIT_RETRY_BASE_MS,
    writer,
    logger,
  });

  const server = createApp({ consumer, writer }).listen(env.PORT, () =>
    logger.info('audit-service escuchando', { port: env.PORT }),
  );

  await writer.ensureIndex();
  void consumer.start(); // reintenta con backoff si RabbitMQ aún no está listo

  const shutdown = async () => {
    await consumer.stop();
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((err) => {
  logger.error('Fallo al iniciar audit-service', { error: String(err) });
  process.exit(1);
});
