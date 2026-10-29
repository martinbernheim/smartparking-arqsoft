import { describe, expect, it, vi } from 'vitest';
import type { ConsumeMessage } from 'amqplib';
import winston from 'winston';
import { ProjectionConsumer } from '../src/consumer/projection-consumer';

const logger = winston.createLogger({ silent: true });
const valid = {
  eventId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tipo: 'CREAR',
  entidad: 'Reserva',
  entidadId: 'r1',
  userId: 'u1',
  fechaHora: '2026-01-01T10:00:00.000Z',
};
const msg = (body: unknown): ConsumeMessage =>
  ({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), fields: { routingKey: 'reserva.creada' }, properties: {} }) as any;

const build = (handler = vi.fn().mockResolvedValue(undefined)) => {
  const consumer = new ProjectionConsumer({
    url: 'amqp://x', exchange: 'smartparking.events', queue: 'read-model.reservas',
    routingKeys: ['reserva.*', 'vehiculo.*'], prefetch: 1, retries: 2, retryBaseMs: 1,
    handler, logger, sleep: vi.fn().mockResolvedValue(undefined),
  });
  return { consumer, handler, ch: { ack: vi.fn(), nack: vi.fn() } };
};

describe('ProjectionConsumer', () => {
  it('evento válido -> handler y ack', async () => {
    const { consumer, ch, handler } = build();
    const m = msg(valid);
    await consumer.handle(ch, m);
    expect(handler).toHaveBeenCalledWith(valid);
    expect(ch.ack).toHaveBeenCalledWith(m);
  });
  it('payload inválido -> nack sin requeue (DLQ)', async () => {
    const { consumer, ch, handler } = build();
    await consumer.handle(ch, msg('{roto'));
    expect(handler).not.toHaveBeenCalled();
    expect(ch.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
  it('fallo transitorio reintenta y luego ack; persistente -> DLQ', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const a = build(flaky);
    await a.consumer.handle(a.ch, msg(valid));
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(a.ch.ack).toHaveBeenCalled();

    const b = build(vi.fn().mockRejectedValue(new Error('down')));
    await b.consumer.handle(b.ch, msg(valid));
    expect(b.ch.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
  it('topología: bindings selectivos (no #) y DLQ propia', async () => {
    const { consumer } = build();
    const ch = { assertExchange: vi.fn(), assertQueue: vi.fn(), bindQueue: vi.fn(), prefetch: vi.fn() };
    await consumer.setupTopology(ch as any);
    const bound = ch.bindQueue.mock.calls.filter((c) => c[0] === 'read-model.reservas').map((c) => c[2]);
    expect(bound).toEqual(['reserva.*', 'vehiculo.*']);
    expect(ch.assertQueue).toHaveBeenCalledWith('read-model.reservas.dlq', { durable: true });
  });
});
