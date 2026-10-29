import { Client } from '@elastic/elasticsearch';
import type { EventoAuditoriaDTO } from '@smartparking/contracts';
import type { Logger } from 'winston';

export interface IAuditWriter {
  write(evento: EventoAuditoriaDTO): Promise<void>;
}

export interface AuditSearchParams {
  entidad?: string;
  entidadId?: string;
  limit?: number;
}

/**
 * AuditWriter: persiste el evento en el índice `audit-events` de Elasticsearch (la aplicación
 * nunca actualiza ni borra) y deja una línea Winston por evento.
 *
 * Idempotencia: se usa `eventId` como `_id` del documento. Una reentrega at-least-once del
 * mismo evento sobrescribe el mismo documento en lugar de duplicarlo.
 * Límite: solo garantiza unicidad por `eventId`; si el publisher genera dos eventId distintos
 * para la misma operación, se guardan ambos.
 *
 * Nota de diseño: se escribe con el cliente oficial de Elasticsearch y no con el transport
 * winston-elasticsearch, porque ese transport bufferiza (fire-and-forget), no informa del
 * resultado de la escritura y no permite fijar `_id`; eso impediría "ack solo tras escritura
 * exitosa" y la idempotencia por eventId.
 */
export class AuditWriter implements IAuditWriter {
  constructor(
    private readonly es: Client,
    private readonly index: string,
    private readonly logger: Logger,
  ) {}

  /** Crea el índice con mapping explícito si no existe (reintenta mientras ES no esté disponible). */
  async ensureIndex(retries = 30, delayMs = 2000): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const exists = await this.es.indices.exists({ index: this.index });
        if (!exists) {
          await this.es.indices.create({
            index: this.index,
            mappings: {
              properties: {
                eventId: { type: 'keyword' },
                tipo: { type: 'keyword' },
                entidad: { type: 'keyword' },
                entidadId: { type: 'keyword' },
                userId: { type: 'keyword' },
                fechaHora: { type: 'date' },
                recibidoEn: { type: 'date' },
              },
            },
          });
        }
        return;
      } catch (err) {
        const type = (err as { meta?: { body?: { error?: { type?: string } } } }).meta?.body?.error?.type;
        if (type === 'resource_already_exists_exception') return;
        if (attempt >= retries) throw err;
        this.logger.warn('Elasticsearch no disponible, reintentando', { attempt, error: String(err) });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async write(evento: EventoAuditoriaDTO): Promise<void> {
    await this.es.index({
      index: this.index,
      id: evento.eventId,
      document: { ...evento, recibidoEn: new Date().toISOString() },
    });
    this.logger.info('audit_event_stored', { ...evento });
  }

  /** Consulta de solo lectura (demo). */
  async search({ entidad, entidadId, limit = 50 }: AuditSearchParams): Promise<unknown[]> {
    const filter: object[] = [];
    if (entidad) filter.push({ term: { entidad } });
    if (entidadId) filter.push({ term: { entidadId } });
    const res = await this.es.search({
      index: this.index,
      size: Math.min(Math.max(limit, 1), 200),
      query: { bool: { filter } },
      sort: [{ fechaHora: { order: 'desc' } }],
    });
    return res.hits.hits.map((h) => h._source);
  }
}
