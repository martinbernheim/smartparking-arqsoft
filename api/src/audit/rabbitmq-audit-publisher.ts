import amqp from 'amqplib';
import { routingKeyFor, type EventoAuditoriaDTO } from '@smartparking/contracts';
import { logger } from '../logger';
import type { IAuditEventPublisher } from './audit-event-publisher';

// Subconjunto de amqplib que usamos (permite simular el canal en los tests).
export interface ConfirmChannelLike {
  assertExchange(name: string, type: string, opts: { durable: boolean }): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    opts: Record<string, unknown>,
    cb: (err: unknown) => void,
  ): boolean;
  on(event: 'error' | 'close', listener: (e?: unknown) => void): unknown;
}
export interface ConnectionLike {
  createConfirmChannel(): Promise<ConfirmChannelLike>;
  on(event: 'error' | 'close', listener: (e?: unknown) => void): unknown;
  close(): Promise<void>;
}

export interface RabbitMqAuditOptions {
  url: string;
  exchange: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  connectTimeoutMs?: number;
  connect?: (url: string) => Promise<ConnectionLike>;
  sleep?: (ms: number) => Promise<void>;
}

// Adapter RabbitMQ del puerto IAuditEventPublisher (ADR-01): exchange topic durable, mensajes persistentes,
// espera de confirm del broker, reintentos con backoff exponencial y reconexión perezosa.
// Si agota los reintentos registra AUDIT_PUBLISH_FAILED (consecuencia negativa aceptada en ADR-01)
// y resuelve igualmente: la auditoría nunca hace fallar la petición HTTP.
export class RabbitMqAuditPublisher implements IAuditEventPublisher {
  private channel: ConfirmChannelLike | null = null;
  private connection: ConnectionLike | null = null;
  private connecting: Promise<ConfirmChannelLike> | null = null;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly connectTimeoutMs: number;
  private readonly connectFn: (url: string) => Promise<ConnectionLike>;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: RabbitMqAuditOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 200;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 3000;
    this.connectFn = opts.connect ?? ((url) => amqp.connect(url) as unknown as Promise<ConnectionLike>);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async publicar(evento: EventoAuditoriaDTO): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const ch = await this.getChannel();
        await this.publishWithConfirm(ch, evento);
        return;
      } catch (e) {
        lastError = e;
        this.reset(); // fuerza reconexión en el siguiente intento
        if (attempt < this.maxAttempts) await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    logger.error('AUDIT_PUBLISH_FAILED', {
      evento,
      attempts: this.maxAttempts,
      reason: (lastError as Error)?.message ?? String(lastError),
    });
  }

  async close(): Promise<void> {
    const conn = this.connection;
    this.channel = null;
    this.connection = null;
    await conn?.close().catch(() => undefined);
  }

  private publishWithConfirm(ch: ConfirmChannelLike, evento: EventoAuditoriaDTO): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        ch.publish(
          this.opts.exchange,
          routingKeyFor(evento),
          Buffer.from(JSON.stringify(evento)),
          { persistent: true, contentType: 'application/json', messageId: evento.eventId },
          (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()),
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  private getChannel(): Promise<ConfirmChannelLike> {
    if (this.channel) return Promise.resolve(this.channel);
    if (!this.connecting) {
      this.connecting = this.open().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async open(): Promise<ConfirmChannelLike> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('timeout conectando a RabbitMQ')), this.connectTimeoutMs);
    });
    try {
      const conn = await Promise.race([this.connectFn(this.opts.url), timeout]);
      conn.on('error', (e) => logger.warn('RabbitMQ: error de conexión', { reason: (e as Error)?.message }));
      conn.on('close', () => {
        if (this.connection === conn) {
          logger.warn('RabbitMQ: conexión cerrada, se reconectará en la próxima publicación');
          this.connection = null;
          this.channel = null;
        }
      });
      try {
        const ch = await conn.createConfirmChannel();
        ch.on('error', () => undefined);
        ch.on('close', () => {
          if (this.channel === ch) this.channel = null;
        });
        await ch.assertExchange(this.opts.exchange, 'topic', { durable: true });
        this.connection = conn;
        this.channel = ch;
        return ch;
      } catch (e) {
        await conn.close().catch(() => undefined);
        throw e;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private reset() {
    const conn = this.connection;
    this.channel = null;
    this.connection = null;
    conn?.close().catch(() => undefined);
  }
}
