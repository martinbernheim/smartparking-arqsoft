// Publica un EventoAuditoriaDTO de ejemplo en smartparking.events con routing key reserva.creada.
// Uso: RABBITMQ_URL=amqp://guest:guest@localhost:5672 npx tsx scripts/publish-test-event.ts [routingKey]
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { EventoAuditoriaDTOSchema } from '@smartparking/contracts';

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchange = process.env.AUDIT_EXCHANGE ?? 'smartparking.events';
const routingKey = process.argv[2] ?? 'reserva.creada';

(async () => {
  const evento = EventoAuditoriaDTOSchema.parse({
    eventId: randomUUID(),
    tipo: 'CREAR',
    entidad: 'reserva',
    entidadId: 'demo-reserva-1',
    userId: 'demo-user-1',
    fechaHora: new Date().toISOString(),
  });
  const conn = await amqp.connect(url);
  const ch = await conn.createConfirmChannel();
  await ch.assertExchange(exchange, 'topic', { durable: true });
  ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(evento)), {
    persistent: true,
    contentType: 'application/json',
  });
  await ch.waitForConfirms();
  console.log('publicado', routingKey, evento);
  await ch.close();
  await conn.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
