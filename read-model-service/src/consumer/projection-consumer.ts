import amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';
import { EventoAuditoriaDTOSchema, type EventoAuditoriaDTO } from '@smartparking/contracts';
import type { Logger } from 'winston';

export interface ProjectionConsumerOptions {
  url: string;
  exchange: string; // smartparking.events (topic, durable)
  queue: string; // read-model.reservas
  routingKeys: string[]; // p. ej. reserva.*, vehiculo.*, cliente.* (NO '#')
  prefetch: number;
  retries: number;
  retryBaseMs: number;
  handler: (evento: EventoAuditoriaDTO) => Promise<unknown>;
  logger: Logger;
  /** Inyectables para tests. */
  connect?: (url: string) => Promise<any>;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Segundo suscriptor del exchange `smartparking.events` (Pub/Sub): cola propia y durable con bindings
 * selectivos, de modo que Audit (`#`) y el modelo de lectura reciben cada evento de forma independiente.
 * ack manual tras proyectar; payload inválido o fallo persistente -> DLQ (`<queue>.dlq`).
 */
export class ProjectionConsumer {
  private connection: any = null;
  private channel: Channel | null = null;
  private stopped = false;
  private connected = false;
  private reconnecting = false;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly connectFn: (url: string) => Promise<any>;

  constructor(private readonly opts: ProjectionConsumerOptions) {
    this.sleep = opts.sleep ?? defaultSleep;
    this.connectFn = opts.connect ?? ((url) => amqp.connect(url));
  }

  get dlx(): string {
    return `${this.opts.exchange}.dlx`;
  }
  get dlq(): string {
    return `${this.opts.queue}.dlq`;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async start(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    let delay = 1000;
    try {
      while (!this.stopped) {
        try {
          await this.connectOnce();
          return;
        } catch (err) {
          this.opts.logger.warn('RabbitMQ no disponible, reintentando', { error: String(err), retryInMs: delay });
          await this.sleep(delay);
          delay = Math.min(delay * 2, 30000);
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private async connectOnce(): Promise<void> {
    const conn = await this.connectFn(this.opts.url);
    try {
      const ch: Channel = await conn.createChannel();
      await this.setupTopology(ch);
      await ch.consume(this.opts.queue, (msg) => void this.handle(ch, msg), { noAck: false });
      this.connection = conn;
      this.channel = ch;
      this.connected = true;
    } catch (err) {
      await conn.close().catch(() => undefined);
      throw err;
    }
    conn.on('error', (e: unknown) => this.opts.logger.error('Error de conexión RabbitMQ', { error: String(e) }));
    conn.on('close', () => {
      if (this.connection !== conn) return;
      this.connected = false;
      this.connection = null;
      this.channel = null;
      if (this.stopped) return;
      this.opts.logger.warn('Conexión RabbitMQ perdida, reconectando');
      void this.start();
    });
    this.opts.logger.info('ProjectionConsumer suscripto', {
      queue: this.opts.queue,
      exchange: this.opts.exchange,
      routingKeys: this.opts.routingKeys,
    });
  }

  async setupTopology(ch: Channel): Promise<void> {
    const { exchange, queue, prefetch, routingKeys } = this.opts;
    await ch.assertExchange(exchange, 'topic', { durable: true });
    await ch.assertExchange(this.dlx, 'direct', { durable: true });
    await ch.assertQueue(this.dlq, { durable: true });
    await ch.bindQueue(this.dlq, this.dlx, this.dlq);
    await ch.assertQueue(queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': this.dlx, 'x-dead-letter-routing-key': this.dlq },
    });
    for (const key of routingKeys) await ch.bindQueue(queue, exchange, key);
    await ch.prefetch(prefetch);
  }

  /** Público para poder testearlo con un canal simulado. */
  async handle(ch: Pick<Channel, 'ack' | 'nack'>, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    const { logger, handler, retries, retryBaseMs } = this.opts;

    let evento: EventoAuditoriaDTO;
    try {
      evento = EventoAuditoriaDTOSchema.parse(JSON.parse(msg.content.toString('utf8')));
    } catch (err) {
      logger.warn('Evento inválido, enviado a DLQ', { routingKey: msg.fields.routingKey, error: String(err) });
      ch.nack(msg, false, false);
      return;
    }

    for (let attempt = 0; ; attempt++) {
      try {
        await handler(evento);
        ch.ack(msg);
        return;
      } catch (err) {
        if (attempt >= retries) {
          logger.error('Proyección fallida tras reintentos, enviado a DLQ', { eventId: evento.eventId, error: String(err) });
          ch.nack(msg, false, false);
          return;
        }
        const wait = retryBaseMs * 2 ** attempt;
        logger.warn('Fallo al proyectar, reintentando', { eventId: evento.eventId, attempt: attempt + 1, waitMs: wait });
        await this.sleep(wait);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      /* ya cerrado */
    }
  }
}
