import express from 'express';
import type { AuditConsumer } from './consumer/audit-consumer';
import type { AuditWriter } from './writer/audit-writer';

export const createApp = (deps: {
  consumer: Pick<AuditConsumer, 'isConnected'>;
  writer: Pick<AuditWriter, 'search'>;
}) => {
  const app = express();

  app.get('/health', (_req, res) => {
    const rabbit = deps.consumer.isConnected();
    res.status(rabbit ? 200 : 503).json({ status: rabbit ? 'ok' : 'degraded', rabbitmq: rabbit });
  });

  // Solo lectura, para demo. La auditoría se escribe únicamente vía RabbitMQ.
  app.get('/audit/events', async (req, res) => {
    const { entidad, entidadId } = req.query;
    const limit = Number(req.query.limit ?? 50);
    try {
      const events = await deps.writer.search({
        entidad: typeof entidad === 'string' ? entidad : undefined,
        entidadId: typeof entidadId === 'string' ? entidadId : undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json({ count: events.length, events });
    } catch (err) {
      res.status(502).json({ error: 'elasticsearch_unavailable', detail: String(err) });
    }
  });

  return app;
};
