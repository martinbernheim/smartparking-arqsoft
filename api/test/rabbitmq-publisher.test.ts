import { describe, expect, it, vi } from 'vitest';
import { routingKeyFor, type EventoAuditoriaDTO } from '@smartparking/contracts';
import { emitirAuditoria } from '../src/audit/audit-event-publisher';
import {
  RabbitMqAuditPublisher,
  type ConfirmChannelLike,
  type ConnectionLike,
} from '../src/audit/rabbitmq-audit-publisher';
import { logger } from '../src/logger';

const evento = (over: Partial<EventoAuditoriaDTO> = {}): EventoAuditoriaDTO => ({
  eventId: '3f1b8a3e-5d5b-4a53-9a8e-0a0d6d1f8c11',
  tipo: 'CREAR',
  entidad: 'Reserva',
  entidadId: 'e1',
  userId: 'u1',
  fechaHora: '2026-11-10T10:00:00.000Z',
  ...over,
});

function fakeBroker(opts: { publishFailures?: number; connectFailures?: number } = {}) {
  let publishFailures = opts.publishFailures ?? 0;
  let connectFailures = opts.connectFailures ?? 0;
  const published: { exchange: string; key: string; body: any; opts: any }[] = [];
  const asserted: unknown[][] = [];
  let connects = 0;
  const channel: ConfirmChannelLike = {
    assertExchange: async (...a) => void asserted.push(a),
    publish: (exchange, key, content, o, cb) => {
      if (publishFailures > 0) {
        publishFailures--;
        cb(new Error('nack'));
      } else {
        published.push({ exchange, key, body: JSON.parse(content.toString()), opts: o });
        cb(null);
      }
      return true;
    },
    on: () => undefined,
  };
  const conn: ConnectionLike = { createConfirmChannel: async () => channel, on: () => undefined, close: async () => undefined };
  const connect = vi.fn(async () => {
    connects++;
    if (connectFailures > 0) {
      connectFailures--;
      throw new Error('ECONNREFUSED');
    }
    return conn;
  });
  return { connect, published, asserted, connects: () => connects };
}

const mk = (b: ReturnType<typeof fakeBroker>, extra = {}) => {
  const sleeps: number[] = [];
  const pub = new RabbitMqAuditPublisher({
    url: 'amqp://x',
    exchange: 'smartparking.events',
    connect: b.connect,
    sleep: async (ms) => void sleeps.push(ms),
    ...extra,
  });
  return { pub, sleeps };
};

describe('routingKeyFor', () => {
  it.each([
    [{ tipo: 'CREAR', entidad: 'Reserva' }, 'reserva.creada'],
    [{ tipo: 'MODIFICAR', entidad: 'Reserva' }, 'reserva.modificada'],
    [{ tipo: 'CANCELAR', entidad: 'Reserva' }, 'reserva.cancelada'],
    [{ tipo: 'CREAR', entidad: 'Cliente' }, 'cliente.creado'],
    [{ tipo: 'ELIMINAR', entidad: 'Vehiculo' }, 'vehiculo.eliminado'],
  ] as const)('%j -> %s', (e, key) => expect(routingKeyFor(e)).toBe(key));
});

describe('RabbitMqAuditPublisher', () => {
  it('declara exchange topic durable y publica persistente con confirm', async () => {
    const b = fakeBroker();
    const { pub } = mk(b);
    const e = evento();
    await pub.publicar(e);
    expect(b.asserted[0]).toEqual(['smartparking.events', 'topic', { durable: true }]);
    expect(b.published).toHaveLength(1);
    expect(b.published[0].key).toBe('reserva.creada');
    expect(b.published[0].body).toEqual(e);
    expect(b.published[0].opts).toEqual({ persistent: true, contentType: 'application/json', messageId: e.eventId });
  });

  it('reutiliza la conexión entre publicaciones', async () => {
    const b = fakeBroker();
    const { pub } = mk(b);
    await pub.publicar(evento());
    await pub.publicar(evento({ tipo: 'CANCELAR' }));
    expect(b.connects()).toBe(1);
    expect(b.published.map((p) => p.key)).toEqual(['reserva.creada', 'reserva.cancelada']);
  });

  it('reintenta con backoff exponencial y termina publicando', async () => {
    const b = fakeBroker({ publishFailures: 2 });
    const { pub, sleeps } = mk(b, { baseDelayMs: 100 });
    const err = vi.spyOn(logger, 'error');
    await pub.publicar(evento());
    expect(b.published).toHaveLength(1);
    expect(sleeps).toEqual([100, 200]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('tras agotar reintentos registra AUDIT_PUBLISH_FAILED con el evento y no lanza', async () => {
    const b = fakeBroker({ connectFailures: 99 });
    const { pub } = mk(b);
    const err = vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    const e = evento();
    await expect(pub.publicar(e)).resolves.toBeUndefined();
    expect(b.connect).toHaveBeenCalledTimes(3);
    expect(err).toHaveBeenCalledWith('AUDIT_PUBLISH_FAILED', expect.objectContaining({ evento: e, attempts: 3 }));
    err.mockRestore();
  });

  it('una petición no falla aunque RabbitMQ esté caído (emitirAuditoria)', async () => {
    const b = fakeBroker({ connectFailures: 99 });
    const { pub } = mk(b);
    const err = vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    expect(() => emitirAuditoria(pub, 'CREAR', 'Reserva', 'r1', 'u1')).not.toThrow();
    await vi.waitFor(() => expect(err).toHaveBeenCalledWith('AUDIT_PUBLISH_FAILED', expect.anything()));
    err.mockRestore();
  });

  it('reconecta tras un fallo y publica de nuevo', async () => {
    const b = fakeBroker({ connectFailures: 1 });
    const { pub } = mk(b);
    await pub.publicar(evento());
    expect(b.connects()).toBe(2);
    expect(b.published).toHaveLength(1);
  });
});
