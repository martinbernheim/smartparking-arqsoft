import { describe, it, expect, vi } from 'vitest';
import type { ConsumeMessage } from 'amqplib';
import winston from 'winston';
import { AuditConsumer } from '../src/consumer/audit-consumer';

const logger = winston.createLogger({ silent: true });
const valid = {
  eventId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  tipo: 'CREAR',
  entidad: 'reserva',
  entidadId: 'r1',
  userId: 'u1',
  fechaHora: '2026-01-01T10:00:00.000Z',
};
const msg = (body: unknown): ConsumeMessage =>
  ({
    content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    fields: { routingKey: 'reserva.creada' },
    properties: {},
  }) as any;

const build = (write = vi.fn().mockResolvedValue(undefined), writeRetries = 2) => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const consumer = new AuditConsumer({
    url: 'amqp://x',
    exchange: 'smartparking.events',
    queue: 'audit-log',
    prefetch: 50,
    writeRetries,
    retryBaseMs: 10,
    writer: { write },
    logger,
    sleep,
  });
  const ch = { ack: vi.fn(), nack: vi.fn() };
  return { consumer, ch, write, sleep };
};

describe('AuditConsumer.handle', () => {
  it('mensaje valido -> writer.write y ack', async () => {
    const { consumer, ch, write } = build();
    const m = msg(valid);
    await consumer.handle(ch, m);
    expect(write).toHaveBeenCalledWith(valid);
    expect(ch.ack).toHaveBeenCalledWith(m);
    expect(ch.nack).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON roto', '{no-json'],
    ['falta campo', { ...valid, userId: undefined }],
    ['tipo invalido', { ...valid, tipo: 'X' }],
  ])('invalido (%s) -> nack sin requeue (DLQ), sin escribir', async (_n, body) => {
    const { consumer, ch, write } = build();
    const m = msg(body);
    await consumer.handle(ch, m);
    expect(write).not.toHaveBeenCalled();
    expect(ch.nack).toHaveBeenCalledWith(m, false, false);
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('fallo transitorio de escritura -> reintenta con backoff y luego ack', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('es down')).mockResolvedValue(undefined);
    const { consumer, ch, sleep } = build(write);
    const m = msg(valid);
    await consumer.handle(ch, m);
    expect(write).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(ch.ack).toHaveBeenCalledWith(m);
    expect(ch.nack).not.toHaveBeenCalled();
  });

  it('fallo persistente -> agota reintentos y nack a DLQ (sin ack)', async () => {
    const write = vi.fn().mockRejectedValue(new Error('es down'));
    const { consumer, ch, sleep } = build(write, 2);
    const m = msg(valid);
    await consumer.handle(ch, m);
    expect(write).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
    expect(ch.nack).toHaveBeenCalledWith(m, false, false);
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('mensaje null (cancelacion del consumidor) se ignora', async () => {
    const { consumer, ch } = build();
    await consumer.handle(ch, null);
    expect(ch.ack).not.toHaveBeenCalled();
    expect(ch.nack).not.toHaveBeenCalled();
  });
});

describe('AuditConsumer topologia y conexion', () => {
  it('declara exchange topic durable, DLX/DLQ y binding # con prefetch', async () => {
    const { consumer } = build();
    const c = { assertExchange: vi.fn(), assertQueue: vi.fn(), bindQueue: vi.fn(), prefetch: vi.fn() };
    await consumer.setupTopology(c as any);
    expect(c.assertExchange).toHaveBeenCalledWith('smartparking.events', 'topic', { durable: true });
    expect(c.assertExchange).toHaveBeenCalledWith('smartparking.events.dlx', 'direct', { durable: true });
    expect(c.assertQueue).toHaveBeenCalledWith('audit-log.dlq', { durable: true });
    expect(c.assertQueue).toHaveBeenCalledWith('audit-log', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'smartparking.events.dlx', 'x-dead-letter-routing-key': 'audit-log.dlq' },
    });
    expect(c.bindQueue).toHaveBeenCalledWith('audit-log', 'smartparking.events', '#');
    expect(c.prefetch).toHaveBeenCalledWith(50);
  });

  it('reintenta conectar con backoff si RabbitMQ esta caido y luego queda conectado', async () => {
    const ch = { assertExchange: vi.fn(), assertQueue: vi.fn(), bindQueue: vi.fn(), prefetch: vi.fn(), consume: vi.fn() };
    const conn = { createChannel: vi.fn().mockResolvedValue(ch), on: vi.fn(), close: vi.fn() };
    const connect = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(conn);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const consumer = new AuditConsumer({
      url: 'amqp://x',
      exchange: 'smartparking.events',
      queue: 'audit-log',
      prefetch: 50,
      writeRetries: 1,
      retryBaseMs: 1,
      writer: { write: vi.fn() },
      logger,
      connect,
      sleep,
    });
    expect(consumer.isConnected()).toBe(false);
    await consumer.start();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(consumer.isConnected()).toBe(true);
    expect(ch.consume).toHaveBeenCalledWith('audit-log', expect.any(Function), { noAck: false });
  });
});
